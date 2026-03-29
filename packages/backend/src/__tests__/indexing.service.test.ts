import { IndexingService } from '../services/indexing.service';
import { Client } from '@elastic/elasticsearch';
import { CrawlResult, Issue } from '@enterprise-web-crawler/shared';

// Mock Elasticsearch client
jest.mock('@elastic/elasticsearch');

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {
      index: jest.fn(),
      delete: jest.fn(),
      indices: {
        create: jest.fn(),
        exists: jest.fn(),
      },
      bulk: jest.fn(),
    } as any;

    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);
    indexingService = new IndexingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('indexCrawlResult', () => {
    it('should index a crawl result successfully', async () => {
      const crawlResult: CrawlResult = {
        id: 'test-result-1',
        sessionId: 'session-1',
        url: 'https://example.com',
        status: 'success',
        httpStatus: 200,
        responseTime: 150,
        contentHash: 'abc123',
        lastModified: new Date(),
        issues: [],
        accessibilityScore: 95,
        createdAt: new Date(),
      };

      mockClient.index.mockResolvedValue({
        body: { _id: 'test-result-1', result: 'created' }
      } as any);

      await indexingService.indexCrawlResult(crawlResult);

      expect(mockClient.index).toHaveBeenCalledWith({
        index: 'crawl-results',
        id: crawlResult.id,
        body: expect.objectContaining({
          sessionId: crawlResult.sessionId,
          url: crawlResult.url,
          status: crawlResult.status,
          httpStatus: crawlResult.httpStatus,
          accessibilityScore: crawlResult.accessibilityScore,
        }),
      });
    });

    it('should handle indexing errors gracefully', async () => {
      const crawlResult: CrawlResult = {
        id: 'test-result-1',
        sessionId: 'session-1',
        url: 'https://example.com',
        status: 'success',
        httpStatus: 200,
        responseTime: 150,
        contentHash: 'abc123',
        lastModified: new Date(),
        issues: [],
        accessibilityScore: 95,
        createdAt: new Date(),
      };

      mockClient.index.mockRejectedValue(new Error('Elasticsearch error'));

      await expect(indexingService.indexCrawlResult(crawlResult)).rejects.toThrow('Elasticsearch error');
    });
  });

  describe('indexIssue', () => {
    it('should index an issue successfully', async () => {
      const issue: Issue = {
        id: 'issue-1',
        type: 'accessibility',
        severity: 'high',
        description: 'Missing alt text',
        element: 'img',
        wcagGuideline: '1.1.1',
        remediation: 'Add alt attribute',
      };

      mockClient.index.mockResolvedValue({
        body: { _id: 'issue-1', result: 'created' }
      } as any);

      await indexingService.indexIssue(issue, 'session-1', 'https://example.com');

      expect(mockClient.index).toHaveBeenCalledWith({
        index: 'issues',
        id: issue.id,
        body: expect.objectContaining({
          sessionId: 'session-1',
          url: 'https://example.com',
          type: issue.type,
          severity: issue.severity,
          description: issue.description,
          wcagGuideline: issue.wcagGuideline,
        }),
      });
    });
  });

  describe('bulkIndex', () => {
    it('should perform bulk indexing successfully', async () => {
      const crawlResults: CrawlResult[] = [
        {
          id: 'result-1',
          sessionId: 'session-1',
          url: 'https://example.com/page1',
          status: 'success',
          httpStatus: 200,
          responseTime: 150,
          contentHash: 'abc123',
          lastModified: new Date(),
          issues: [],
          accessibilityScore: 95,
          createdAt: new Date(),
        },
        {
          id: 'result-2',
          sessionId: 'session-1',
          url: 'https://example.com/page2',
          status: 'success',
          httpStatus: 200,
          responseTime: 200,
          contentHash: 'def456',
          lastModified: new Date(),
          issues: [],
          accessibilityScore: 88,
          createdAt: new Date(),
        },
      ];

      mockClient.bulk.mockResolvedValue({
        body: {
          errors: false,
          items: [
            { index: { _id: 'result-1', result: 'created' } },
            { index: { _id: 'result-2', result: 'created' } },
          ],
        }
      } as any);

      await indexingService.bulkIndexCrawlResults(crawlResults);

      expect(mockClient.bulk).toHaveBeenCalledWith({
        body: expect.arrayContaining([
          { index: { _index: 'crawl-results', _id: 'result-1' } },
          expect.objectContaining({ url: 'https://example.com/page1' }),
          { index: { _index: 'crawl-results', _id: 'result-2' } },
          expect.objectContaining({ url: 'https://example.com/page2' }),
        ]),
      });
    });

    it('should handle bulk indexing errors', async () => {
      const crawlResults: CrawlResult[] = [
        {
          id: 'result-1',
          sessionId: 'session-1',
          url: 'https://example.com/page1',
          status: 'success',
          httpStatus: 200,
          responseTime: 150,
          contentHash: 'abc123',
          lastModified: new Date(),
          issues: [],
          accessibilityScore: 95,
          createdAt: new Date(),
        },
      ];

      mockClient.bulk.mockResolvedValue({
        body: {
          errors: true,
          items: [
            { index: { _id: 'result-1', error: { reason: 'Document already exists' } } },
          ],
        }
      } as any);

      await expect(indexingService.bulkIndexCrawlResults(crawlResults)).rejects.toThrow('Bulk indexing failed');
    });
  });

  describe('deleteIndex', () => {
    it('should delete an index successfully', async () => {
      mockClient.indices.exists.mockResolvedValue({ body: true } as any);
      mockClient.indices.delete = jest.fn().mockResolvedValue({ body: { acknowledged: true } } as any);

      await indexingService.deleteIndex('test-index');

      expect(mockClient.indices.delete).toHaveBeenCalledWith({ index: 'test-index' });
    });

    it('should handle non-existent index gracefully', async () => {
      mockClient.indices.exists.mockResolvedValue({ body: false } as any);

      await indexingService.deleteIndex('non-existent-index');

      expect(mockClient.indices.delete).not.toHaveBeenCalled();
    });
  });

  describe('ensureIndicesExist', () => {
    it('should create indices if they do not exist', async () => {
      mockClient.indices.exists.mockResolvedValue({ body: false } as any);
      mockClient.indices.create.mockResolvedValue({ body: { acknowledged: true } } as any);

      await indexingService.ensureIndicesExist();

      expect(mockClient.indices.create).toHaveBeenCalledTimes(2); // crawl-results and issues indices
    });

    it('should not create indices if they already exist', async () => {
      mockClient.indices.exists.mockResolvedValue({ body: true } as any);

      await indexingService.ensureIndicesExist();

      expect(mockClient.indices.create).not.toHaveBeenCalled();
    });
  });
});