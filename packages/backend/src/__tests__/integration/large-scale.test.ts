import { DatabaseConnection } from '../../database/connection';
import { CrawlSessionRepository } from '../../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../../database/repositories/crawl-result.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { LinkRepository } from '../../database/repositories/link.repository';
import { SearchService } from '../../services/search.service';
import { JobSchedulerService } from '../../services/job-scheduler.service';
import { ReportService } from '../../services/report.service';

describe('Large-Scale Performance Tests', () => {
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let linkRepo: LinkRepository;
  let searchService: SearchService;
  let jobScheduler: JobSchedulerService;
  let reportService: ReportService;

  beforeAll(async () => {
    await DatabaseConnection.testConnection();
    
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();
    linkRepo = new LinkRepository();
    
    searchService = new SearchService();
    jobScheduler = new JobSchedulerService();
    reportService = new ReportService(crawlSessionRepo, crawlResultRepo, issueRepo);
  });

  afterAll(async () => {
    await DatabaseConnection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await DatabaseConnection.query('TRUNCATE TABLE crawl_sessions, crawl_results, issues, links CASCADE');
    
    try {
      await searchService.clearIndex();
    } catch (error) {
      // Index might not exist
    }
  });

  describe('75,000+ Links Processing', () => {
    it('should handle 75,000 crawl results efficiently', async () => {
      const sessionId = 'large-scale-session-75k';
      const totalUrls = 75000;
      const batchSize = 1000;
      const batches = Math.ceil(totalUrls / batchSize);

      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'test-user',
        name: 'Large Scale Test - 75K URLs',
        status: 'running',
        config: {
          urls: ['https://example.com'],
          maxDepth: 10,
          concurrency: 50
        },
        startTime: new Date(),
        progress: {
          totalUrls: totalUrls,
          processedUrls: 0,
          failedUrls: 0
        }
      });

      const overallStartTime = Date.now();
      let totalInsertTime = 0;
      let totalSearchTime = 0;

      // Process in batches to simulate real crawling
      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const batchStartTime = Date.now();
        
        // Generate batch of mock results
        const batchResults = Array.from({ length: batchSize }, (_, index) => {
          const urlIndex = batchIndex * batchSize + index;
          return {
            sessionId,
            url: `https://example.com/page-${urlIndex}`,
            status: Math.random() > 0.95 ? 'failed' : 'success' as const,
            httpStatus: Math.random() > 0.95 ? 404 : 200,
            responseTime: Math.random() * 2000 + 100,
            contentHash: `hash-${urlIndex}-${Date.now()}`,
            lastModified: new Date(),
            accessibilityScore: Math.random() * 100
          };
        });

        // Batch insert
        const insertStartTime = Date.now();
        await Promise.all(batchResults.map(result => crawlResultRepo.create(result)));
        const insertTime = Date.now() - insertStartTime;
        totalInsertTime += insertTime;

        // Test search performance periodically
        if (batchIndex % 10 === 0) {
          const searchStartTime = Date.now();
          await searchService.indexCrawlResults(batchResults);
          
          const searchResults = await searchService.search('page', {
            sessionId,
            filters: {},
            limit: 50
          });
          
          const searchTime = Date.now() - searchStartTime;
          totalSearchTime += searchTime;

          // Search should complete within 2 seconds (requirement 4.2)
          expect(searchTime).toBeLessThan(2000);
          expect(searchResults.hits.length).toBeGreaterThan(0);
        }

        const batchTime = Date.now() - batchStartTime;
        console.log(`Batch ${batchIndex + 1}/${batches} processed in ${batchTime}ms`);

        // Each batch should process within reasonable time (5 seconds)
        expect(batchTime).toBeLessThan(5000);
      }

      const overallTime = Date.now() - overallStartTime;
      
      // Verify final counts
      const totalResults = await crawlResultRepo.countBySessionId(sessionId);
      expect(totalResults).toBe(totalUrls);

      // Performance assertions
      const avgInsertTimePerBatch = totalInsertTime / batches;
      const avgSearchTimePerBatch = totalSearchTime / (batches / 10);

      console.log(`Total processing time: ${overallTime}ms`);
      console.log(`Average insert time per batch: ${avgInsertTimePerBatch}ms`);
      console.log(`Average search time per batch: ${avgSearchTimePerBatch}ms`);

      // Should handle large scale efficiently
      expect(avgInsertTimePerBatch).toBeLessThan(3000); // 3 seconds per 1000 inserts
      expect(avgSearchTimePerBatch).toBeLessThan(2000); // 2 seconds per search
      expect(overallTime).toBeLessThan(300000); // 5 minutes total for 75k records
    }, 600000); // 10 minute timeout

    it('should handle 150 countries with 500+ links each efficiently', async () => {
      const countries = 150;
      const linksPerCountry = 500;
      const totalUrls = countries * linksPerCountry;

      const sessionId = 'multi-country-session';
      
      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'test-user',
        name: 'Multi-Country Test - 150 Countries',
        status: 'running',
        config: {
          urls: Array.from({ length: countries }, (_, i) => `https://example-${i}.com`),
          maxDepth: 3,
          concurrency: 20
        },
        startTime: new Date(),
        progress: {
          totalUrls: totalUrls,
          processedUrls: 0,
          failedUrls: 0
        }
      });

      const startTime = Date.now();

      // Process each country in parallel (simulate concurrent crawling)
      const countryPromises = Array.from({ length: countries }, async (_, countryIndex) => {
        const countryResults = Array.from({ length: linksPerCountry }, (_, linkIndex) => ({
          sessionId,
          url: `https://example-${countryIndex}.com/page-${linkIndex}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000 + 100,
          contentHash: `hash-${countryIndex}-${linkIndex}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        // Insert country results in batches
        const batchSize = 50;
        for (let i = 0; i < countryResults.length; i += batchSize) {
          const batch = countryResults.slice(i, i + batchSize);
          await Promise.all(batch.map(result => crawlResultRepo.create(result)));
        }

        return countryResults.length;
      });

      // Process countries with controlled concurrency
      const concurrency = 10;
      const results = [];
      
      for (let i = 0; i < countryPromises.length; i += concurrency) {
        const batch = countryPromises.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        
        console.log(`Processed countries ${i + 1}-${Math.min(i + concurrency, countries)}`);
      }

      const processingTime = Date.now() - startTime;

      // Verify results
      const totalResults = await crawlResultRepo.countBySessionId(sessionId);
      expect(totalResults).toBe(totalUrls);

      // Performance assertions
      console.log(`Multi-country processing time: ${processingTime}ms`);
      expect(processingTime).toBeLessThan(180000); // 3 minutes for 75k records across 150 countries

      // Test search across all countries
      const searchStartTime = Date.now();
      const searchResults = await searchService.search('example', {
        sessionId,
        filters: {},
        limit: 100
      });
      const searchTime = Date.now() - searchStartTime;

      expect(searchTime).toBeLessThan(2000);
      expect(searchResults.hits.length).toBeGreaterThan(0);
    }, 300000); // 5 minute timeout
  });

  describe('Concurrent Session Management', () => {
    it('should handle multiple concurrent crawl sessions', async () => {
      const concurrentSessions = 20;
      const urlsPerSession = 1000;

      const sessionPromises = Array.from({ length: concurrentSessions }, async (_, index) => {
        const sessionId = `concurrent-session-${index}`;
        
        // Create session
        await crawlSessionRepo.create({
          id: sessionId,
          userId: `user-${index}`,
          name: `Concurrent Test Session ${index}`,
          status: 'running',
          config: {
            urls: [`https://example-${index}.com`],
            maxDepth: 3,
            concurrency: 5
          },
          startTime: new Date(),
          progress: {
            totalUrls: urlsPerSession,
            processedUrls: 0,
            failedUrls: 0
          }
        });

        // Generate results for this session
        const results = Array.from({ length: urlsPerSession }, (_, urlIndex) => ({
          sessionId,
          url: `https://example-${index}.com/page-${urlIndex}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000,
          contentHash: `hash-${index}-${urlIndex}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        // Insert results in batches
        const batchSize = 100;
        for (let i = 0; i < results.length; i += batchSize) {
          const batch = results.slice(i, i + batchSize);
          await Promise.all(batch.map(result => crawlResultRepo.create(result)));
        }

        return sessionId;
      });

      const startTime = Date.now();
      const sessionIds = await Promise.all(sessionPromises);
      const processingTime = Date.now() - startTime;

      // Verify all sessions were processed
      expect(sessionIds.length).toBe(concurrentSessions);

      // Verify database consistency
      const totalResults = await DatabaseConnection.query('SELECT COUNT(*) as count FROM crawl_results');
      expect(parseInt(totalResults.rows[0].count)).toBe(concurrentSessions * urlsPerSession);

      console.log(`Concurrent sessions processing time: ${processingTime}ms`);
      expect(processingTime).toBeLessThan(60000); // 1 minute for 20 concurrent sessions
    }, 120000);
  });

  describe('Memory and Resource Management', () => {
    it('should maintain stable memory usage during large operations', async () => {
      const initialMemory = process.memoryUsage();
      const sessionId = 'memory-test-session';
      const batchSize = 5000;
      const batches = 10;

      console.log(`Initial memory usage: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);

      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        // Generate large batch of results
        const results = Array.from({ length: batchSize }, (_, index) => ({
          sessionId,
          url: `https://example.com/memory-test-${batchIndex}-${index}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000,
          contentHash: `hash-${batchIndex}-${index}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        // Process batch
        await Promise.all(results.map(result => crawlResultRepo.create(result)));

        // Check memory usage
        const currentMemory = process.memoryUsage();
        const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
        
        console.log(`Batch ${batchIndex + 1} memory usage: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`);

        // Memory should not grow excessively (less than 500MB increase)
        expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      console.log(`Final memory usage: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    }, 180000);
  });

  describe('Database Performance Under Load', () => {
    it('should maintain query performance with large datasets', async () => {
      const sessionId = 'db-performance-test';
      const recordCount = 50000;

      // Insert large dataset
      console.log(`Inserting ${recordCount} records for performance testing...`);
      
      const batchSize = 1000;
      for (let i = 0; i < recordCount; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, recordCount - i) }, (_, index) => ({
          sessionId,
          url: `https://example.com/perf-test-${i + index}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000,
          contentHash: `hash-perf-${i + index}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        await Promise.all(batch.map(result => crawlResultRepo.create(result)));
      }

      // Test various query patterns
      const queries = [
        {
          name: 'Count by session',
          query: () => crawlResultRepo.countBySessionId(sessionId)
        },
        {
          name: 'Find by session (paginated)',
          query: () => crawlResultRepo.findBySessionId(sessionId, { limit: 100, offset: 0 })
        },
        {
          name: 'Find by status',
          query: () => crawlResultRepo.findByStatus('success', { limit: 100 })
        },
        {
          name: 'Complex aggregation',
          query: () => DatabaseConnection.query(`
            SELECT 
              COUNT(*) as total_results,
              AVG(response_time) as avg_response_time,
              AVG(accessibility_score) as avg_accessibility_score
            FROM crawl_results 
            WHERE session_id = $1
          `, [sessionId])
        }
      ];

      for (const { name, query } of queries) {
        const startTime = Date.now();
        const result = await query();
        const queryTime = Date.now() - startTime;

        console.log(`${name}: ${queryTime}ms`);
        
        // All queries should complete within 2 seconds
        expect(queryTime).toBeLessThan(2000);
        expect(result).toBeDefined();
      }
    }, 300000);
  });

  describe('Search Performance at Scale', () => {
    it('should maintain search performance with large indices', async () => {
      const sessionId = 'search-performance-test';
      const documentCount = 25000;

      // Generate and index large dataset
      console.log(`Indexing ${documentCount} documents for search performance testing...`);
      
      const batchSize = 1000;
      for (let i = 0; i < documentCount; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, documentCount - i) }, (_, index) => ({
          sessionId,
          url: `https://example.com/search-test-${i + index}`,
          status: 'success' as const,
          httpStatus: 200,
          responseTime: Math.random() * 1000,
          contentHash: `hash-search-${i + index}`,
          lastModified: new Date(),
          accessibilityScore: Math.random() * 100
        }));

        await searchService.indexCrawlResults(batch);
      }

      // Test various search patterns
      const searchQueries = [
        { term: 'search-test', expectedResults: documentCount },
        { term: 'example.com', expectedResults: documentCount },
        { term: 'search-test-1000', expectedResults: 1 },
        { term: 'nonexistent', expectedResults: 0 }
      ];

      for (const { term, expectedResults } of searchQueries) {
        const startTime = Date.now();
        const results = await searchService.search(term, {
          sessionId,
          filters: {},
          limit: 100
        });
        const searchTime = Date.now() - startTime;

        console.log(`Search "${term}": ${searchTime}ms, ${results.hits.length} results`);
        
        // Search should complete within 2 seconds (requirement 4.2)
        expect(searchTime).toBeLessThan(2000);
        
        if (expectedResults > 0) {
          expect(results.hits.length).toBeGreaterThan(0);
        }
      }
    }, 300000);
  });

  describe('Report Generation Performance', () => {
    it('should generate reports efficiently for large datasets', async () => {
      const sessionId = 'report-performance-test';
      const resultCount = 10000;
      const issueCount = 2000;

      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'test-user',
        name: 'Report Performance Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          maxDepth: 5
        },
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        endTime: new Date(),
        progress: {
          totalUrls: resultCount,
          processedUrls: resultCount,
          failedUrls: 0
        }
      });

      // Generate results
      console.log(`Generating ${resultCount} results and ${issueCount} issues...`);
      
      const results = Array.from({ length: resultCount }, (_, index) => ({
        sessionId,
        url: `https://example.com/report-test-${index}`,
        status: 'success' as const,
        httpStatus: 200,
        responseTime: Math.random() * 1000,
        contentHash: `hash-report-${index}`,
        lastModified: new Date(),
        accessibilityScore: Math.random() * 100
      }));

      const issues = Array.from({ length: issueCount }, (_, index) => ({
        sessionId,
        url: `https://example.com/report-test-${index % resultCount}`,
        type: ['broken_link', 'accessibility', 'performance'][index % 3] as const,
        severity: ['low', 'medium', 'high', 'critical'][index % 4] as const,
        description: `Test issue ${index}`,
        element: `element-${index}`,
        wcagGuideline: index % 2 === 0 ? '1.1.1' : '2.1.1'
      }));

      // Insert data in batches
      const batchSize = 500;
      
      for (let i = 0; i < results.length; i += batchSize) {
        const batch = results.slice(i, i + batchSize);
        await Promise.all(batch.map(result => crawlResultRepo.create(result)));
      }

      for (let i = 0; i < issues.length; i += batchSize) {
        const batch = issues.slice(i, i + batchSize);
        await Promise.all(batch.map(issue => issueRepo.create(issue)));
      }

      // Test report generation performance
      const reportTypes = ['summary', 'detailed', 'accessibility'];
      
      for (const reportType of reportTypes) {
        const startTime = Date.now();
        const report = await reportService.generateReport(sessionId, reportType);
        const reportTime = Date.now() - startTime;

        console.log(`${reportType} report generation: ${reportTime}ms`);
        
        // Report generation should complete within 10 seconds
        expect(reportTime).toBeLessThan(10000);
        expect(report).toBeDefined();
        expect(report.sessionId).toBe(sessionId);
      }
    }, 300000);
  });
});