import { ReportService, ReportOptions } from '../services/report.service';
import { CrawlSession, CrawlResult, Issue } from '@enterprise-web-crawler/shared';

// Mock all dependencies
jest.mock('../database/repositories/crawl-session.repository');
jest.mock('../database/repositories/crawl-result.repository');
jest.mock('../database/repositories/issue.repository');
jest.mock('../utils/logger');
jest.mock('../database/connection');

// Create mock implementations
const mockSessionRepo = {
  findById: jest.fn(),
  findByUserId: jest.fn(),
  getSessionStats: jest.fn()
};

const mockResultRepo = {
  getSessionSummary: jest.fn(),
  findBySessionId: jest.fn(),
  findWithIssues: jest.fn()
};

const mockIssueRepo = {
  getSessionIssueStats: jest.fn(),
  findBySessionId: jest.fn()
};

describe('ReportService', () => {
  let reportService: ReportService;

  const mockSession: CrawlSession = {
    id: 'session-1',
    userId: 'user-1',
    name: 'Test Session',
    status: 'completed',
    config: {
      urls: ['https://example.com'],
      excludePaths: [],
      maxDepth: 3,
      concurrency: 5,
      respectRobots: true
    },
    startTime: new Date('2023-01-01T10:00:00Z'),
    endTime: new Date('2023-01-01T11:00:00Z'),
    progress: {
      totalUrls: 100,
      processedUrls: 100,
      failedUrls: 5
    },
    createdAt: new Date('2023-01-01T10:00:00Z'),
    updatedAt: new Date('2023-01-01T11:00:00Z')
  };

  const mockResults: CrawlResult[] = [
    {
      id: 'result-1',
      sessionId: 'session-1',
      url: 'https://example.com',
      status: 'success',
      httpStatus: 200,
      responseTime: 150,
      contentHash: 'hash1',
      lastModified: new Date('2023-01-01T10:30:00Z'),
      issues: [],
      accessibilityScore: 85,
      createdAt: new Date('2023-01-01T10:30:00Z')
    },
    {
      id: 'result-2',
      sessionId: 'session-1',
      url: 'https://example.com/page2',
      status: 'failed',
      httpStatus: 404,
      responseTime: 100,
      contentHash: 'hash2',
      lastModified: new Date('2023-01-01T10:35:00Z'),
      issues: [],
      accessibilityScore: 0,
      createdAt: new Date('2023-01-01T10:35:00Z')
    }
  ];

  const mockIssues: Issue[] = [
    {
      id: 'issue-1',
      type: 'broken_link',
      severity: 'high',
      description: 'Link returns 404',
      element: 'a[href="/broken"]',
      wcagGuideline: undefined,
      remediation: 'Fix or remove the broken link'
    },
    {
      id: 'issue-2',
      type: 'accessibility',
      severity: 'critical',
      description: 'Missing alt text on image',
      element: 'img[src="/image.jpg"]',
      wcagGuideline: '1.1.1',
      remediation: 'Add descriptive alt text to the image'
    }
  ];

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    reportService = new ReportService();

    // Replace the repositories with mocked versions
    (reportService as any).crawlSessionRepo = mockSessionRepo;
    (reportService as any).crawlResultRepo = mockResultRepo;
    (reportService as any).issueRepo = mockIssueRepo;
  });

  describe('generateReportData', () => {
    beforeEach(() => {
      mockSessionRepo.findById.mockResolvedValue(mockSession);
      mockResultRepo.getSessionSummary.mockResolvedValue({
        totalResults: 100,
        successCount: 95,
        failedCount: 5,
        skippedCount: 0,
        averageResponseTime: 125,
        averageAccessibilityScore: 80.5
      });
      mockIssueRepo.getSessionIssueStats.mockResolvedValue({
        totalIssues: 10,
        criticalIssues: 2,
        highIssues: 3,
        mediumIssues: 3,
        lowIssues: 2,
        brokenLinkIssues: 4,
        accessibilityIssues: 5,
        missingImageIssues: 1,
        performanceIssues: 0
      });
      mockResultRepo.findBySessionId.mockResolvedValue(mockResults);
      mockIssueRepo.findBySessionId.mockResolvedValue(mockIssues);
    });

    it('should generate basic report data', async () => {
      const options: ReportOptions = { includeDetails: false, includeTrends: false };
      
      const result = await reportService.generateReportData('session-1', options);

      expect(result).toBeDefined();
      expect(result.session).toEqual(mockSession);
      expect(result.summary.totalResults).toBe(100);
      expect(result.summary.successCount).toBe(95);
      expect(result.summary.issueStats.totalIssues).toBe(10);
      expect(result.results).toEqual(mockResults);
      expect(result.issues).toEqual(mockIssues);
      expect(result.trends).toBeUndefined();
    });

    it('should include detailed results when requested', async () => {
      const detailedResults = [...mockResults];
      detailedResults[0].issues = [mockIssues[0]];
      detailedResults[1].issues = [mockIssues[1]];
      
      mockResultRepo.findWithIssues.mockResolvedValue(detailedResults);

      const options: ReportOptions = { includeDetails: true, includeTrends: false };
      
      const result = await reportService.generateReportData('session-1', options);

      expect(mockResultRepo.findWithIssues).toHaveBeenCalledWith('session-1');
      expect(result.results).toEqual(detailedResults);
    });

    it('should include trend data when requested', async () => {
      const previousSession = { ...mockSession, id: 'session-0', name: 'Previous Session' };
      mockSessionRepo.findByUserId.mockResolvedValue([mockSession, previousSession]);
      
      // Mock previous session summary
      mockResultRepo.getSessionSummary
        .mockResolvedValueOnce({
          totalResults: 100,
          successCount: 95,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 125,
          averageAccessibilityScore: 80.5
        })
        .mockResolvedValueOnce({
          totalResults: 90,
          successCount: 85,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 140,
          averageAccessibilityScore: 75.0
        });

      mockIssueRepo.getSessionIssueStats
        .mockResolvedValueOnce({
          totalIssues: 10,
          criticalIssues: 2,
          highIssues: 3,
          mediumIssues: 3,
          lowIssues: 2,
          brokenLinkIssues: 4,
          accessibilityIssues: 5,
          missingImageIssues: 1,
          performanceIssues: 0
        })
        .mockResolvedValueOnce({
          totalIssues: 15,
          criticalIssues: 3,
          highIssues: 4,
          mediumIssues: 5,
          lowIssues: 3,
          brokenLinkIssues: 6,
          accessibilityIssues: 7,
          missingImageIssues: 2,
          performanceIssues: 0
        });

      const options: ReportOptions = { includeDetails: false, includeTrends: true };
      
      const result = await reportService.generateReportData('session-1', options);

      expect(result.trends).toBeDefined();
      expect(result.trends!.previousSession).toEqual(previousSession);
      expect(result.trends!.comparison.totalResultsChange).toBe(10);
      expect(result.trends!.comparison.issueCountChange).toBe(-5);
    });

    it('should throw error when session not found', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      await expect(
        reportService.generateReportData('nonexistent-session')
      ).rejects.toThrow('Session nonexistent-session not found');
    });
  });

  describe('generateCSVReport', () => {
    beforeEach(() => {
      mockSessionRepo.findById.mockResolvedValue(mockSession);
      mockResultRepo.getSessionSummary.mockResolvedValue({
        totalResults: 100,
        successCount: 95,
        failedCount: 5,
        skippedCount: 0,
        averageResponseTime: 125,
        averageAccessibilityScore: 80.5
      });
      mockIssueRepo.getSessionIssueStats.mockResolvedValue({
        totalIssues: 10,
        criticalIssues: 2,
        highIssues: 3,
        mediumIssues: 3,
        lowIssues: 2,
        brokenLinkIssues: 4,
        accessibilityIssues: 5,
        missingImageIssues: 1,
        performanceIssues: 0
      });
      mockResultRepo.findBySessionId.mockResolvedValue(mockResults);
      mockIssueRepo.findBySessionId.mockResolvedValue(mockIssues);
    });

    it('should generate CSV report with summary data', async () => {
      const csvContent = await reportService.generateCSVReport('session-1');

      expect(csvContent).toContain('Session Summary');
      expect(csvContent).toContain('Session ID,session-1');
      expect(csvContent).toContain('Session Name,Test Session');
      expect(csvContent).toContain('Total URLs,100');
      expect(csvContent).toContain('Issue Summary');
      expect(csvContent).toContain('Total Issues,10');
    });

    it('should include detailed results when requested', async () => {
      const detailedResults = [...mockResults];
      detailedResults[0].issues = [mockIssues[0]];
      detailedResults[1].issues = [mockIssues[1]];
      
      mockResultRepo.findWithIssues.mockResolvedValue(detailedResults);

      const options: ReportOptions = { includeDetails: true };
      const csvContent = await reportService.generateCSVReport('session-1', options);

      expect(csvContent).toContain('Crawl Results');
      expect(csvContent).toContain('URL,Status,HTTP Status');
      expect(csvContent).toContain('https://example.com');
      expect(csvContent).toContain('Issues Details');
      expect(csvContent).toContain('broken_link');
      expect(csvContent).toContain('accessibility');
    });

    it('should handle CSV escaping correctly', async () => {
      const resultWithCommas = {
        ...mockResults[0],
        url: 'https://example.com/page,with,commas'
      };
      mockResultRepo.findWithIssues.mockResolvedValue([resultWithCommas]);

      const options: ReportOptions = { includeDetails: true };
      const csvContent = await reportService.generateCSVReport('session-1', options);

      expect(csvContent).toContain('"https://example.com/page,with,commas"');
    });
  });

  describe('generateHTMLReport', () => {
    beforeEach(() => {
      mockSessionRepo.findById.mockResolvedValue(mockSession);
      mockResultRepo.getSessionSummary.mockResolvedValue({
        totalResults: 100,
        successCount: 95,
        failedCount: 5,
        skippedCount: 0,
        averageResponseTime: 125,
        averageAccessibilityScore: 80.5
      });
      mockIssueRepo.getSessionIssueStats.mockResolvedValue({
        totalIssues: 10,
        criticalIssues: 2,
        highIssues: 3,
        mediumIssues: 3,
        lowIssues: 2,
        brokenLinkIssues: 4,
        accessibilityIssues: 5,
        missingImageIssues: 1,
        performanceIssues: 0
      });
      mockResultRepo.findBySessionId.mockResolvedValue(mockResults);
      mockIssueRepo.findBySessionId.mockResolvedValue(mockIssues);
    });

    it('should generate HTML report with proper structure', async () => {
      const htmlContent = await reportService.generateHTMLReport('session-1');

      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('<title>Crawl Report - Test Session</title>');
      expect(htmlContent).toContain('<h1>Web Crawl Report</h1>');
      expect(htmlContent).toContain('<h2>Test Session</h2>');
      expect(htmlContent).toContain('Total URLs:');
      expect(htmlContent).toContain('100');
    });

    it('should include detailed results table when requested', async () => {
      const detailedResults = [...mockResults];
      detailedResults[0].issues = [mockIssues[0]];
      detailedResults[1].issues = [mockIssues[1]];
      
      mockResultRepo.findWithIssues.mockResolvedValue(detailedResults);

      const options: ReportOptions = { includeDetails: true };
      const htmlContent = await reportService.generateHTMLReport('session-1', options);

      expect(htmlContent).toContain('<h3>Detailed Results</h3>');
      expect(htmlContent).toContain('<table class="table">');
      expect(htmlContent).toContain('https://example.com');
      expect(htmlContent).toContain('<h3>Top Issues</h3>');
    });

    it('should include trend analysis when available', async () => {
      const previousSession = { ...mockSession, id: 'session-0', name: 'Previous Session' };
      mockSessionRepo.findByUserId.mockResolvedValue([mockSession, previousSession]);
      
      mockResultRepo.getSessionSummary
        .mockResolvedValueOnce({
          totalResults: 100,
          successCount: 95,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 125,
          averageAccessibilityScore: 80.5
        })
        .mockResolvedValueOnce({
          totalResults: 90,
          successCount: 85,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 140,
          averageAccessibilityScore: 75.0
        });

      mockIssueRepo.getSessionIssueStats
        .mockResolvedValueOnce({
          totalIssues: 10,
          criticalIssues: 2,
          highIssues: 3,
          mediumIssues: 3,
          lowIssues: 2,
          brokenLinkIssues: 4,
          accessibilityIssues: 5,
          missingImageIssues: 1,
          performanceIssues: 0
        })
        .mockResolvedValueOnce({
          totalIssues: 15,
          criticalIssues: 3,
          highIssues: 4,
          mediumIssues: 5,
          lowIssues: 3,
          brokenLinkIssues: 6,
          accessibilityIssues: 7,
          missingImageIssues: 2,
          performanceIssues: 0
        });

      const options: ReportOptions = { includeTrends: true };
      const htmlContent = await reportService.generateHTMLReport('session-1', options);

      expect(htmlContent).toContain('<h3>Trend Analysis</h3>');
      expect(htmlContent).toContain('Previous Session');
      expect(htmlContent).toContain('trend-positive');
      expect(htmlContent).toContain('+10');
    });
  });

  describe('getHistoricalData', () => {
    it('should return historical sessions and summaries', async () => {
      const sessions = [mockSession];
      mockSessionRepo.findByUserId.mockResolvedValue(sessions);
      mockResultRepo.getSessionSummary.mockResolvedValue({
        totalResults: 100,
        successCount: 95,
        failedCount: 5,
        skippedCount: 0,
        averageResponseTime: 125,
        averageAccessibilityScore: 80.5
      });
      mockIssueRepo.getSessionIssueStats.mockResolvedValue({
        totalIssues: 10,
        criticalIssues: 2,
        highIssues: 3,
        mediumIssues: 3,
        lowIssues: 2,
        brokenLinkIssues: 4,
        accessibilityIssues: 5,
        missingImageIssues: 1,
        performanceIssues: 0
      });

      const result = await reportService.getHistoricalData('user-1', 5);

      expect(result.sessions).toEqual(sessions);
      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0].totalResults).toBe(100);
      expect(mockSessionRepo.findByUserId).toHaveBeenCalledWith('user-1', {
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit: 5
      });
    });

    it('should handle empty historical data', async () => {
      mockSessionRepo.findByUserId.mockResolvedValue([]);

      const result = await reportService.getHistoricalData('user-1');

      expect(result.sessions).toEqual([]);
      expect(result.summaries).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSessionRepo.findById.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        reportService.generateReportData('session-1')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle missing session data', async () => {
      mockSessionRepo.findById.mockResolvedValue(null);

      await expect(
        reportService.generateReportData('session-1')
      ).rejects.toThrow('Session session-1 not found');
    });
  });
});