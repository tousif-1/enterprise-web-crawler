import request from 'supertest';
import { createApp } from '../app';
import { pool } from '../database/connection';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../database/repositories/crawl-result.repository';
import { IssueRepository } from '../database/repositories/issue.repository';
import { CrawlSession, CrawlResult, Issue } from '@enterprise-web-crawler/shared';

describe('Report Integration Tests', () => {
  let app: any;
  let server: any;
  let sessionRepo: CrawlSessionRepository;
  let resultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let testSessionId: string;

  beforeAll(async () => {
    // Create app
    const appInstance = createApp();
    app = appInstance.app;
    server = appInstance.server;

    // Initialize repositories
    sessionRepo = new CrawlSessionRepository();
    resultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();

    // Clean up any existing test data
    await pool.query('DELETE FROM issues WHERE 1=1');
    await pool.query('DELETE FROM crawl_results WHERE 1=1');
    await pool.query('DELETE FROM crawl_sessions WHERE 1=1');
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM issues WHERE 1=1');
    await pool.query('DELETE FROM crawl_results WHERE 1=1');
    await pool.query('DELETE FROM crawl_sessions WHERE 1=1');
    
    // Close connections
    await pool.end();
    server.close();
  });

  beforeEach(async () => {
    // Create test session
    const session = await sessionRepo.create({
      userId: 'test-user-1',
      name: 'Integration Test Session',
      status: 'completed',
      config: {
        urls: ['https://example.com'],
        excludePaths: ['/admin'],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true
      },
      startTime: new Date('2023-01-01T10:00:00Z'),
      endTime: new Date('2023-01-01T11:00:00Z'),
      progress: {
        totalUrls: 50,
        processedUrls: 50,
        failedUrls: 5
      }
    });

    testSessionId = session.id;

    // Create test results
    const result1 = await resultRepo.create({
      sessionId: testSessionId,
      url: 'https://example.com',
      status: 'success',
      httpStatus: 200,
      responseTime: 150,
      contentHash: 'hash1',
      lastModified: new Date('2023-01-01T10:30:00Z'),
      accessibilityScore: 85
    });

    const result2 = await resultRepo.create({
      sessionId: testSessionId,
      url: 'https://example.com/page2',
      status: 'failed',
      httpStatus: 404,
      responseTime: 100,
      contentHash: 'hash2',
      lastModified: new Date('2023-01-01T10:35:00Z'),
      accessibilityScore: 0
    });

    // Create test issues
    await issueRepo.createIssue(result1.id, {
      type: 'accessibility',
      severity: 'high',
      description: 'Missing alt text on image',
      element: 'img[src="/image.jpg"]',
      wcagGuideline: '1.1.1',
      remediation: 'Add descriptive alt text'
    });

    await issueRepo.createIssue(result2.id, {
      type: 'broken_link',
      severity: 'critical',
      description: 'Page not found',
      element: 'a[href="/broken"]',
      wcagGuideline: undefined,
      remediation: 'Fix or remove the broken link'
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await pool.query('DELETE FROM issues WHERE 1=1');
    await pool.query('DELETE FROM crawl_results WHERE 1=1');
    await pool.query('DELETE FROM crawl_sessions WHERE 1=1');
  });

  describe('GET /api/reports/:sessionId/data', () => {
    it('should return complete report data', async () => {
      const response = await request(app)
        .get(`/api/reports/${testSessionId}/data`)
        .query({
          includeDetails: 'true',
          includeTrends: 'false'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      const { session, summary, results, issues } = response.body.data;

      // Verify session data
      expect(session.id).toBe(testSessionId);
      expect(session.name).toBe('Integration Test Session');
      expect(session.status).toBe('completed');

      // Verify summary data
      expect(summary.totalResults).toBe(2);
      expect(summary.successCount).toBe(1);
      expect(summary.failedCount).toBe(1);
      expect(summary.issueStats.totalIssues).toBe(2);
      expect(summary.issueStats.criticalIssues).toBe(1);
      expect(summary.issueStats.highIssues).toBe(1);

      // Verify results data
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com');
      expect(results[1].url).toBe('https://example.com/page2');

      // Verify issues data
      expect(issues).toHaveLength(2);
      expect(issues.some((issue: any) => issue.type === 'accessibility')).toBe(true);
      expect(issues.some((issue: any) => issue.type === 'broken_link')).toBe(true);
    });

    it('should return summary data without details', async () => {
      const response = await request(app)
        .get(`/api/reports/${testSessionId}/data`)
        .query({
          includeDetails: 'false',
          includeTrends: 'false'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const { summary } = response.body.data;
      expect(summary.totalResults).toBe(2);
      expect(summary.averageAccessibilityScore).toBe(42.5); // (85 + 0) / 2
    });
  });

  describe('POST /api/reports/export', () => {
    it('should export CSV report', async () => {
      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: testSessionId,
          format: 'csv',
          options: {
            includeDetails: true,
            includeTrends: false
          }
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      
      const csvContent = response.text;
      expect(csvContent).toContain('Session Summary');
      expect(csvContent).toContain('Integration Test Session');
      expect(csvContent).toContain('Total URLs,2');
      expect(csvContent).toContain('Successful,1');
      expect(csvContent).toContain('Failed,1');
      expect(csvContent).toContain('Total Issues,2');
      expect(csvContent).toContain('Crawl Results');
      expect(csvContent).toContain('https://example.com');
      expect(csvContent).toContain('Issues Details');
      expect(csvContent).toContain('accessibility');
      expect(csvContent).toContain('broken_link');
    });

    it('should export HTML report', async () => {
      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: testSessionId,
          format: 'html',
          options: {
            includeDetails: true,
            includeTrends: false
          }
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      
      const htmlContent = response.text;
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('<title>Crawl Report - Integration Test Session</title>');
      expect(htmlContent).toContain('<h1>Web Crawl Report</h1>');
      expect(htmlContent).toContain('Integration Test Session');
      expect(htmlContent).toContain('Total URLs:');
      expect(htmlContent).toContain('<span class="metric-value">2</span>');
      expect(htmlContent).toContain('Detailed Results');
      expect(htmlContent).toContain('https://example.com');
      expect(htmlContent).toContain('Top Issues');
    });
  });

  describe('GET /api/reports/:sessionId/export/:format', () => {
    it('should export via GET request', async () => {
      const response = await request(app)
        .get(`/api/reports/${testSessionId}/export/csv`)
        .query({
          includeDetails: 'true'
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.text).toContain('Session Summary');
      expect(response.text).toContain('Integration Test Session');
    });
  });

  describe('GET /api/reports/historical/:userId', () => {
    it('should return historical data', async () => {
      const response = await request(app)
        .get('/api/reports/historical/test-user-1')
        .query({ limit: '10' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(1);
      expect(response.body.data.summaries).toHaveLength(1);
      expect(response.body.data.sessions[0].id).toBe(testSessionId);
      expect(response.body.data.summaries[0].totalResults).toBe(2);
    });
  });

  describe('GET /api/reports/:sessionId/summary', () => {
    it('should return session summary', async () => {
      const response = await request(app)
        .get(`/api/reports/${testSessionId}/summary`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session.id).toBe(testSessionId);
      expect(response.body.data.summary.totalResults).toBe(2);
      expect(response.body.data.summary.successCount).toBe(1);
      expect(response.body.data.summary.failedCount).toBe(1);
    });
  });

  describe('POST /api/reports/:sessionId/compare/:compareSessionId', () => {
    it('should compare two sessions', async () => {
      // Create a second session for comparison
      const session2 = await sessionRepo.create({
        userId: 'test-user-1',
        name: 'Comparison Session',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        },
        startTime: new Date('2023-01-02T10:00:00Z'),
        endTime: new Date('2023-01-02T11:00:00Z'),
        progress: {
          totalUrls: 30,
          processedUrls: 30,
          failedUrls: 2
        }
      });

      // Create results for second session
      await resultRepo.create({
        sessionId: session2.id,
        url: 'https://example.com',
        status: 'success',
        httpStatus: 200,
        responseTime: 120,
        contentHash: 'hash3',
        lastModified: new Date('2023-01-02T10:30:00Z'),
        accessibilityScore: 90
      });

      const response = await request(app)
        .post(`/api/reports/${testSessionId}/compare/${session2.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.current.session.id).toBe(testSessionId);
      expect(response.body.data.compare.session.id).toBe(session2.id);
      expect(response.body.data.changes.totalResultsChange).toBe(1); // 2 - 1
      expect(response.body.data.changes.successRateChange).toBeLessThan(0); // 50% vs 100%
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent session', async () => {
      const response = await request(app)
        .get('/api/reports/550e8400-e29b-41d4-a716-446655440000/data')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to generate report data');
    });

    it('should validate session ID format', async () => {
      const response = await request(app)
        .get('/api/reports/invalid-uuid/data')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate export request body', async () => {
      const response = await request(app)
        .post('/api/reports/export')
        .send({
          sessionId: 'invalid-uuid',
          format: 'csv'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      // Create multiple results and issues
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        promises.push(
          resultRepo.create({
            sessionId: testSessionId,
            url: `https://example.com/page${i}`,
            status: i % 5 === 0 ? 'failed' : 'success',
            httpStatus: i % 5 === 0 ? 404 : 200,
            responseTime: 100 + Math.random() * 200,
            contentHash: `hash${i}`,
            lastModified: new Date(),
            accessibilityScore: Math.random() * 100
          })
        );
      }

      const results = await Promise.all(promises);

      // Add issues to some results
      const issuePromises = [];
      for (let i = 0; i < 10; i++) {
        issuePromises.push(
          issueRepo.createIssue(results[i].id, {
            type: 'accessibility',
            severity: 'medium',
            description: `Test issue ${i}`,
            element: `element${i}`,
            wcagGuideline: '1.1.1',
            remediation: `Fix issue ${i}`
          })
        );
      }

      await Promise.all(issuePromises);

      const startTime = Date.now();
      
      const response = await request(app)
        .get(`/api/reports/${testSessionId}/data`)
        .query({
          includeDetails: 'true',
          includeTrends: 'false'
        })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.body.data.summary.totalResults).toBe(22); // 2 original + 20 new
      expect(response.body.data.issues.length).toBe(12); // 2 original + 10 new
    });
  });
});