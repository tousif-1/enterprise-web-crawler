import request from 'supertest';
import express from 'express';
import { reportRoutes } from '../routes/report.routes';
import { ReportService } from '../services/report.service';

// Mock the ReportService
jest.mock('../services/report.service');
jest.mock('../utils/logger');

const MockReportService = ReportService as jest.MockedClass<typeof ReportService>;

describe('Report Routes', () => {
  let app: express.Application;
  let mockReportService: jest.Mocked<ReportService>;

  const mockReportData = {
    session: {
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
    },
    summary: {
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
    },
    results: [],
    issues: []
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/reports', reportRoutes);

    // Create mocked service instance
    mockReportService = new MockReportService() as jest.Mocked<ReportService>;
    
    // Replace the service instance in the routes module
    (ReportService as any).mockImplementation(() => mockReportService);
  });

  describe('GET /api/reports/:sessionId/data', () => {
    it('should return report data for valid session', async () => {
      mockReportService.generateReportData.mockResolvedValue(mockReportData);

      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/data')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockReportData);
      expect(mockReportService.generateReportData).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        {}
      );
    });

    it('should pass query parameters as options', async () => {
      mockReportService.generateReportData.mockResolvedValue(mockReportData);

      await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/data')
        .query({
          includeDetails: 'true',
          includeTrends: 'true',
          format: 'detailed'
        })
        .expect(200);

      expect(mockReportService.generateReportData).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        {
          includeDetails: true,
          includeTrends: true,
          format: 'detailed'
        }
      );
    });

    it('should return 400 for invalid session ID', async () => {
      const response = await request(app)
        .get('/api/reports/invalid-uuid/data')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle service errors', async () => {
      mockReportService.generateReportData.mockRejectedValue(new Error('Session not found'));

      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/data')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to generate report data');
    });
  });

  describe('POST /api/reports/export', () => {
    it('should export CSV report', async () => {
      const csvContent = 'Session Summary\nSession ID,session-1\n';
      mockReportService.generateCSVReport.mockResolvedValue(csvContent);

      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          format: 'csv',
          options: {
            includeDetails: true,
            includeTrends: false
          }
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toBe(csvContent);
      expect(mockReportService.generateCSVReport).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        {
          includeDetails: true,
          includeTrends: false
        }
      );
    });

    it('should export HTML report', async () => {
      const htmlContent = '<html><body><h1>Report</h1></body></html>';
      mockReportService.generateHTMLReport.mockResolvedValue(htmlContent);

      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          format: 'html'
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.text).toBe(htmlContent);
      expect(mockReportService.generateHTMLReport).toHaveBeenCalled();
    });

    it('should handle PDF export (returns HTML)', async () => {
      const htmlContent = '<html><body><h1>Report</h1></body></html>';
      mockReportService.generateHTMLReport.mockResolvedValue(htmlContent);

      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          format: 'pdf'
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.text).toBe(htmlContent);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: 'invalid-uuid',
          format: 'csv'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for unsupported format', async () => {
      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          format: 'xml'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle service errors during export', async () => {
      mockReportService.generateCSVReport.mockRejectedValue(new Error('Export failed'));

      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          format: 'csv'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to export report');
    });
  });

  describe('GET /api/reports/:sessionId/export/:format', () => {
    it('should export via GET request', async () => {
      const csvContent = 'Session Summary\nSession ID,session-1\n';
      mockReportService.generateCSVReport.mockResolvedValue(csvContent);

      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/export/csv')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.text).toBe(csvContent);
    });

    it('should pass query parameters as options', async () => {
      const csvContent = 'Session Summary\nSession ID,session-1\n';
      mockReportService.generateCSVReport.mockResolvedValue(csvContent);

      await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/export/csv')
        .query({
          includeDetails: 'true',
          includeTrends: 'false'
        })
        .expect(200);

      expect(mockReportService.generateCSVReport).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        {
          includeDetails: true,
          includeTrends: false
        }
      );
    });

    it('should return 400 for unsupported format', async () => {
      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/export/xml')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/historical/:userId', () => {
    it('should return historical data', async () => {
      const historicalData = {
        sessions: [mockReportData.session],
        summaries: [mockReportData.summary]
      };
      mockReportService.getHistoricalData.mockResolvedValue(historicalData);

      const response = await request(app)
        .get('/api/reports/historical/user-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(historicalData);
      expect(mockReportService.getHistoricalData).toHaveBeenCalledWith('user-1', 10);
    });

    it('should respect limit parameter', async () => {
      const historicalData = { sessions: [], summaries: [] };
      mockReportService.getHistoricalData.mockResolvedValue(historicalData);

      await request(app)
        .get('/api/reports/historical/user-1')
        .query({ limit: '5' })
        .expect(200);

      expect(mockReportService.getHistoricalData).toHaveBeenCalledWith('user-1', 5);
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/reports/historical/user-1')
        .query({ limit: '100' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/:sessionId/summary', () => {
    it('should return session summary', async () => {
      mockReportService.generateReportData.mockResolvedValue(mockReportData);

      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toEqual(mockReportData.session);
      expect(response.body.data.summary).toEqual(mockReportData.summary);
      expect(mockReportService.generateReportData).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        {
          format: 'summary',
          includeDetails: false
        }
      );
    });
  });

  describe('POST /api/reports/:sessionId/compare/:compareSessionId', () => {
    it('should compare two sessions', async () => {
      const compareData = { ...mockReportData };
      compareData.summary.totalResults = 80;
      
      mockReportService.generateReportData
        .mockResolvedValueOnce(mockReportData)
        .mockResolvedValueOnce(compareData);

      const response = await request(app)
        .post('/api/reports/550e8400-e29b-41d4-a716-446655440000/compare/550e8400-e29b-41d4-a716-446655440001')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.current.session).toEqual(mockReportData.session);
      expect(response.body.data.compare.session).toEqual(compareData.session);
      expect(response.body.data.changes.totalResultsChange).toBe(20);
    });

    it('should return 400 for invalid session IDs', async () => {
      const response = await request(app)
        .post('/api/reports/invalid-uuid/compare/550e8400-e29b-41d4-a716-446655440001')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});