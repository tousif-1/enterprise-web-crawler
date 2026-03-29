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
      content: jest.fn().mockResolvedValue('<html><body>Test</body></html>'),
      close: jest.fn(),
      $eval: jest.fn().mockResolvedValue([])
    }),
    close: jest.fn()
  })
}));

describe('CrawlerService - Path Exclusion and Filtering', () => {
  let crawlerService: CrawlerService;
  let mockConfig: CrawlConfig;

  beforeEach(async () => {
    crawlerService = new CrawlerService();
    await crawlerService.initialize();
    
    mockConfig = {
      urls: ['https://example.com'],
      excludePaths: [],
      maxDepth: 3,
      concurrency: 5,
      respectRobots: true
    };
  });

  afterEach(async () => {
    await crawlerService.shutdown();
  });

  describe('Pattern-based URL Exclusion', () => {
    it('should exclude URLs matching simple prefix patterns', async () => {
      const config = {
        ...mockConfig,
        excludePaths: ['/admin', '/private']
      };

      // Test protected method through inheritance
      class TestCrawler extends CrawlerService {
        public testIsExcluded(url: string, excludePaths: string[]): boolean {
          return this.isExcludedByPatterns(url, excludePaths);
        }
      }

      const testCrawler = new TestCrawler();
      await testCrawler.initialize();

      expect(testCrawler.testIsExcluded('https://example.com/admin', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/admin/users', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/private/docs', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/public', config.excludePaths)).toBe(false);

      await testCrawler.shutdown();
    });

    it('should exclude URLs matching glob patterns', async () => {
      const config = {
        ...mockConfig,
        excludePaths: ['*.pdf', '*.zip', '/docs/*.html']
      };

      class TestCrawler extends CrawlerService {
        public testIsExcluded(url: string, excludePaths: string[]): boolean {
          return this.isExcludedByPatterns(url, excludePaths);
        }
      }

      const testCrawler = new TestCrawler();
      await testCrawler.initialize();

      expect(testCrawler.testIsExcluded('https://example.com/document.pdf', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/archive.zip', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/docs/guide.html', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/page.html', config.excludePaths)).toBe(false);

      await testCrawler.shutdown();
    });

    it('should exclude URLs matching regex patterns', async () => {
      const config = {
        ...mockConfig,
        excludePaths: ['/^\/api\/v\\d+\//', '/\\/(admin|private)\\//', '/\\.pdf$/']
      };

      class TestCrawler extends CrawlerService {
        public testIsExcluded(url: string, excludePaths: string[]): boolean {
          return this.isExcludedByPatterns(url, excludePaths);
        }
      }

      const testCrawler = new TestCrawler();
      await testCrawler.initialize();

      expect(testCrawler.testIsExcluded('https://example.com/api/v1/users', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/api/v123/data', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/admin/panel', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/private/docs', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/document.pdf', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/public/info', config.excludePaths)).toBe(false);

      await testCrawler.shutdown();
    });

    it('should handle mixed pattern types', async () => {
      const config = {
        ...mockConfig,
        excludePaths: ['/admin', '*.pdf', '/^\/api\//', '*private*']
      };

      class TestCrawler extends CrawlerService {
        public testIsExcluded(url: string, excludePaths: string[]): boolean {
          return this.isExcludedByPatterns(url, excludePaths);
        }
      }

      const testCrawler = new TestCrawler();
      await testCrawler.initialize();

      expect(testCrawler.testIsExcluded('https://example.com/admin', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/doc.pdf', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/api/endpoint', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/user/private/data', config.excludePaths)).toBe(true);
      expect(testCrawler.testIsExcluded('https://example.com/public/page', config.excludePaths)).toBe(false);

      await testCrawler.shutdown();
    });
  });

  describe('Pattern Validation', () => {
    it('should validate exclusion patterns', () => {
      const validPatterns = ['/admin', '*.pdf', '/^\/api\//', '*private*'];
      const results = crawlerService.validateExclusionPatterns(validPatterns);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should detect invalid patterns', () => {
      const invalidPatterns = ['', '/[invalid/', '   '];
      const results = crawlerService.validateExclusionPatterns(invalidPatterns);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(false); // empty string
      expect(results[1].valid).toBe(false); // invalid regex
      expect(results[2].valid).toBe(false); // whitespace only
    });

    it('should provide pattern type information', () => {
      const patterns = ['/admin', '*.pdf', '/^\/api\//', '*private*'];
      const results = crawlerService.validateExclusionPatterns(patterns);

      expect(results[0].type).toBe('prefix');
      expect(results[1].type).toBe('suffix'); // *.pdf is treated as suffix
      expect(results[2].type).toBe('regex');
      expect(results[3].type).toBe('glob'); // *private* is treated as glob due to multiple wildcards
    });
  });

  describe('Pattern Testing', () => {
    it('should test patterns against URLs', () => {
      const patterns = ['/admin', '*.pdf'];
      const testUrls = [
        'https://example.com/admin',
        'https://example.com/admin/users',
        'https://example.com/document.pdf',
        'https://example.com/public/page'
      ];

      const results = crawlerService.testExclusionPatterns(patterns, testUrls);

      expect(results).toHaveLength(4);
      expect(results[0].excluded).toBe(true);
      expect(results[0].matchedPattern).toBe('/admin');
      expect(results[1].excluded).toBe(true);
      expect(results[1].matchedPattern).toBe('/admin');
      expect(results[2].excluded).toBe(true);
      expect(results[2].matchedPattern).toBe('.pdf'); // Pattern is stored without the leading *
      expect(results[3].excluded).toBe(false);
      expect(results[3].matchedPattern).toBeUndefined();
    });
  });

  describe('Failed Link Re-scanning', () => {
    it('should create rescan session for failed URLs', async () => {
      const failedUrls = [
        'https://example.com/broken1',
        'https://example.com/broken2'
      ];

      const rescanStatus = await crawlerService.rescanFailedLinks(
        'original-session-id',
        failedUrls,
        mockConfig
      );

      expect(rescanStatus.sessionId).toBe('original-session-id_rescan');
      expect(rescanStatus.status).toBe('running');
      expect(rescanStatus.progress.totalUrls).toBe(2);
      expect(rescanStatus.progress.processedUrls).toBe(0);
      expect(rescanStatus.progress.failedUrls).toBe(0);
    });

    it('should reject empty failed URLs list', async () => {
      await expect(
        crawlerService.rescanFailedLinks('session-id', [], mockConfig)
      ).rejects.toThrow('No failed URLs provided for re-scanning');
    });

    it('should handle rescan session status tracking', async () => {
      const failedUrls = ['https://example.com/broken'];
      
      const rescanStatus = await crawlerService.rescanFailedLinks(
        'original-session-id',
        failedUrls,
        mockConfig
      );

      // Check that we can get the status
      const status = crawlerService.getCrawlStatus(rescanStatus.sessionId);
      expect(status).not.toBeNull();
      expect(status?.sessionId).toBe('original-session-id_rescan');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs in exclusion checking', () => {
      class TestCrawler extends CrawlerService {
        public testIsExcluded(url: string, excludePaths: string[]): boolean {
          return this.isExcludedByPatterns(url, excludePaths);
        }
      }

      const testCrawler = new TestCrawler();
      const config = { ...mockConfig, excludePaths: ['/admin'] };

      // Should not throw and should return false for invalid URLs
      expect(testCrawler.testIsExcluded('not-a-url', config.excludePaths)).toBe(false);
      expect(testCrawler.testIsExcluded('', config.excludePaths)).toBe(false);
    });

    it('should handle invalid regex patterns gracefully', () => {
      const invalidPatterns = ['/[invalid/'];
      const results = crawlerService.validateExclusionPatterns(invalidPatterns);

      expect(results[0].valid).toBe(false);
      expect(results[0].error).toContain('Invalid regular expression');
    });
  });
});