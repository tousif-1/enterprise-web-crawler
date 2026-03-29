import { Page } from 'puppeteer';
import { CrawlerService } from './crawler.service';
import { AccessibilityAnalyzer } from './accessibility-analyzer.service';
import { CrawlResult, Issue, AccessibilityReport } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

/**
 * Enhanced crawler service that includes accessibility analysis
 */
export class EnhancedCrawlerService extends CrawlerService {
  private accessibilityAnalyzer: AccessibilityAnalyzer;

  constructor() {
    super();
    this.accessibilityAnalyzer = new AccessibilityAnalyzer();
  }

  /**
   * Enhanced crawl method that includes accessibility analysis
   */
  protected async crawlUrl(url: string, config: any): Promise<CrawlResult | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Check robots.txt if required
    if (config.respectRobots && !(await this.isAllowedByRobots(url))) {
      logger.info(`URL blocked by robots.txt: ${url}`);
      return null;
    }

    // Check exclusion paths
    if (this.isExcludedPath(url, config.excludePaths)) {
      logger.info(`URL excluded by path filter: ${url}`);
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

      // Extract basic issues
      const basicIssues = await this.extractBasicIssues(page, url);

      // Perform accessibility analysis
      let accessibilityReport: AccessibilityReport | null = null;
      let accessibilityIssues: Issue[] = [];
      let accessibilityScore = 0;

      try {
        accessibilityReport = await this.accessibilityAnalyzer.analyzePage(page, url);
        accessibilityScore = accessibilityReport.score;
        accessibilityIssues = this.convertAccessibilityViolationsToIssues(accessibilityReport);
        
        logger.info(`Accessibility analysis completed for ${url}. Score: ${accessibilityScore}, Violations: ${accessibilityReport.violations.length}`);
      } catch (error) {
        logger.error(`Accessibility analysis failed for ${url}:`, error);
        // Continue with crawl even if accessibility analysis fails
        accessibilityIssues.push({
          id: crypto.randomUUID(),
          type: 'accessibility',
          severity: 'medium',
          description: 'Accessibility analysis failed',
          element: 'page',
          wcagGuideline: 'Unknown',
          remediation: 'Manual accessibility review required'
        });
      }

      // Combine all issues
      const allIssues = [...basicIssues, ...accessibilityIssues];

      const result: CrawlResult = {
        id: crypto.randomUUID(),
        sessionId: '', // Will be set by caller
        url,
        status: httpStatus >= 200 && httpStatus < 400 ? 'success' : 'failed',
        httpStatus,
        responseTime,
        contentHash,
        lastModified: new Date(),
        issues: allIssues,
        accessibilityScore,
        createdAt: new Date()
      };

      return result;
    } catch (error) {
      logger.error(`Error crawling URL ${url}`, error);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Converts accessibility violations to Issue format
   */
  private convertAccessibilityViolationsToIssues(report: AccessibilityReport): Issue[] {
    const issues: Issue[] = [];

    // Convert violations to issues
    for (const violation of report.violations) {
      const severity = this.mapImpactToSeverity(violation.impact);
      
      // Create an issue for each node affected by the violation
      for (const node of violation.nodes) {
        issues.push({
          id: crypto.randomUUID(),
          type: 'accessibility',
          severity,
          description: `${violation.description}: ${violation.help}`,
          element: node.target.join(', '),
          wcagGuideline: `${violation.wcagGuideline} (${violation.wcagLevel})`,
          remediation: violation.remediation
        });
      }

      // If no nodes, create a general issue
      if (violation.nodes.length === 0) {
        issues.push({
          id: crypto.randomUUID(),
          type: 'accessibility',
          severity,
          description: `${violation.description}: ${violation.help}`,
          element: 'page',
          wcagGuideline: `${violation.wcagGuideline} (${violation.wcagLevel})`,
          remediation: violation.remediation
        });
      }
    }

    // Convert incomplete results to issues with lower severity
    for (const incomplete of report.incomplete) {
      const severity = incomplete.impact ? this.mapImpactToSeverity(incomplete.impact) : 'low';
      
      for (const node of incomplete.nodes) {
        issues.push({
          id: crypto.randomUUID(),
          type: 'accessibility',
          severity: severity === 'critical' || severity === 'high' ? 'medium' : 'low', // Reduce severity for incomplete
          description: `Incomplete accessibility check: ${incomplete.description}`,
          element: node.target.join(', '),
          wcagGuideline: 'Manual review required',
          remediation: `Manual review required: ${incomplete.help}. ${node.message || ''}`
        });
      }
    }

    return issues;
  }

  /**
   * Maps Axe impact levels to our severity levels
   */
  private mapImpactToSeverity(impact: 'minor' | 'moderate' | 'serious' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
    switch (impact) {
      case 'critical':
        return 'critical';
      case 'serious':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'minor':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get detailed accessibility report for a specific URL
   */
  async getAccessibilityReport(url: string): Promise<AccessibilityReport> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      await page.setUserAgent('Enterprise Web Crawler 1.0');
      await page.setViewport({ width: 1920, height: 1080 });
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      return await this.accessibilityAnalyzer.analyzePage(page, url);
    } finally {
      await page.close();
    }
  }

  /**
   * Analyze accessibility for multiple URLs
   */
  async analyzeAccessibilityBatch(urls: string[]): Promise<AccessibilityReport[]> {
    const reports: AccessibilityReport[] = [];
    
    for (const url of urls) {
      try {
        const report = await this.getAccessibilityReport(url);
        reports.push(report);
      } catch (error) {
        logger.error(`Failed to analyze accessibility for ${url}:`, error);
        // Create a failed report
        reports.push({
          url,
          violations: [],
          passes: [],
          incomplete: [],
          score: 0,
          timestamp: new Date()
        });
      }
    }

    return reports;
  }
}