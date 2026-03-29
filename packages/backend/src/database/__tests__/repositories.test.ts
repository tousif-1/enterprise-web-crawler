import { CrawlSessionRepository, CrawlResultRepository, IssueRepository, LinkRepository } from '../repositories';
import { DatabaseConnection } from '../connection';

// Mock the database connection for testing
jest.mock('../connection');

describe('Database Repositories', () => {
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let linkRepo: LinkRepository;

  beforeEach(() => {
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();
    linkRepo = new LinkRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CrawlSessionRepository', () => {
    it('should create a new crawl session', async () => {
      const mockSession = {
        id: '123',
        userId: 'user-123',
        name: 'Test Session',
        status: 'pending' as const,
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        },
        startTime: new Date(),
        endTime: undefined,
        progress: {
          totalUrls: 0,
          processedUrls: 0,
          failedUrls: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockResult = {
        rows: [{
          id: '123',
          user_id: 'user-123',
          name: 'Test Session',
          status: 'pending',
          config: mockSession.config,
          start_time: mockSession.startTime,
          end_time: null,
          total_urls: 0,
          processed_urls: 0,
          failed_urls: 0,
          created_at: mockSession.createdAt,
          updated_at: mockSession.updatedAt
        }]
      };

      (DatabaseConnection.query as jest.Mock).mockResolvedValue(mockResult);

      const sessionData = {
        userId: 'user-123',
        name: 'Test Session',
        status: 'pending' as const,
        config: mockSession.config,
        startTime: mockSession.startTime,
        endTime: undefined,
        progress: {
          totalUrls: 0,
          processedUrls: 0,
          failedUrls: 0
        }
      };

      const result = await crawlSessionRepo.create(sessionData);

      expect(result).toEqual(mockSession);
      expect(DatabaseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO crawl_sessions'),
        expect.any(Array)
      );
    });

    it('should update session progress', async () => {
      const mockResult = {
        rows: [{
          id: '123',
          user_id: 'user-123',
          name: 'Test Session',
          status: 'running',
          config: {},
          start_time: new Date(),
          end_time: null,
          total_urls: 100,
          processed_urls: 50,
          failed_urls: 5,
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      (DatabaseConnection.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await crawlSessionRepo.updateProgress('123', {
        totalUrls: 100,
        processedUrls: 50,
        failedUrls: 5
      });

      expect(result).toBeDefined();
      expect(result?.progress.totalUrls).toBe(100);
      expect(result?.progress.processedUrls).toBe(50);
      expect(result?.progress.failedUrls).toBe(5);
    });
  });

  describe('CrawlResultRepository', () => {
    it('should create a new crawl result', async () => {
      const mockResult = {
        rows: [{
          id: '456',
          session_id: '123',
          url: 'https://example.com',
          status: 'success',
          http_status: 200,
          response_time: 1000,
          content_hash: 'abc123',
          last_modified: new Date(),
          accessibility_score: 85.5,
          created_at: new Date()
        }]
      };

      (DatabaseConnection.query as jest.Mock).mockResolvedValue(mockResult);

      const resultData = {
        sessionId: '123',
        url: 'https://example.com',
        status: 'success' as const,
        httpStatus: 200,
        responseTime: 1000,
        contentHash: 'abc123',
        lastModified: new Date(),
        accessibilityScore: 85.5
      };

      const result = await crawlResultRepo.create(resultData);

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(result.status).toBe('success');
      expect(result.httpStatus).toBe(200);
    });
  });

  describe('IssueRepository', () => {
    it('should create a new issue', async () => {
      const mockResult = {
        rows: [{
          id: '789',
          type: 'accessibility',
          severity: 'high',
          description: 'Missing alt text',
          element: '<img>',
          wcag_guideline: '1.1.1',
          remediation: 'Add alt text'
        }]
      };

      (DatabaseConnection.query as jest.Mock).mockResolvedValue(mockResult);

      const issueData = {
        type: 'accessibility' as const,
        severity: 'high' as const,
        description: 'Missing alt text',
        element: '<img>',
        wcagGuideline: '1.1.1',
        remediation: 'Add alt text'
      };

      const result = await issueRepo.create('456', issueData);

      expect(result).toBeDefined();
      expect(result.type).toBe('accessibility');
      expect(result.severity).toBe('high');
      expect(result.description).toBe('Missing alt text');
    });
  });

  describe('LinkRepository', () => {
    it('should create a new link', async () => {
      const mockResult = {
        rows: [{
          url: 'https://example.com/about',
          source_url: 'https://example.com',
          text: 'About Us',
          type: 'internal',
          status: 'valid',
          http_status: 200,
          redirect_url: null
        }]
      };

      (DatabaseConnection.query as jest.Mock).mockResolvedValue(mockResult);

      const linkData = {
        url: 'https://example.com/about',
        sourceUrl: 'https://example.com',
        text: 'About Us',
        type: 'internal' as const,
        status: 'valid' as const,
        httpStatus: 200,
        redirectUrl: undefined
      };

      const result = await linkRepo.create('456', linkData);

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/about');
      expect(result.type).toBe('internal');
      expect(result.status).toBe('valid');
    });
  });
});