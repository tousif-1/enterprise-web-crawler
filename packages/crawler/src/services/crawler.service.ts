import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import robotsParser from 'robots-parser';
import { URL } from 'url';
import { CrawlConfig, CrawlResult, Link, Issue } from '@enterprise-web-crawler/shared';
import { URLValidator } from '../utils/url-validator';
import { RateLimiter } from '../utils/rate-limiter';
import { LinkExtractor } from '../utils/link-extractor';
import { UrlPatternMatcher } from '../utils/url-pattern-matcher';
import { Logger } from '../utils/logger';

export interface CrawlStatus {
  sessionId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: {
    totalUrls: number;
    processedUrls: number;
    failedUrls: number;
  };
  startTime: Date;
  endTime?: Date;
}

export class CrawlerService {
  protected browser: Browser | null = null;
  private rateLimiter: RateLimiter;
  private urlValidator: URLValidator;
  private linkExtractor: LinkExtractor;
  private urlPatternMatcher: UrlPatternMatcher;
  private logger: Logger;
  private activeSessions: Map<string, CrawlStatus> = new Map();
  private robotsCache: Map<string, any> = new Map();

  constructor() {
    this.rateLimiter = new RateLimiter();
    this.urlValidator = new URLValidator();
    this.linkExtractor = new LinkExtractor();
    this.urlPatternMatcher = new UrlPatternMatcher();
    this.logger = new Logger('CrawlerService');
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      this.logger.info('Puppeteer browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Puppeteer browser', error);
      throw error;
    }
  }

  async startCrawl(sessionId: string, config: CrawlConfig): Promise<CrawlStatus> {
    if (!this.browser) {
      await this.initialize();
    }

    // Validate URLs
    const validUrls = await this.validateUrls(config.urls);
    if (validUrls.length === 0) {
      throw new Error('No valid URLs provided for crawling');
    }

    const crawlStatus: CrawlStatus = {
      sessionId,
      status: 'running',
      progress: {
        totalUrls: validUrls.length,
        processedUrls: 0,
        failedUrls: 0
      },
      startTime: new Date()
    };

    this.activeSessions.set(sessionId, crawlStatus);
    this.logger.info(`Started crawl session ${sessionId} with ${validUrls.length} URLs`);

    // Start crawling asynchronously
    this.performCrawl(sessionId, config, validUrls).catch(error => {
      this.logger.error(`Crawl session ${sessionId} failed`, error);
      const status = this.activeSessions.get(sessionId);
      if (status) {
        status.status = 'failed';
        status.endTime = new Date();
      }
    });

    return crawlStatus;
  }

  async pauseCrawl(sessionId: string): Promise<void> {
    const status = this.activeSessions.get(sessionId);
    if (!status) {
      throw new Error(`Crawl session ${sessionId} not found`);
    }

    status.status = 'paused';
    this.logger.info(`Paused crawl session ${sessionId}`);
  }

  async resumeCrawl(sessionId: string): Promise<void> {
    const status = this.activeSessions.get(sessionId);
    if (!status) {
      throw new Error(`Crawl session ${sessionId} not found`);
    }

    if (status.status !== 'paused') {
      throw new Error(`Cannot resume crawl session ${sessionId} - current status: ${status.status}`);
    }

    status.status = 'running';
    this.logger.info(`Resumed crawl session ${sessionId}`);
  }

  getCrawlStatus(sessionId: string): CrawlStatus | null {
    return this.activeSessions.get(sessionId) || null;
  }

  private async validateUrls(urls: string[]): Promise<string[]> {
    const validUrls: string[] = [];
    
    for (const url of urls) {
      if (this.urlValidator.isValid(url)) {
        validUrls.push(url);
      } else {
        this.logger.warn(`Invalid URL skipped: ${url}`);
      }
    }

    return validUrls;
  }

  private async performCrawl(sessionId: string, config: CrawlConfig, urls: string[]): Promise<void> {
    const status = this.activeSessions.get(sessionId);
    if (!status) return;

    const semaphore = new Array(config.concurrency).fill(null);
    const urlQueue = [...urls];
    const processedUrls = new Set<string>();
    const discoveredUrls = new Set<string>();

    // Add initial URLs to discovered set
    urls.forEach(url => discoveredUrls.add(url));

    const processBatch = async (): Promise<void> => {
      const promises = semaphore.map(async () => {
        while (urlQueue.length > 0 && status.status === 'running') {
          const url = urlQueue.shift();
          if (!url || processedUrls.has(url)) continue;

          try {
            await this.rateLimiter.waitForSlot(url);
            const result = await this.crawlUrl(url, config);
            
            if (result) {
              processedUrls.add(url);
              status.progress.processedUrls++;

              // Extract and queue new links if within depth limit
              if (config.maxDepth > 1) {
                const newLinks = await this.extractLinks(result, config);
                newLinks.forEach(link => {
                  if (!discoveredUrls.has(link.url) && !processedUrls.has(link.url)) {
                    discoveredUrls.add(link.url);
                    urlQueue.push(link.url);
                    status.progress.totalUrls++;
                  }
                });
              }
            } else {
              status.progress.failedUrls++;
            }
          } catch (error) {
            this.logger.error(`Failed to crawl URL ${url}`, error);
            status.progress.failedUrls++;
          }
        }
      });

      await Promise.all(promises);
    };

    await processBatch();

    // Mark session as completed
    status.status = 'completed';
    status.endTime = new Date();
    this.logger.info(`Completed crawl session ${sessionId}`);
  }

  protected async crawlUrl(url: string, config: CrawlConfig): Promise<CrawlResult | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Check robots.txt if required
    if (config.respectRobots && !(await this.isAllowedByRobots(url))) {
      this.logger.info(`URL blocked by robots.txt: ${url}`);
      return null;
    }

    // Check exclusion paths using pattern matcher
    if (this.isExcludedByPatterns(url, config.excludePaths)) {
      this.logger.info(`URL excluded by path filter: ${url}`);
      return null;
    }

    const page = await this.browser.newPage();
    const startTime = Date.now();

    try {
      // Set user agent and viewport
      await page.setUserAgent('Enterprise Web Crawler 1.0');
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to URL with timeout
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      if (!response) {
        throw new Error('No response received');
      }

      const responseTime = Date.now() - startTime;
      const httpStatus = response.status();
      const content = await page.content();
      const contentHash = crypto.createHash('md5').update(content).digest('hex');

      // Extract basic issues (broken links will be handled separately)
      const issues = await this.extractBasicIssues(page, url);

      const result: CrawlResult = {
        id: crypto.randomUUID(),
        sessionId: '', // Will be set by caller
        url,
        status: httpStatus >= 200 && httpStatus < 400 ? 'success' : 'failed',
        httpStatus,
        responseTime,
        contentHash,
        lastModified: new Date(),
        issues,
        accessibilityScore: 0, // Will be calculated by accessibility analyzer
        createdAt: new Date()
      };

      return result;
    } catch (error) {
      this.logger.error(`Error crawling URL ${url}`, error);
      return null;
    } finally {
      await page.close();
    }
  }

  private async extractLinks(result: CrawlResult, config: CrawlConfig): Promise<Link[]> {
    if (!this.browser) return [];

    const page = await this.browser.newPage();
    try {
      await page.goto(result.url, { waitUntil: 'networkidle2', timeout: 30000 });
      const content = await page.content();
      return this.linkExtractor.extractLinks(content, result.url);
    } catch (error) {
      this.logger.error(`Failed to extract links from ${result.url}`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  protected async extractBasicIssues(page: Page, url: string): Promise<Issue[]> {
    const issues: Issue[] = [];

    try {
      // Check for missing images
      const images = await page.$$eval('img', imgs => 
        imgs.map(img => ({
          src: (img as any).src,
          alt: (img as any).alt,
          naturalWidth: (img as any).naturalWidth,
          naturalHeight: (img as any).naturalHeight
        }))
      );

      for (const img of images) {
        if (img.naturalWidth === 0 && img.naturalHeight === 0) {
          issues.push({
            id: crypto.randomUUID(),
            type: 'missing_image',
            severity: 'high',
            description: `Missing or broken image: ${img.src}`,
            element: `img[src="${img.src}"]`
          });
        }

        if (!img.alt) {
          issues.push({
            id: crypto.randomUUID(),
            type: 'accessibility',
            severity: 'medium',
            description: `Image missing alt text: ${img.src}`,
            element: `img[src="${img.src}"]`,
            wcagGuideline: 'WCAG 2.2 AA - 1.1.1 Non-text Content'
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to extract basic issues from ${url}`, error);
    }

    return issues;
  }

  protected async isAllowedByRobots(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
      
      // Check cache first
      if (this.robotsCache.has(robotsUrl)) {
        const robots = this.robotsCache.get(robotsUrl);
        return robots.isAllowed(url, 'Enterprise Web Crawler') ?? true;
      }

      // Fetch and parse robots.txt
      const response = await fetch(robotsUrl);
      if (!response.ok) {
        // If robots.txt doesn't exist, allow crawling
        return true;
      }

      const robotsTxt = await response.text();
      const robots = robotsParser(robotsUrl, robotsTxt);
      
      // Cache the robots parser
      this.robotsCache.set(robotsUrl, robots);
      
      return robots.isAllowed(url, 'Enterprise Web Crawler') ?? true;
    } catch (error) {
      this.logger.warn(`Failed to check robots.txt for ${url}`, error);
      // If we can't check robots.txt, allow crawling
      return true;
    }
  }

  protected isExcludedByPatterns(url: string, excludePaths: string[]): boolean {
    try {
      // Update pattern matcher with current exclusion paths
      this.urlPatternMatcher.setPatterns(excludePaths);
      
      // Check if URL matches any exclusion pattern
      const result = this.urlPatternMatcher.matches(url);
      
      if (result.matches) {
        this.logger.debug(`URL ${url} matched exclusion pattern: ${result.matchedPattern?.pattern} (${result.matchedPart})`);
      }
      
      return result.matches;
    } catch (error) {
      this.logger.warn(`Failed to check URL exclusion patterns for: ${url}`, error);
      return false;
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use isExcludedByPatterns instead
   */
  protected isExcludedPath(url: string, excludePaths: string[]): boolean {
    return this.isExcludedByPatterns(url, excludePaths);
  }

  /**
   * Re-scan only failed links from a previous crawl session
   */
  async rescanFailedLinks(sessionId: string, failedUrls: string[], config: CrawlConfig): Promise<CrawlStatus> {
    if (!this.browser) {
      await this.initialize();
    }

    if (failedUrls.length === 0) {
      throw new Error('No failed URLs provided for re-scanning');
    }

    const crawlStatus: CrawlStatus = {
      sessionId: `${sessionId}_rescan`,
      status: 'running',
      progress: {
        totalUrls: failedUrls.length,
        processedUrls: 0,
        failedUrls: 0
      },
      startTime: new Date()
    };

    this.activeSessions.set(crawlStatus.sessionId, crawlStatus);
    this.logger.info(`Started failed link re-scan for session ${sessionId} with ${failedUrls.length} URLs`);

    // Start re-scanning asynchronously
    this.performFailedLinkRescan(crawlStatus.sessionId, config, failedUrls).catch(error => {
      this.logger.error(`Failed link re-scan ${crawlStatus.sessionId} failed`, error);
      const status = this.activeSessions.get(crawlStatus.sessionId);
      if (status) {
        status.status = 'failed';
        status.endTime = new Date();
      }
    });

    return crawlStatus;
  }

  /**
   * Get exclusion pattern validation results
   */
  validateExclusionPatterns(patterns: string[]): Array<{ pattern: string; valid: boolean; error?: string; type?: string }> {
    return patterns.map(pattern => {
      try {
        // Basic validation logic
        if (!pattern.trim()) {
          return { pattern, valid: false, error: 'Pattern cannot be empty' };
        }

        // Use the pattern matcher to determine type and validate
        const matcher = new UrlPatternMatcher();
        const urlPattern = matcher.parseStringPattern(pattern);
        
        // Special validation for regex patterns
        if (urlPattern.type === 'regex') {
          try {
            new RegExp(urlPattern.pattern);
          } catch (regexError) {
            return { 
              pattern, 
              valid: false, 
              error: 'Invalid regular expression: ' + (regexError instanceof Error ? regexError.message : 'Unknown error')
            };
          }
        }

        // Test pattern with a sample URL to ensure it works
        matcher.setPatterns([pattern]);
        matcher.matches('https://example.com/test/path');

        return {
          pattern,
          valid: true,
          type: urlPattern.type
        };
      } catch (error) {
        return {
          pattern,
          valid: false,
          error: error instanceof Error ? error.message : 'Invalid pattern'
        };
      }
    });
  }

  /**
   * Test exclusion patterns against a set of URLs
   */
  testExclusionPatterns(patterns: string[], testUrls: string[]): Array<{ url: string; excluded: boolean; matchedPattern?: string }> {
    this.urlPatternMatcher.setPatterns(patterns);
    
    return testUrls.map(url => {
      const result = this.urlPatternMatcher.matches(url);
      return {
        url,
        excluded: result.matches,
        matchedPattern: result.matchedPattern?.pattern
      };
    });
  }

  private async performFailedLinkRescan(sessionId: string, config: CrawlConfig, failedUrls: string[]): Promise<void> {
    const status = this.activeSessions.get(sessionId);
    if (!status) return;

    const semaphore = new Array(Math.min(config.concurrency, 3)).fill(null); // Lower concurrency for re-scans
    const urlQueue = [...failedUrls];
    const processedUrls = new Set<string>();

    const processBatch = async (): Promise<void> => {
      const promises = semaphore.map(async () => {
        while (urlQueue.length > 0 && status.status === 'running') {
          const url = urlQueue.shift();
          if (!url || processedUrls.has(url)) continue;

          try {
            // Add extra delay for failed link re-scanning to be more respectful
            await this.rateLimiter.waitForSlot(url);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Additional 1s delay
            
            const result = await this.crawlUrl(url, config);
            
            if (result) {
              processedUrls.add(url);
              status.progress.processedUrls++;
              this.logger.info(`Re-scan successful for previously failed URL: ${url}`);
            } else {
              status.progress.failedUrls++;
              this.logger.warn(`Re-scan still failed for URL: ${url}`);
            }
          } catch (error) {
            this.logger.error(`Failed to re-scan URL ${url}`, error);
            status.progress.failedUrls++;
          }
        }
      });

      await Promise.all(promises);
    };

    await processBatch();

    // Mark session as completed
    status.status = 'completed';
    status.endTime = new Date();
    this.logger.info(`Completed failed link re-scan ${sessionId}`);
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.info('Browser closed successfully');
    }
  }
}