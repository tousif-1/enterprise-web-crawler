import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { JobManagerService } from '../services/job-manager.service';

// Mock dependencies
jest.mock('../database/repositories/crawl-session.repository');
jest.mock('../services/job-manager.service');
jest.mock('../services/job-scheduler.service');

describe('Crawl Session API - Path Exclusion and Failed Link Rescan', () => {
  let app: Express;
  let mockCrawlSessionRepo: jest.Mocked<CrawlSessionRepository>;
  let mockJobManager: jest.Mocked<JobManagerService>;

  beforeEach(() => {
    const { app: expressApp } = createApp();
    app = expressApp;
    mockCrawlSessionRepo = new CrawlSessionRepository() as jest.Mocked<CrawlSessionRepository>;
    mockJobManager = {
      getFailedUrlsForSession: jest.fn(),
      startFailedLinkRescan: jest.fn(),
      validateExclusionPatterns: jest.fn(),
      testExclusionPatterns: jest.fn(),
    } as any;
  });

  describe('POST /api/crawl-sessions/:id/rescan-failed', () => {
    const mockSession = {
      id: 'session-123',
      userId: 'user-456',
      name: 'Test Session',
      status: 'completed' as const,
      config: {
        urls: ['https://example.com'],
        excludePaths: ['/admin'],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true
      },
      progress: {
        totalUrls: 10,
        processedUrls: 8,
        failedUrls: 2
      },
      startTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should create rescan session for failed links', async () => {
      const failedUrls = ['https://example.com/broken1', 'https://example.com/broken2'];
      const rescanSession = {
        ...mockSession,
        id: 'rescan-session-456',
        name: 'Test Session - Failed Links Rescan',
        config: {
          ...mockSession.config,
          urls: failedUrls
        },
        progress: {
          totalUrls: 2,
          processedUrls: 0,
          failedUrls: 0
        }
      };

      mockCrawlSessionRepo.findById.mockResolvedValue(mockSession);
      mockJobManager.getFailedUrlsForSession.mockResolvedValue(failedUrls);
      mockCrawlSessionRepo.create.mockResolvedValue(rescanSession);
      mockJobManager.startFailedLinkRescan.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/rescan-failed')
        .expect(201);

      expect(response.body.data.id).toBe('rescan-session-456');
      expect(response.body.data.name).toContain('Failed Links Rescan');
      expect(response.body.data.config.urls).toEqual(failedUrls);
      expect(response.body.message).toContain('Started rescan of 2 failed URLs');

      expect(mockJobManager.getFailedUrlsForSession).toHaveBeenCalledWith('session-123');
      expect(mockJobManager.startFailedLinkRescan).toHaveBeenCalledWith(rescanSession);
    });

    it('should return message when no failed URLs found', async () => {
      mockCrawlSessionRepo.findById.mockResolvedValue(mockSession);
      mockJobManager.getFailedUrlsForSession.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/rescan-failed')
        .expect(200);

      expect(response.body.message).toBe('No failed URLs found to rescan');
      expect(response.body.data.failedUrls).toBe(0);
      expect(mockCrawlSessionRepo.create).not.toHaveBeenCalled();
    });

    it('should reject rescan for running sessions', async () => {
      const runningSession = { ...mockSession, status: 'running' as const };
      mockCrawlSessionRepo.findById.mockResolvedValue(runningSession);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/rescan-failed')
        .expect(400);

      expect(response.body.error.message).toContain('Cannot rescan failed links while session is running');
    });

    it('should return 404 for non-existent session', async () => {
      mockCrawlSessionRepo.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/crawl-sessions/non-existent/rescan-failed')
        .expect(404);

      expect(response.body.error.message).toBe('Crawl session not found');
    });
  });

  describe('POST /api/crawl-sessions/:id/validate-patterns', () => {
    it('should validate exclusion patterns', async () => {
      const patterns = ['/admin', '*.pdf', '/^\/api\//', 'invalid['];
      const validationResults = [
        { pattern: '/admin', valid: true, type: 'prefix' },
        { pattern: '*.pdf', valid: true, type: 'glob' },
        { pattern: '/^\/api\//', valid: true, type: 'regex' },
        { pattern: 'invalid[', valid: false, error: 'Invalid regular expression' }
      ];

      mockJobManager.validateExclusionPatterns.mockResolvedValue(validationResults);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns })
        .expect(200);

      expect(response.body.data.validations).toEqual(validationResults);
      expect(mockJobManager.validateExclusionPatterns).toHaveBeenCalledWith(patterns);
    });

    it('should test patterns against URLs', async () => {
      const patterns = ['/admin', '*.pdf'];
      const testUrls = ['https://example.com/admin', 'https://example.com/doc.pdf', 'https://example.com/public'];
      const validationResults = [
        { pattern: '/admin', valid: true, type: 'prefix' },
        { pattern: '*.pdf', valid: true, type: 'glob' }
      ];
      const testResults = [
        { url: 'https://example.com/admin', excluded: true, matchedPattern: '/admin' },
        { url: 'https://example.com/doc.pdf', excluded: true, matchedPattern: '*.pdf' },
        { url: 'https://example.com/public', excluded: false }
      ];

      mockJobManager.validateExclusionPatterns.mockResolvedValue(validationResults);
      mockJobManager.testExclusionPatterns.mockResolvedValue(testResults);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns, testUrls })
        .expect(200);

      expect(response.body.data.validations).toEqual(validationResults);
      expect(response.body.data.testResults).toEqual(testResults);
      expect(mockJobManager.testExclusionPatterns).toHaveBeenCalledWith(patterns, testUrls);
    });

    it('should validate patterns without test URLs', async () => {
      const patterns = ['/admin'];
      const validationResults = [{ pattern: '/admin', valid: true, type: 'prefix' }];

      mockJobManager.validateExclusionPatterns.mockResolvedValue(validationResults);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns })
        .expect(200);

      expect(response.body.data.validations).toEqual(validationResults);
      expect(response.body.data.testResults).toEqual([]);
      expect(mockJobManager.testExclusionPatterns).not.toHaveBeenCalled();
    });

    it('should reject invalid request body', async () => {
      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns: 'not-an-array' })
        .expect(400);

      expect(response.body.error.message).toContain('Patterns must be an array');
    });

    it('should handle empty patterns array', async () => {
      mockJobManager.validateExclusionPatterns.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns: [] })
        .expect(200);

      expect(response.body.data.validations).toEqual([]);
      expect(response.body.data.testResults).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle job manager errors gracefully', async () => {
      const mockSession = {
        id: 'session-123',
        status: 'completed' as const
      };

      mockCrawlSessionRepo.findById.mockResolvedValue(mockSession as any);
      mockJobManager.getFailedUrlsForSession.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/rescan-failed')
        .expect(500);

      expect(response.body.error.message).toContain('Database error');
    });

    it('should handle validation service errors', async () => {
      mockJobManager.validateExclusionPatterns.mockRejectedValue(new Error('Validation service error'));

      const response = await request(app)
        .post('/api/crawl-sessions/session-123/validate-patterns')
        .send({ patterns: ['/admin'] })
        .expect(500);

      expect(response.body.error.message).toContain('Validation service error');
    });
  });
});