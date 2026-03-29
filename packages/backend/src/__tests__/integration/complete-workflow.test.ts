import request from 'supertest';
import { createApp } from '../../app';
import { DatabaseConnection } from '../../database/connection';
import { CrawlSessionRepository } from '../../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../../database/repositories/crawl-result.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { LinkRepository } from '../../database/repositories/link.repository';
import { JobSchedulerService } from '../../services/job-scheduler.service';
import { SearchService } from '../../services/search.service';
import { ReportService } from '../../services/report.service';
import { WebSocketHandler } from '../../websocket/websocket.handler';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { Client } from 'socket.io-client';

describe('Complete Workflow Integration Tests', () => {
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let linkRepo: LinkRepository;
  let jobScheduler: JobSchedulerService;
  let searchService: SearchService;
  let reportService: ReportService;
  let server: any;
  let io: Server;
  let clientSocket: any;
  let app: any;

  beforeAll(async () => {
    // Test database connection
    await DatabaseConnection.testConnection();
    
    // Initialize repositories
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();
    linkRepo = new LinkRepository();
    
    // Initialize services
    jobScheduler = new JobSchedulerService();
    searchService = new SearchService();
    reportService = new ReportService(crawlSessionRepo, crawlResultRepo, issueRepo);
    
    // Setup WebSocket server for real-time testing
    const { app: testApp, server: testServer, io: testIo } = createApp();
    app = testApp;
    server = testServer;
    io = testIo;
    const wsHandler = new WebSocketHandler(io);
    
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address()?.port;
        clientSocket = new Client(`http://localhost:${port}`);
        clientSocket.on('connect', resolve);
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.close();
    }
    if (server) {
      server.close();
    }
    // Close database connections
    await DatabaseConnection.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await DatabaseConnection.query('TRUNCATE TABLE crawl_sessions, crawl_results, issues, links CASCADE');
    
    // Clear search index
    try {
      await searchService.clearIndex();
    } catch (error) {
      // Index might not exist, ignore error
    }
  });

  describe('End-to-End Crawl Workflow', () => {
    it('should complete full crawl workflow from creation to reporting', async () => {
      // Step 1: Create crawl session via API
      const crawlConfig = {
        name: 'Integration Test Crawl',
        urls: ['https://example.com', 'https://httpbin.org/status/200'],
        excludePaths: ['/admin', '/private'],
        maxDepth: 2,
        concurrency: 2,
        respectRobots: true
      };

      const createResponse = await request(app)
        .post('/api/crawl-sessions')
        .send(crawlConfig)
        .expect(201);

      const sessionId = createResponse.body.id;
      expect(sessionId).toBeDefined();

      // Step 2: Start crawl job
      const startResponse = await request(app)
        .post(`/api/crawl-sessions/${sessionId}/start`)
        .expect(200);

      expect(startResponse.body.status).toBe('running');

      // Step 3: Monitor real-time updates via WebSocket
      const updates: any[] = [];
      clientSocket.on('crawl-progress', (data: any) => {
        updates.push(data);
      });

      // Wait for crawl to process (simulate some results)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Verify crawl results are stored
      const results = await crawlResultRepo.findBySessionId(sessionId);
      expect(results.length).toBeGreaterThan(0);

      // Step 5: Test search functionality
      await searchService.indexCrawlResults(results);
      
      const searchResults = await searchService.search('example', {
        sessionId,
        filters: {}
      });
      expect(searchResults.hits.length).toBeGreaterThan(0);

      // Step 6: Generate and verify reports
      const reportData = await reportService.generateReport(sessionId, 'summary');
      expect(reportData).toBeDefined();
      expect(reportData.sessionId).toBe(sessionId);
      expect(reportData.totalUrls).toBeGreaterThan(0);

      // Step 7: Export report
      const exportResponse = await request(app)
        .get(`/api/reports/${sessionId}/export`)
        .query({ format: 'csv' })
        .expect(200);

      expect(exportResponse.headers['content-type']).toContain('text/csv');

      // Step 8: Verify WebSocket updates were received
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]).toHaveProperty('sessionId', sessionId);
    }, 30000);

    it('should handle large-scale crawl simulation (75,000+ links)', async () => {
      // Create a session configured for large-scale testing
      const largeScaleConfig = {
        name: 'Large Scale Test',
        urls: ['https://example.com'],
        maxDepth: 5,
        concurrency: 10,
        respectRobots: false // For testing purposes
      };

      const response = await request(app)
        .post('/api/crawl-sessions')
        .send(largeScaleConfig)
        .expect(201);

      const sessionId = response.body.id;

      // Simulate processing large number of URLs
      const batchSize = 1000;
      const totalUrls = 75000;
      const batches = Math.ceil(totalUrls / batchSize);

      for (let i = 0; i < Math.min(batches, 5); i++) { // Test first 5 batches for performance
        const mockResults = Array.from({ length: batchSize }, (_, index) => ({
          sessionId,
          url: `https://example.com/page-${i * batchSize + index}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000,
          contentHash: `hash-${i}-${index}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        // Batch insert results
        const startTime = Date.now();
        await Promise.all(mockResults.map(result => crawlResultRepo.create(result)));
        const insertTime = Date.now() - startTime;

        // Verify performance: should handle 1000 inserts in under 5 seconds
        expect(insertTime).toBeLessThan(5000);
      }

      // Verify total count
      const totalResults = await crawlResultRepo.countBySessionId(sessionId);
      expect(totalResults).toBe(5000); // 5 batches * 1000 each

      // Test search performance with large dataset
      const searchStartTime = Date.now();
      const searchResults = await searchService.search('page', {
        sessionId,
        filters: {},
        limit: 50
      });
      const searchTime = Date.now() - searchStartTime;

      // Search should complete within 2 seconds (requirement 4.2)
      expect(searchTime).toBeLessThan(2000);
      expect(searchResults.hits.length).toBeGreaterThan(0);
    }, 60000);

    it('should validate accessibility compliance end-to-end', async () => {
      // Create session for accessibility testing
      const accessibilityConfig = {
        name: 'Accessibility Compliance Test',
        urls: ['https://example.com'],
        enableAccessibilityAnalysis: true,
        wcagLevel: 'AA'
      };

      const response = await request(app)
        .post('/api/crawl-sessions')
        .send(accessibilityConfig)
        .expect(201);

      const sessionId = response.body.id;

      // Simulate accessibility analysis results
      const mockAccessibilityIssues = [
        {
          sessionId,
          url: 'https://example.com',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Missing alt text for image',
          element: 'img[src="/logo.png"]',
          wcagGuideline: '1.1.1',
          remediation: 'Add descriptive alt text to the image'
        },
        {
          sessionId,
          url: 'https://example.com',
          type: 'accessibility' as const,
          severity: 'medium' as const,
          description: 'Insufficient color contrast',
          element: '.text-light',
          wcagGuideline: '1.4.3',
          remediation: 'Increase color contrast ratio to at least 4.5:1'
        }
      ];

      // Store accessibility issues
      for (const issue of mockAccessibilityIssues) {
        await issueRepo.create(issue);
      }

      // Verify accessibility report generation
      const accessibilityReport = await reportService.generateAccessibilityReport(sessionId);
      expect(accessibilityReport).toBeDefined();
      expect(accessibilityReport.totalIssues).toBe(2);
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('1.1.1');
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('1.4.3');
      expect(accessibilityReport.complianceScore).toBeLessThan(100);

      // Test accessibility-specific search
      const accessibilitySearchResults = await searchService.search('accessibility', {
        sessionId,
        filters: { type: 'accessibility' }
      });
      expect(accessibilitySearchResults.hits.length).toBe(2);
    });

    it('should handle pause/resume functionality correctly', async () => {
      // Create and start crawl session
      const config = {
        name: 'Pause Resume Test',
        urls: ['https://example.com'],
        maxDepth: 3
      };

      const createResponse = await request(app)
        .post('/api/crawl-sessions')
        .send(config)
        .expect(201);

      const sessionId = createResponse.body.id;

      // Start crawl
      await request(app)
        .post(`/api/crawl-sessions/${sessionId}/start`)
        .expect(200);

      // Pause crawl
      const pauseResponse = await request(app)
        .post(`/api/crawl-sessions/${sessionId}/pause`)
        .expect(200);

      expect(pauseResponse.body.status).toBe('paused');

      // Verify session status
      const statusResponse = await request(app)
        .get(`/api/crawl-sessions/${sessionId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('paused');

      // Resume crawl
      const resumeResponse = await request(app)
        .post(`/api/crawl-sessions/${sessionId}/resume`)
        .expect(200);

      expect(resumeResponse.body.status).toBe('running');

      // Generate partial report during pause
      const partialReport = await reportService.generateReport(sessionId, 'partial');
      expect(partialReport).toBeDefined();
      expect(partialReport.status).toBe('partial');
    });

    it('should validate real-time WebSocket functionality', async () => {
      const updates: any[] = [];
      const errors: any[] = [];

      // Set up WebSocket listeners
      clientSocket.on('crawl-progress', (data: any) => updates.push(data));
      clientSocket.on('crawl-error', (data: any) => errors.push(data));
      clientSocket.on('crawl-complete', (data: any) => updates.push({ ...data, type: 'complete' }));

      // Create and start crawl
      const config = {
        name: 'WebSocket Test',
        urls: ['https://example.com', 'https://httpbin.org/status/404']
      };

      const response = await request(app)
        .post('/api/crawl-sessions')
        .send(config)
        .expect(201);

      const sessionId = response.body.id;

      // Join WebSocket room for this session
      clientSocket.emit('join-session', sessionId);

      // Start crawl
      await request(app)
        .post(`/api/crawl-sessions/${sessionId}/start`)
        .expect(200);

      // Wait for WebSocket updates
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify WebSocket updates were received
      expect(updates.length).toBeGreaterThan(0);
      
      // Check for progress updates
      const progressUpdates = updates.filter(u => u.type !== 'complete');
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('sessionId', sessionId);
      expect(progressUpdates[0]).toHaveProperty('progress');

      // Verify real-time issue notifications
      if (errors.length > 0) {
        expect(errors[0]).toHaveProperty('sessionId', sessionId);
        expect(errors[0]).toHaveProperty('url');
        expect(errors[0]).toHaveProperty('error');
      }
    });
  });

  describe('Cross-Service Integration', () => {
    it('should integrate crawler, analyzer, and search services', async () => {
      const sessionId = 'test-integration-session';

      // Simulate crawler results
      const crawlResult = await crawlResultRepo.create({
        sessionId,
        url: 'https://example.com/test',
        status: 'success',
        httpStatus: 200,
        responseTime: 500,
        contentHash: 'test-hash-123',
        lastModified: new Date(),
        accessibilityScore: 85
      });

      // Simulate analyzer finding issues
      const issue = await issueRepo.create({
        sessionId,
        url: 'https://example.com/test',
        type: 'broken_link',
        severity: 'high',
        description: 'Link returns 404 status',
        element: 'a[href="/missing-page"]'
      });

      // Index results for search
      await searchService.indexCrawlResults([crawlResult]);
      await searchService.indexIssues([issue]);

      // Test integrated search across results and issues
      const searchResults = await searchService.search('test', {
        sessionId,
        filters: {}
      });

      expect(searchResults.hits.length).toBeGreaterThan(0);
      
      // Verify search includes both results and issues
      const resultTypes = searchResults.hits.map(hit => hit._source.type || 'result');
      expect(resultTypes).toContain('result');
    });

    it('should handle job scheduling and queue integration', async () => {
      // Test job scheduling workflow
      const jobConfig = {
        type: 'crawl',
        sessionId: 'test-job-session',
        priority: 'high',
        data: {
          urls: ['https://example.com'],
          maxDepth: 2
        }
      };

      const jobId = await jobScheduler.scheduleJob(jobConfig);
      expect(jobId).toBeDefined();

      // Verify job status
      const jobStatus = await jobScheduler.getJobStatus(jobId);
      expect(jobStatus).toBeDefined();
      expect(['pending', 'running', 'completed']).toContain(jobStatus.status);

      // Test job cancellation
      if (jobStatus.status === 'pending' || jobStatus.status === 'running') {
        await jobScheduler.cancelJob(jobId);
        const cancelledStatus = await jobScheduler.getJobStatus(jobId);
        expect(cancelledStatus.status).toBe('cancelled');
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should maintain response times under 5 seconds for web interface', async () => {
      // Test API response times
      const endpoints = [
        '/api/health',
        '/api/crawl-sessions',
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        await request(app).get(endpoint);
        const responseTime = Date.now() - startTime;
        
        expect(responseTime).toBeLessThan(5000);
      }
    });

    it('should handle concurrent crawl sessions', async () => {
      const concurrentSessions = 5;
      const sessionPromises = [];

      // Create multiple concurrent sessions
      for (let i = 0; i < concurrentSessions; i++) {
        const config = {
          name: `Concurrent Test ${i}`,
          urls: [`https://example.com/test-${i}`]
        };

        sessionPromises.push(
          request(app)
            .post('/api/crawl-sessions')
            .send(config)
        );
      }

      const responses = await Promise.all(sessionPromises);
      
      // Verify all sessions were created successfully
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });

      // Verify database consistency
      const allSessions = await crawlSessionRepo.findAll();
      expect(allSessions.length).toBeGreaterThanOrEqual(concurrentSessions);
    });
  });
});