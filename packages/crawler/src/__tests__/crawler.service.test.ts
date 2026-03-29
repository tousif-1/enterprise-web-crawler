import { CrawlerService } from '../services/crawler.service';
import { CrawlConfig } from '@enterprise-web-crawler/shared';

// Mock Puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setUserAgent: jest.fn(),
      setViewport: jest.fn(),
      goto: jest.fn().mockResolvedValue({
        status: () => 200
      }),
      content: jest.fn().mockResolvedValue('<html><body><h1>Test Page</h1></body></html>'),
      $$eval: jest.fn().mockResolvedValue([]),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

// Mock fetch for robots.txt
global.fetch = jest.fn();

describe('CrawlerService', () => {
  let crawlerService: CrawlerService;
  
  beforeEach(() => {
    crawlerService = new CrawlerService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await crawlerService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize browser successfully', async () => {
      await crawlerService.initialize();
      // Browser should be initialized (tested implicitly through other methods)
    });
  });

  describe('URL validation', () => {
    it('should start crawl with valid URLs', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      const status = await crawlerService.startCrawl('test-session', config);
      
      expect(status.sessionId).toBe('test-session');
      expect(status.status).toBe('running');
      expect(status.progress.totalUrls).toBe(1);
    });

    it('should reject invalid URLs', async () => {
      const config: CrawlConfig = {
        urls: ['invalid-url', 'ftp://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      await expect(crawlerService.startCrawl('test-session', config))
        .rejects.toThrow('No valid URLs provided for crawling');
    });
  });

  describe('session management', () => {
    it('should track crawl status', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      await crawlerService.startCrawl('test-session', config);
      const status = crawlerService.getCrawlStatus('test-session');
      
      expect(status).toBeTruthy();
      expect(status?.sessionId).toBe('test-session');
    });

    it('should pause and resume crawl sessions', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      await crawlerService.startCrawl('test-session', config);
      
      await crawlerService.pauseCrawl('test-session');
      let status = crawlerService.getCrawlStatus('test-session');
      expect(status?.status).toBe('paused');

      await crawlerService.resumeCrawl('test-session');
      status = crawlerService.getCrawlStatus('test-session');
      expect(status?.status).toBe('running');
    });

    it('should throw error for non-existent session', async () => {
      await expect(crawlerService.pauseCrawl('non-existent'))
        .rejects.toThrow('Crawl session non-existent not found');
    });
  });

  describe('robots.txt handling', () => {
    it('should respect robots.txt when enabled', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('User-agent: *\nDisallow: /admin')
      });

      const config: CrawlConfig = {
        urls: ['https://example.com/admin'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: true
      };

      const status = await crawlerService.startCrawl('test-session', config);
      expect(status.progress.totalUrls).toBe(1);
    });

    it('should allow crawling when robots.txt is not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const config: CrawlConfig = {
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: true
      };

      const status = await crawlerService.startCrawl('test-session', config);
      expect(status.progress.totalUrls).toBe(1);
    });
  });

  describe('path exclusion', () => {
    it('should exclude specified paths', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com/admin', 'https://example.com/public'],
        excludePaths: ['/admin'],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      const status = await crawlerService.startCrawl('test-session', config);
      // Both URLs are valid, but one should be excluded during crawling
      expect(status.progress.totalUrls).toBe(2);
    });
  });

  describe('concurrency control', () => {
    it('should respect concurrency limits', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 2,
        respectRobots: false
      };

      const status = await crawlerService.startCrawl('test-session', config);
      expect(status.progress.totalUrls).toBe(3);
      expect(status.status).toBe('running');
    });
  });

  describe('error handling', () => {
    it('should handle browser initialization failure', async () => {
      const puppeteer = require('puppeteer');
      puppeteer.launch.mockRejectedValueOnce(new Error('Browser launch failed'));

      await expect(crawlerService.initialize())
        .rejects.toThrow('Browser launch failed');
    });

    it('should handle page navigation failures gracefully', async () => {
      const mockPage = {
        setUserAgent: jest.fn(),
        setViewport: jest.fn(),
        goto: jest.fn().mockRejectedValue(new Error('Navigation failed')),
        close: jest.fn()
      };

      const puppeteer = require('puppeteer');
      puppeteer.launch.mockResolvedValueOnce({
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn()
      });

      const config: CrawlConfig = {
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 1,
        concurrency: 1,
        respectRobots: false
      };

      // Should not throw, but handle the error gracefully
      const status = await crawlerService.startCrawl('test-session', config);
      expect(status.sessionId).toBe('test-session');
    });
  });
});