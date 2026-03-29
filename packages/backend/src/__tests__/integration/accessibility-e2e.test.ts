import { DatabaseConnection } from '../../database/connection';
import { CrawlSessionRepository } from '../../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../../database/repositories/crawl-result.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { ReportService } from '../../services/report.service';
import { SearchService } from '../../services/search.service';
import request from 'supertest';
import { createApp } from '../../app';

describe('End-to-End Accessibility Compliance Tests', () => {
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let reportService: ReportService;
  let searchService: SearchService;
  let app: any;

  beforeAll(async () => {
    await DatabaseConnection.testConnection();
    
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();
    reportService = new ReportService(crawlSessionRepo, crawlResultRepo, issueRepo);
    searchService = new SearchService();
    
    // Setup app
    const { app: testApp } = createApp();
    app = testApp;
  });

  afterAll(async () => {
    await DatabaseConnection.close();
  });

  beforeEach(async () => {
    // Clean up database
    await DatabaseConnection.query('TRUNCATE TABLE crawl_sessions, crawl_results, issues CASCADE');
    
    try {
      await searchService.clearIndex();
    } catch (error) {
      // Index might not exist
    }
  });

  describe('WCAG 2.2 AA Compliance Testing', () => {
    it('should detect and categorize WCAG violations correctly', async () => {
      const sessionId = 'wcag-compliance-test';

      // Create session with accessibility analysis enabled
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'accessibility-tester',
        name: 'WCAG 2.2 AA Compliance Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true,
          wcagLevel: 'AA',
          wcagVersion: '2.2'
        },
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(),
        progress: {
          totalUrls: 10,
          processedUrls: 10,
          failedUrls: 0
        }
      });

      // Create crawl results with accessibility scores
      const crawlResults = [
        {
          sessionId,
          url: 'https://example.com/',
          status: 'success' as const,
          httpStatus: 200,
          responseTime: 500,
          contentHash: 'hash-home',
          lastModified: new Date(),
          accessibilityScore: 65 // Failing score
        },
        {
          sessionId,
          url: 'https://example.com/about',
          status: 'success' as const,
          httpStatus: 200,
          responseTime: 600,
          contentHash: 'hash-about',
          lastModified: new Date(),
          accessibilityScore: 85 // Passing score
        },
        {
          sessionId,
          url: 'https://example.com/contact',
          status: 'success' as const,
          httpStatus: 200,
          responseTime: 450,
          contentHash: 'hash-contact',
          lastModified: new Date(),
          accessibilityScore: 45 // Poor score
        }
      ];

      for (const result of crawlResults) {
        await crawlResultRepo.create(result);
      }

      // Create comprehensive WCAG violations
      const wcagViolations = [
        // Principle 1: Perceivable
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Images must have alternate text',
          element: 'img[src="/hero-image.jpg"]',
          wcagGuideline: '1.1.1',
          remediation: 'Add descriptive alt text that conveys the meaning and function of the image'
        },
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Insufficient color contrast ratio',
          element: '.text-light-gray',
          wcagGuideline: '1.4.3',
          remediation: 'Increase contrast ratio to at least 4.5:1 for normal text'
        },
        {
          sessionId,
          url: 'https://example.com/contact',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Text is too small to read comfortably',
          element: '.fine-print',
          wcagGuideline: '1.4.4',
          remediation: 'Ensure text can be resized up to 200% without loss of functionality'
        },

        // Principle 2: Operable
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Keyboard trap detected in navigation menu',
          element: '#main-navigation',
          wcagGuideline: '2.1.2',
          remediation: 'Ensure keyboard focus can move away from all interactive elements'
        },
        {
          sessionId,
          url: 'https://example.com/about',
          type: 'accessibility' as const,
          severity: 'medium' as const,
          description: 'No skip link provided for main content',
          element: 'body',
          wcagGuideline: '2.4.1',
          remediation: 'Add a skip link to allow keyboard users to bypass navigation'
        },
        {
          sessionId,
          url: 'https://example.com/contact',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Page has no main heading (h1)',
          element: 'body',
          wcagGuideline: '2.4.6',
          remediation: 'Add a descriptive h1 heading that describes the page purpose'
        },

        // Principle 3: Understandable
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'medium' as const,
          description: 'Page language not specified',
          element: 'html',
          wcagGuideline: '3.1.1',
          remediation: 'Add lang attribute to html element (e.g., <html lang="en">)'
        },
        {
          sessionId,
          url: 'https://example.com/contact',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Form input missing required label',
          element: 'input[name="email"]',
          wcagGuideline: '3.3.2',
          remediation: 'Associate form inputs with descriptive labels using for/id attributes'
        },

        // Principle 4: Robust
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'medium' as const,
          description: 'Invalid HTML markup detected',
          element: 'div[role="button"]',
          wcagGuideline: '4.1.1',
          remediation: 'Use semantic HTML elements or ensure proper ARIA implementation'
        },
        {
          sessionId,
          url: 'https://example.com/about',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Interactive element missing accessible name',
          element: 'button.icon-only',
          wcagGuideline: '4.1.2',
          remediation: 'Add aria-label or aria-labelledby to provide accessible name'
        }
      ];

      for (const violation of wcagViolations) {
        await issueRepo.create(violation);
      }

      // Test accessibility report generation
      const accessibilityReport = await reportService.generateAccessibilityReport(sessionId);

      expect(accessibilityReport).toBeDefined();
      expect(accessibilityReport.sessionId).toBe(sessionId);
      expect(accessibilityReport.totalIssues).toBe(wcagViolations.length);

      // Verify WCAG principle categorization
      expect(accessibilityReport.issuesByPrinciple).toHaveProperty('perceivable');
      expect(accessibilityReport.issuesByPrinciple).toHaveProperty('operable');
      expect(accessibilityReport.issuesByPrinciple).toHaveProperty('understandable');
      expect(accessibilityReport.issuesByPrinciple).toHaveProperty('robust');

      // Verify guideline-specific categorization
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('1.1.1');
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('1.4.3');
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('2.1.2');
      expect(accessibilityReport.issuesByGuideline).toHaveProperty('4.1.2');

      // Verify severity distribution
      expect(accessibilityReport.issuesBySeverity.critical).toBe(2);
      expect(accessibilityReport.issuesBySeverity.high).toBe(4);
      expect(accessibilityReport.issuesBySeverity.medium).toBe(3);
      expect(accessibilityReport.issuesBySeverity.low).toBe(1);

      // Verify compliance score calculation
      expect(accessibilityReport.complianceScore).toBeLessThan(100);
      expect(accessibilityReport.complianceScore).toBeGreaterThan(0);
    });

    it('should provide detailed remediation guidance for each violation type', async () => {
      const sessionId = 'remediation-guidance-test';

      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'remediation-tester',
        name: 'Remediation Guidance Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true
        },
        startTime: new Date(Date.now() - 1800000),
        endTime: new Date(),
        progress: {
          totalUrls: 1,
          processedUrls: 1,
          failedUrls: 0
        }
      });

      // Create specific violation types with detailed remediation
      const violationsWithRemediation = [
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Missing alt text for informative image',
          element: 'img[src="/chart.png"]',
          wcagGuideline: '1.1.1',
          remediation: 'Add alt="Sales chart showing 25% increase in Q3" to describe the chart content and meaning'
        },
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Color contrast ratio 2.8:1 (minimum 4.5:1 required)',
          element: '.warning-text',
          wcagGuideline: '1.4.3',
          remediation: 'Change text color from #999999 to #666666 or darker to achieve 4.5:1 contrast ratio'
        },
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Form submit button not accessible via keyboard',
          element: 'div[onclick="submitForm()"]',
          wcagGuideline: '2.1.1',
          remediation: 'Replace div with <button type="submit"> element or add tabindex="0" and keydown event handler'
        },
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Form validation errors not announced to screen readers',
          element: '#contact-form',
          wcagGuideline: '3.3.1',
          remediation: 'Add aria-live="polite" region for error messages and associate errors with form fields using aria-describedby'
        }
      ];

      for (const violation of violationsWithRemediation) {
        await issueRepo.create(violation);
      }

      // Test remediation guidance via API
      const response = await request(app)
        .get(`/api/crawl-sessions/${sessionId}/accessibility-report`)
        .expect(200);

      const report = response.body;
      expect(report.issues).toBeDefined();
      expect(report.issues.length).toBe(violationsWithRemediation.length);

      // Verify each issue has detailed remediation guidance
      report.issues.forEach((issue: any) => {
        expect(issue.remediation).toBeDefined();
        expect(issue.remediation.length).toBeGreaterThan(50); // Detailed guidance
        expect(issue.wcagGuideline).toMatch(/^\d+\.\d+\.\d+$/); // Valid WCAG format
      });

      // Test remediation guidance search
      const searchResults = await searchService.search('remediation', {
        sessionId,
        filters: { type: 'accessibility' }
      });

      expect(searchResults.hits.length).toBeGreaterThan(0);
      searchResults.hits.forEach(hit => {
        expect(hit._source.remediation).toBeDefined();
      });
    });

    it('should calculate accurate compliance scores based on WCAG severity', async () => {
      const sessionId = 'compliance-scoring-test';

      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'scoring-tester',
        name: 'Compliance Scoring Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true,
          wcagLevel: 'AA'
        },
        startTime: new Date(Date.now() - 1800000),
        endTime: new Date(),
        progress: {
          totalUrls: 5,
          processedUrls: 5,
          failedUrls: 0
        }
      });

      // Create pages with different compliance levels
      const pages = [
        { url: 'https://example.com/perfect', score: 100, violations: [] },
        { 
          url: 'https://example.com/minor-issues', 
          score: 85,
          violations: [
            { severity: 'low', wcagGuideline: '1.3.1' },
            { severity: 'medium', wcagGuideline: '2.4.4' }
          ]
        },
        { 
          url: 'https://example.com/moderate-issues', 
          score: 65,
          violations: [
            { severity: 'high', wcagGuideline: '1.4.3' },
            { severity: 'medium', wcagGuideline: '2.1.1' },
            { severity: 'low', wcagGuideline: '3.1.1' }
          ]
        },
        { 
          url: 'https://example.com/major-issues', 
          score: 40,
          violations: [
            { severity: 'critical', wcagGuideline: '1.1.1' },
            { severity: 'high', wcagGuideline: '2.1.2' },
            { severity: 'high', wcagGuideline: '4.1.2' }
          ]
        },
        { 
          url: 'https://example.com/severe-issues', 
          score: 15,
          violations: [
            { severity: 'critical', wcagGuideline: '1.1.1' },
            { severity: 'critical', wcagGuideline: '2.1.1' },
            { severity: 'high', wcagGuideline: '1.4.3' },
            { severity: 'high', wcagGuideline: '3.3.2' },
            { severity: 'medium', wcagGuideline: '2.4.6' }
          ]
        }
      ];

      // Create crawl results and violations
      for (const page of pages) {
        await crawlResultRepo.create({
          sessionId,
          url: page.url,
          status: 'success',
          httpStatus: 200,
          responseTime: 500,
          contentHash: `hash-${page.url.split('/').pop()}`,
          lastModified: new Date(),
          accessibilityScore: page.score
        });

        for (const violation of page.violations) {
          await issueRepo.create({
            sessionId,
            url: page.url,
            type: 'accessibility',
            severity: violation.severity,
            description: `WCAG ${violation.wcagGuideline} violation`,
            wcagGuideline: violation.wcagGuideline,
            remediation: `Fix WCAG ${violation.wcagGuideline} issue`
          });
        }
      }

      // Generate compliance report
      const complianceReport = await reportService.generateAccessibilityReport(sessionId);

      // Verify overall compliance score calculation
      const expectedOverallScore = pages.reduce((sum, page) => sum + page.score, 0) / pages.length;
      expect(complianceReport.complianceScore).toBeCloseTo(expectedOverallScore, 1);

      // Verify page-level scores
      expect(complianceReport.pageScores).toBeDefined();
      expect(complianceReport.pageScores.length).toBe(pages.length);

      complianceReport.pageScores.forEach((pageScore: any) => {
        const expectedPage = pages.find(p => p.url === pageScore.url);
        expect(expectedPage).toBeDefined();
        expect(pageScore.score).toBe(expectedPage!.score);
      });

      // Verify compliance level categorization
      expect(complianceReport.complianceLevels).toBeDefined();
      expect(complianceReport.complianceLevels.excellent).toBe(1); // Perfect page
      expect(complianceReport.complianceLevels.good).toBe(1); // Minor issues page
      expect(complianceReport.complianceLevels.fair).toBe(1); // Moderate issues page
      expect(complianceReport.complianceLevels.poor).toBe(2); // Major and severe issues pages
    });
  });

  describe('Accessibility Testing Integration', () => {
    it('should integrate accessibility analysis with search functionality', async () => {
      const sessionId = 'accessibility-search-test';

      // Create session and results
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'search-tester',
        name: 'Accessibility Search Integration Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true
        },
        startTime: new Date(Date.now() - 1800000),
        endTime: new Date(),
        progress: {
          totalUrls: 3,
          processedUrls: 3,
          failedUrls: 0
        }
      });

      const accessibilityIssues = [
        {
          sessionId,
          url: 'https://example.com/page1',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Missing alt text for decorative image',
          element: 'img.hero-banner',
          wcagGuideline: '1.1.1',
          remediation: 'Add alt="" for decorative images or alt="description" for informative images'
        },
        {
          sessionId,
          url: 'https://example.com/page2',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Insufficient color contrast in navigation links',
          element: 'nav a',
          wcagGuideline: '1.4.3',
          remediation: 'Increase contrast ratio to meet WCAG AA standards (4.5:1 minimum)'
        },
        {
          sessionId,
          url: 'https://example.com/page3',
          type: 'accessibility' as const,
          severity: 'medium' as const,
          description: 'Form labels not properly associated with inputs',
          element: 'form input',
          wcagGuideline: '3.3.2',
          remediation: 'Use for/id attributes to associate labels with form controls'
        }
      ];

      for (const issue of accessibilityIssues) {
        await issueRepo.create(issue);
      }

      // Index issues for search
      await searchService.indexIssues(accessibilityIssues);

      // Test accessibility-specific searches
      const searchTests = [
        {
          query: 'alt text',
          expectedResults: 1,
          description: 'Should find alt text related issues'
        },
        {
          query: 'color contrast',
          expectedResults: 1,
          description: 'Should find color contrast issues'
        },
        {
          query: 'WCAG 1.1.1',
          expectedResults: 1,
          description: 'Should find issues by WCAG guideline'
        },
        {
          query: 'form',
          expectedResults: 1,
          description: 'Should find form-related accessibility issues'
        },
        {
          query: 'critical',
          expectedResults: 1,
          description: 'Should find issues by severity'
        }
      ];

      for (const test of searchTests) {
        const results = await searchService.search(test.query, {
          sessionId,
          filters: { type: 'accessibility' }
        });

        expect(results.hits.length).toBeGreaterThanOrEqual(test.expectedResults);
        console.log(`${test.description}: Found ${results.hits.length} results for "${test.query}"`);
      }

      // Test filtering by WCAG guidelines
      const wcagFilterResults = await searchService.search('*', {
        sessionId,
        filters: { 
          type: 'accessibility',
          wcagGuideline: '1.1.1'
        }
      });

      expect(wcagFilterResults.hits.length).toBe(1);
      expect(wcagFilterResults.hits[0]._source.wcagGuideline).toBe('1.1.1');
    });

    it('should export accessibility reports in multiple formats', async () => {
      const sessionId = 'accessibility-export-test';

      // Create comprehensive accessibility test data
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'export-tester',
        name: 'Accessibility Export Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true,
          wcagLevel: 'AA'
        },
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(),
        progress: {
          totalUrls: 5,
          processedUrls: 5,
          failedUrls: 0
        }
      });

      // Create diverse accessibility issues
      const comprehensiveIssues = [
        {
          sessionId,
          url: 'https://example.com/',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Images without alternative text',
          element: 'img[src="/logo.png"]',
          wcagGuideline: '1.1.1',
          remediation: 'Provide alternative text that serves the equivalent purpose'
        },
        {
          sessionId,
          url: 'https://example.com/products',
          type: 'accessibility' as const,
          severity: 'high' as const,
          description: 'Insufficient color contrast ratio (3.2:1)',
          element: '.product-price',
          wcagGuideline: '1.4.3',
          remediation: 'Increase contrast to at least 4.5:1 for normal text'
        },
        {
          sessionId,
          url: 'https://example.com/contact',
          type: 'accessibility' as const,
          severity: 'critical' as const,
          description: 'Keyboard navigation not possible',
          element: '.dropdown-menu',
          wcagGuideline: '2.1.1',
          remediation: 'Ensure all functionality is available via keyboard'
        }
      ];

      for (const issue of comprehensiveIssues) {
        await issueRepo.create(issue);
      }

      // Test CSV export
      const csvResponse = await request(app)
        .get(`/api/reports/${sessionId}/accessibility/export`)
        .query({ format: 'csv' })
        .expect(200);

      expect(csvResponse.headers['content-type']).toContain('text/csv');
      expect(csvResponse.text).toContain('URL,WCAG Guideline,Severity,Description,Remediation');
      expect(csvResponse.text).toContain('1.1.1');
      expect(csvResponse.text).toContain('critical');

      // Test PDF export
      const pdfResponse = await request(app)
        .get(`/api/reports/${sessionId}/accessibility/export`)
        .query({ format: 'pdf' })
        .expect(200);

      expect(pdfResponse.headers['content-type']).toContain('application/pdf');

      // Test JSON export with detailed structure
      const jsonResponse = await request(app)
        .get(`/api/reports/${sessionId}/accessibility/export`)
        .query({ format: 'json' })
        .expect(200);

      const jsonReport = jsonResponse.body;
      expect(jsonReport.sessionId).toBe(sessionId);
      expect(jsonReport.wcagVersion).toBe('2.2');
      expect(jsonReport.complianceLevel).toBe('AA');
      expect(jsonReport.issues).toBeDefined();
      expect(jsonReport.issues.length).toBe(comprehensiveIssues.length);
      expect(jsonReport.summary).toBeDefined();
      expect(jsonReport.summary.totalIssues).toBe(comprehensiveIssues.length);
    });
  });

  describe('Accessibility Performance and Scalability', () => {
    it('should handle accessibility analysis for large numbers of pages', async () => {
      const sessionId = 'accessibility-scale-test';
      const pageCount = 1000;
      const issuesPerPage = 3;

      // Create session
      await crawlSessionRepo.create({
        id: sessionId,
        userId: 'scale-tester',
        name: 'Large Scale Accessibility Test',
        status: 'completed',
        config: {
          urls: ['https://example.com'],
          enableAccessibilityAnalysis: true
        },
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(),
        progress: {
          totalUrls: pageCount,
          processedUrls: pageCount,
          failedUrls: 0
        }
      });

      console.log(`Generating ${pageCount} pages with ${issuesPerPage} accessibility issues each...`);

      const startTime = Date.now();

      // Generate pages and issues in batches
      const batchSize = 100;
      for (let i = 0; i < pageCount; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, pageCount);
        
        // Create crawl results batch
        const resultsBatch = [];
        for (let j = i; j < batchEnd; j++) {
          resultsBatch.push({
            sessionId,
            url: `https://example.com/page-${j}`,
            status: 'success' as const,
            httpStatus: 200,
            responseTime: 500,
            contentHash: `hash-${j}`,
            lastModified: new Date(),
            accessibilityScore: Math.random() * 40 + 60 // 60-100 range
          });
        }

        await Promise.all(resultsBatch.map(result => crawlResultRepo.create(result)));

        // Create accessibility issues batch
        const issuesBatch = [];
        for (let j = i; j < batchEnd; j++) {
          for (let k = 0; k < issuesPerPage; k++) {
            const wcagGuidelines = ['1.1.1', '1.4.3', '2.1.1', '2.4.6', '3.3.2', '4.1.2'];
            const severities = ['low', 'medium', 'high', 'critical'];
            
            issuesBatch.push({
              sessionId,
              url: `https://example.com/page-${j}`,
              type: 'accessibility' as const,
              severity: severities[k % severities.length] as any,
              description: `Accessibility issue ${k + 1} on page ${j}`,
              element: `element-${j}-${k}`,
              wcagGuideline: wcagGuidelines[k % wcagGuidelines.length],
              remediation: `Fix accessibility issue ${k + 1}`
            });
          }
        }

        await Promise.all(issuesBatch.map(issue => issueRepo.create(issue)));

        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pageCount / batchSize)}`);
      }

      const generationTime = Date.now() - startTime;
      console.log(`Data generation completed in ${generationTime}ms`);

      // Test accessibility report generation performance
      const reportStartTime = Date.now();
      const accessibilityReport = await reportService.generateAccessibilityReport(sessionId);
      const reportTime = Date.now() - reportStartTime;

      console.log(`Accessibility report generated in ${reportTime}ms`);

      // Verify report accuracy
      expect(accessibilityReport.sessionId).toBe(sessionId);
      expect(accessibilityReport.totalIssues).toBe(pageCount * issuesPerPage);
      expect(accessibilityReport.totalPages).toBe(pageCount);

      // Performance assertions
      expect(reportTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(generationTime).toBeLessThan(60000); // Data generation within 1 minute

      // Test search performance with large accessibility dataset
      const searchStartTime = Date.now();
      const searchResults = await searchService.search('accessibility', {
        sessionId,
        filters: { type: 'accessibility' },
        limit: 100
      });
      const searchTime = Date.now() - searchStartTime;

      expect(searchTime).toBeLessThan(2000); // Search within 2 seconds
      expect(searchResults.hits.length).toBe(100); // Requested limit
    }, 120000); // 2 minute timeout
  });
});