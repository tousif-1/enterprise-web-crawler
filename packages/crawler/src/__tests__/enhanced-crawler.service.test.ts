import { EnhancedCrawlerService } from '../services/enhanced-crawler.service';
import { AccessibilityAnalyzer } from '../services/accessibility-analyzer.service';
import { Browser, Page } from 'puppeteer';
import { AccessibilityReport, CrawlConfig } from '@enterprise-web-crawler/shared';

// Mock dependencies
jest.mock('../services/accessibility-analyzer.service');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  Logger: jest.fn().mockImplementation((context: string) => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('EnhancedCrawlerService', () => {
  let service: EnhancedCrawlerService;
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;
  let mockAccessibilityAnalyzer: jest.Mocked<AccessibilityAnalyzer>;

  beforeEach(() => {
    service = new EnhancedCrawlerService();
    
    // Mock Page
    mockPage = {
      setUserAgent: jest.fn(),
      setViewport: jest.fn(),
      goto: jest.fn(),
      content: jest.fn(),
      close: jest.fn(),
      $eval: jest.fn()
    } as any;

    // Mock Browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn()
    } as any;

    // Set up browser mock
    (service as any).browser = mockBrowser;

    // Mock AccessibilityAnalyzer
    mockAccessibilityAnalyzer = {
      analyzePage: jest.fn(),
      calculateComplianceScore: jest.fn()
    } as any;

    (service as any).accessibilityAnalyzer = mockAccessibilityAnalyzer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crawlUrl', () => {
    const mockUrl = 'https://example.com';
    const mockConfig: CrawlConfig = {
      urls: [mockUrl],
      excludePaths: [],
      maxDepth: 1,
      concurrency: 1,
      respectRobots: false
    };

    const mockResponse = {
      status: () => 200
    };

    const mockAccessibilityReport: AccessibilityReport = {
      url: mockUrl,
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          tags: ['wcag2aa'],
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure sufficient color contrast',
          helpUrl: 'https://example.com',
          nodes: [
            {
              html: '<p>Low contrast text</p>',
              target: ['p'],
              failureSummary: 'Fix color contrast'
            }
          ],
          wcagLevel: 'AA',
          wcagGuideline: 'wcag2aa',
          remediation: 'Increase color contrast ratio'
        }
      ],
      passes: [],
      incomplete: [],
      score: 75,
      timestamp: new Date()
    };

    beforeEach(() => {
      mockPage.goto.mockResolvedValue(mockResponse as any);
      mockPage.content.mockResolvedValue('<html><body><p>Test content</p></body></html>');
      mockPage.$eval.mockResolvedValue([]);
      mockAccessibilityAnalyzer.analyzePage.mockResolvedValue(mockAccessibilityReport);
    });

    it('should successfully crawl URL with accessibility analysis', async () => {
      const result = await (service as any).crawlUrl(mockUrl, mockConfig);

      expect(result).toBeDefined();
      expect(result.url).toBe(mockUrl);
      expect(result.status).toBe('success');
      expect(result.httpStatus).toBe(200);
      expect(result.accessibilityScore).toBe(75);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('accessibility');
      expect(result.issues[0].severity).toBe('high');
      expect(result.issues[0].description).toContain('color contrast');

      expect(mockAccessibilityAnalyzer.analyzePage).toHaveBeenCalledWith(mockPage, mockUrl);
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should handle accessibility analysis failure gracefully', async () => {
      mockAccessibilityAnalyzer.analyzePage.mockRejectedValue(new Error('Analysis failed'));

      const result = await (service as any).crawlUrl(mockUrl, mockConfig);

      expect(result).toBeDefined();
      expect(result.accessibilityScore).toBe(0);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].description).toBe('Accessibility analysis failed');
      expect(result.issues[0].type).toBe('accessibility');
    });

    it('should convert multiple violation nodes to separate issues', async () => {
      const reportWithMultipleNodes: AccessibilityReport = {
        ...mockAccessibilityReport,
        violations: [
          {
            id: 'image-alt',
            impact: 'critical',
            tags: ['wcag2a'],
            description: 'Images must have alternate text',
            help: 'Add alt text to images',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<img src="img1.jpg">',
                target: ['img:nth-child(1)'],
                failureSummary: 'Missing alt text'
              },
              {
                html: '<img src="img2.jpg">',
                target: ['img:nth-child(2)'],
                failureSummary: 'Missing alt text'
              }
            ],
            wcagLevel: 'A',
            wcagGuideline: 'wcag2a',
            remediation: 'Add descriptive alt text'
          }
        ]
      };

      mockAccessibilityAnalyzer.analyzePage.mockResolvedValue(reportWithMultipleNodes);

      const result = await (service as any).crawlUrl(mockUrl, mockConfig);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].element).toBe('img:nth-child(1)');
      expect(result.issues[1].element).toBe('img:nth-child(2)');
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[1].severity).toBe('critical');
    });

    it('should handle incomplete accessibility results', async () => {
      const reportWithIncomplete: AccessibilityReport = {
        ...mockAccessibilityReport,
        violations: [],
        incomplete: [
          {
            id: 'color-contrast',
            impact: 'serious',
            tags: ['wcag2aa'],
            description: 'Elements must have sufficient color contrast',
            help: 'Ensure sufficient color contrast',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<div>Background image text</div>',
                target: ['div'],
                message: 'Unable to determine contrast ratio'
              }
            ]
          }
        ],
        score: 90
      };

      mockAccessibilityAnalyzer.analyzePage.mockResolvedValue(reportWithIncomplete);

      const result = await (service as any).crawlUrl(mockUrl, mockConfig);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('accessibility');
      expect(result.issues[0].severity).toBe('medium'); // Reduced from 'high' for incomplete
      expect(result.issues[0].description).toContain('Incomplete accessibility check');
      expect(result.issues[0].remediation).toContain('Manual review required');
    });
  });

  describe('getAccessibilityReport', () => {
    const mockUrl = 'https://example.com';
    const mockReport: AccessibilityReport = {
      url: mockUrl,
      violations: [],
      passes: [],
      incomplete: [],
      score: 100,
      timestamp: new Date()
    };

    beforeEach(() => {
      mockPage.goto.mockResolvedValue({} as any);
      mockAccessibilityAnalyzer.analyzePage.mockResolvedValue(mockReport);
    });

    it('should return accessibility report for a URL', async () => {
      const result = await service.getAccessibilityReport(mockUrl);

      expect(result).toEqual(mockReport);
      expect(mockPage.setUserAgent).toHaveBeenCalledWith('Enterprise Web Crawler 1.0');
      expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1920, height: 1080 });
      expect(mockPage.goto).toHaveBeenCalledWith(mockUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      expect(mockAccessibilityAnalyzer.analyzePage).toHaveBeenCalledWith(mockPage, mockUrl);
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should initialize browser if not already initialized', async () => {
      (service as any).browser = null;
      const initializeSpy = jest.spyOn(service, 'initialize').mockImplementation(async () => {
        (service as any).browser = mockBrowser;
      });

      await service.getAccessibilityReport(mockUrl);

      expect(initializeSpy).toHaveBeenCalled();
    });

    it('should close page even if analysis fails', async () => {
      mockAccessibilityAnalyzer.analyzePage.mockRejectedValue(new Error('Analysis failed'));

      await expect(service.getAccessibilityReport(mockUrl)).rejects.toThrow('Analysis failed');
      expect(mockPage.close).toHaveBeenCalled();
    });
  });

  describe('analyzeAccessibilityBatch', () => {
    const mockUrls = ['https://example1.com', 'https://example2.com'];
    const mockReports: AccessibilityReport[] = [
      {
        url: mockUrls[0],
        violations: [],
        passes: [],
        incomplete: [],
        score: 95,
        timestamp: new Date()
      },
      {
        url: mockUrls[1],
        violations: [],
        passes: [],
        incomplete: [],
        score: 88,
        timestamp: new Date()
      }
    ];

    it('should analyze multiple URLs and return reports', async () => {
      jest.spyOn(service, 'getAccessibilityReport')
        .mockResolvedValueOnce(mockReports[0])
        .mockResolvedValueOnce(mockReports[1]);

      const results = await service.analyzeAccessibilityBatch(mockUrls);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockReports[0]);
      expect(results[1]).toEqual(mockReports[1]);
    });

    it('should handle individual URL failures gracefully', async () => {
      jest.spyOn(service, 'getAccessibilityReport')
        .mockResolvedValueOnce(mockReports[0])
        .mockRejectedValueOnce(new Error('Analysis failed'));

      const results = await service.analyzeAccessibilityBatch(mockUrls);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockReports[0]);
      expect(results[1]).toMatchObject({
        url: mockUrls[1],
        violations: [],
        passes: [],
        incomplete: [],
        score: 0
      });
    });
  });

  describe('impact to severity mapping', () => {
    it('should correctly map impact levels to severity', () => {
      const testCases = [
        { impact: 'critical', expected: 'critical' },
        { impact: 'serious', expected: 'high' },
        { impact: 'moderate', expected: 'medium' },
        { impact: 'minor', expected: 'low' }
      ];

      testCases.forEach(({ impact, expected }) => {
        const result = (service as any).mapImpactToSeverity(impact);
        expect(result).toBe(expected);
      });
    });

    it('should default to medium for unknown impact', () => {
      const result = (service as any).mapImpactToSeverity('unknown' as any);
      expect(result).toBe('medium');
    });
  });
});