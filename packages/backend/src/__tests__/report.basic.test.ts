import { ReportService } from '../services/report.service';

// Mock all external dependencies
jest.mock('../database/repositories/crawl-session.repository');
jest.mock('../database/repositories/crawl-result.repository');
jest.mock('../database/repositories/issue.repository');
jest.mock('../utils/logger');
jest.mock('../database/connection');

describe('ReportService Basic Tests', () => {
  let reportService: ReportService;

  beforeEach(() => {
    reportService = new ReportService();
  });

  describe('CSV Generation', () => {
    it('should generate CSV content with session data', async () => {
      // Mock the dependencies
      const mockSession = {
        id: 'session-1',
        name: 'Test Session',
        status: 'completed',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T11:00:00Z')
      };

      const mockSummary = {
        totalResults: 100,
        successCount: 95,
        failedCount: 5,
        skippedCount: 0,
        averageResponseTime: 125,
        averageAccessibilityScore: 80.5,
        issueStats: {
          totalIssues: 10,
          criticalIssues: 2,
          highIssues: 3,
          mediumIssues: 3,
          lowIssues: 2,
          brokenLinkIssues: 4,
          accessibilityIssues: 5,
          missingImageIssues: 1,
          performanceIssues: 0
        }
      };

      // Mock the private methods
      (reportService as any).crawlSessionRepo = {
        findById: jest.fn().mockResolvedValue(mockSession)
      };

      (reportService as any).crawlResultRepo = {
        getSessionSummary: jest.fn().mockResolvedValue({
          totalResults: 100,
          successCount: 95,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 125,
          averageAccessibilityScore: 80.5
        }),
        findBySessionId: jest.fn().mockResolvedValue([])
      };

      (reportService as any).issueRepo = {
        getSessionIssueStats: jest.fn().mockResolvedValue(mockSummary.issueStats),
        findBySessionId: jest.fn().mockResolvedValue([])
      };

      const csvContent = await reportService.generateCSVReport('session-1');

      expect(csvContent).toContain('Session Summary');
      expect(csvContent).toContain('Session ID,session-1');
      expect(csvContent).toContain('Session Name,Test Session');
      expect(csvContent).toContain('Total URLs,100');
      expect(csvContent).toContain('Successful,95');
      expect(csvContent).toContain('Failed,5');
      expect(csvContent).toContain('Issue Summary');
      expect(csvContent).toContain('Total Issues,10');
      expect(csvContent).toContain('Critical Issues,2');
    });
  });

  describe('HTML Generation', () => {
    it('should generate HTML content with proper structure', async () => {
      // Mock the dependencies
      const mockSession = {
        id: 'session-1',
        name: 'Test Session',
        status: 'completed',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T11:00:00Z')
      };

      (reportService as any).crawlSessionRepo = {
        findById: jest.fn().mockResolvedValue(mockSession)
      };

      (reportService as any).crawlResultRepo = {
        getSessionSummary: jest.fn().mockResolvedValue({
          totalResults: 100,
          successCount: 95,
          failedCount: 5,
          skippedCount: 0,
          averageResponseTime: 125,
          averageAccessibilityScore: 80.5
        }),
        findBySessionId: jest.fn().mockResolvedValue([])
      };

      (reportService as any).issueRepo = {
        getSessionIssueStats: jest.fn().mockResolvedValue({
          totalIssues: 10,
          criticalIssues: 2,
          highIssues: 3,
          mediumIssues: 3,
          lowIssues: 2,
          brokenLinkIssues: 4,
          accessibilityIssues: 5,
          missingImageIssues: 1,
          performanceIssues: 0
        }),
        findBySessionId: jest.fn().mockResolvedValue([])
      };

      const htmlContent = await reportService.generateHTMLReport('session-1');

      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('<title>Crawl Report - Test Session</title>');
      expect(htmlContent).toContain('<h1>Web Crawl Report</h1>');
      expect(htmlContent).toContain('Test Session');
      expect(htmlContent).toContain('Total URLs:');
      expect(htmlContent).toContain('100');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing session gracefully', async () => {
      (reportService as any).crawlSessionRepo = {
        findById: jest.fn().mockResolvedValue(null)
      };

      await expect(
        reportService.generateReportData('nonexistent-session')
      ).rejects.toThrow('Session nonexistent-session not found');
    });

    it('should handle database errors', async () => {
      (reportService as any).crawlSessionRepo = {
        findById: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      await expect(
        reportService.generateReportData('session-1')
      ).rejects.toThrow('Database error');
    });
  });
});