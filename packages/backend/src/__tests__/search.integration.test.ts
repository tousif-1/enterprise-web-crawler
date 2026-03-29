import { SearchService } from '../services/search.service';
import { IndexingService } from '../services/indexing.service';
import { HashUtil } from '../utils/hash.util';
import { 
  CrawlResult, 
  Issue, 
  SearchQuery 
} from '@enterprise-web-crawler/shared';

// Mock Elasticsearch client
jest.mock('../config/elasticsearch.config');
jest.mock('../utils/logger');

const mockElasticsearchClient = {
  search: jest.fn(),
  index: jest.fn(),
  bulk: jest.fn(),
  indices: {
    create: jest.fn(),
    exists: jest.fn(),
    delete: jest.fn(),
    refresh: jest.fn(),
    stats: jest.fn()
  },
  deleteByQuery: jest.fn(),
  ping: jest.fn(),
  close: jest.fn()
};

// Mock the getElasticsearchClient function
const mockGetElasticsearchClient = require('../config/elasticsearch.config').getElasticsearchClient as jest.Mock;
mockGetElasticsearchClient.mockReturnValue({
  getClient: () => mockElasticsearchClient,
  createIndex: jest.fn(),
  deleteIndex: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn()
});

describe('Search Integration Tests', () => {
  let searchService: SearchService;
  let indexingService: IndexingService;

  beforeEach(() => {
    searchService = new SearchService();
    indexingService = new IndexingService();
    jest.clearAllMocks();
  });

  describe('End-to-end search workflow', () => {
    it('should index and search crawl results successfully', async () => {
      // Setup mock responses
      mockElasticsearchClient.indices.exists.mockResolvedValue(false);
      mockElasticsearchClient.indices.create.mockResolvedValue({});
      mockElasticsearchClient.index.mockResolvedValue({});
      mockElasticsearchClient.indices.refresh.mockResolvedValue({});

      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _id: 'test-result-1',
              _score: 1.5,
              _source: {
                id: 'test-result-1',
                sessionId: 'test-session',
                url: 'https://example.com/test',
                status: 'success',
                httpStatus: 200,
                responseTime: 500,
                contentHash: 'test-hash',
                lastModified: new Date(),
                issues: [],
                accessibilityScore: 0.85,
                createdAt: new Date(),
                content: '<html><body>Test content</body></html>',
                title: 'Test Page'
              },
              highlight: {
                title: ['<mark>Test</mark> Page']
              }
            }
          ],
          total: { value: 1 }
        },
        aggregations: {
          status_counts: {
            buckets: [
              { key: 'success', doc_count: 1 }
            ]
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      // Initialize indexing service
      await indexingService.initialize();

      // Create test data
      const crawlResult: CrawlResult = {
        id: 'test-result-1',
        sessionId: 'test-session',
        url: 'https://example.com/test',
        status: 'success',
        httpStatus: 200,
        responseTime: 500,
        contentHash: HashUtil.generateMD5('<html><body>Test content</body></html>'),
        lastModified: new Date(),
        issues: [],
        accessibilityScore: 0.85,
        createdAt: new Date()
      };

      const htmlContent = '<html><body>Test content</body></html>';

      // Index the crawl result
      await indexingService.indexCrawlResult(crawlResult, htmlContent);

      // Verify indexing was called
      expect(mockElasticsearchClient.index).toHaveBeenCalledTimes(2); // Once for crawl results, once for content

      // Search for the indexed content
      const searchQuery: SearchQuery = {
        query: 'test',
        highlight: true,
        pagination: { page: 1, size: 20 }
      };

      const searchResults = await searchService.searchCrawlResults(searchQuery);

      // Verify search results
      expect(searchResults.hits).toHaveLength(1);
      expect(searchResults.hits[0].id).toBe('test-result-1');
      expect(searchResults.hits[0].source.url).toBe('https://example.com/test');
      expect(searchResults.hits[0].highlight).toBeDefined();
      expect(searchResults.total).toBe(1);
      expect(searchResults.aggregations?.statusCounts).toEqual({ success: 1 });
    });

    it('should index and search issues successfully', async () => {
      // Setup mock responses
      mockElasticsearchClient.bulk.mockResolvedValue({});
      mockElasticsearchClient.index.mockResolvedValue({});

      const mockSearchResponse = {
        hits: {
          hits: [
            {
              _id: 'test-issue-1',
              _score: 2.0,
              _source: {
                id: 'test-issue-1',
                type: 'accessibility',
                severity: 'high',
                description: 'Missing alt text for image',
                element: 'img',
                wcagGuideline: '1.1.1',
                remediation: 'Add meaningful alt attribute'
              }
            }
          ],
          total: { value: 1 }
        },
        aggregations: {
          issue_type_counts: {
            buckets: [
              { key: 'accessibility', doc_count: 1 }
            ]
          },
          severity_counts: {
            buckets: [
              { key: 'high', doc_count: 1 }
            ]
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      // Create test issues
      const issues: Issue[] = [
        {
          id: 'test-issue-1',
          type: 'accessibility',
          severity: 'high',
          description: 'Missing alt text for image',
          element: 'img',
          wcagGuideline: '1.1.1',
          remediation: 'Add meaningful alt attribute'
        }
      ];

      // Index the issues
      await indexingService.indexIssues(issues, 'test-session', 'https://example.com/test');

      // Verify bulk indexing was called
      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith({
        operations: expect.arrayContaining([
          { index: { _index: 'issues', _id: 'test-issue-1' } },
          expect.objectContaining({
            id: 'test-issue-1',
            sessionId: 'test-session',
            url: 'https://example.com/test'
          })
        ])
      });

      // Search for issues
      const searchQuery: SearchQuery = {
        query: 'alt text',
        filters: {
          severity: ['high']
        }
      };

      const searchResults = await searchService.searchIssues(searchQuery);

      // Verify search results
      expect(searchResults.hits).toHaveLength(1);
      expect(searchResults.hits[0].source.type).toBe('accessibility');
      expect(searchResults.hits[0].source.severity).toBe('high');
      expect(searchResults.aggregations?.issueTypeCounts).toEqual({ accessibility: 1 });
      expect(searchResults.aggregations?.severityCounts).toEqual({ high: 1 });
    });

    it('should handle content change detection', async () => {
      const originalContent = '<html><body>Original content</body></html>';
      const modifiedContent = '<html><body>Modified content</body></html>';

      // Generate hashes
      const originalHash = HashUtil.generateMD5(originalContent);
      const modifiedHash = HashUtil.generateMD5(modifiedContent);

      // Verify hashes are different
      expect(originalHash).not.toBe(modifiedHash);

      // Test content change detection
      const hashResult = HashUtil.generateContentHashResult(
        'https://example.com/test',
        modifiedContent,
        originalHash
      );

      expect(hashResult.hasChanged).toBe(true);
      expect(hashResult.currentHash).toBe(modifiedHash);
      expect(hashResult.previousHash).toBe(originalHash);
      expect(hashResult.changeDetectedAt).toBeInstanceOf(Date);
    });

    it('should handle text-only content comparison', async () => {
      const html1 = '<div><p>Hello World</p></div>';
      const html2 = '<span><strong>Hello World</strong></span>';
      const html3 = '<div><p>Different content</p></div>';

      // Same text content, different HTML structure
      const textHash1 = HashUtil.generateTextContentHash(html1);
      const textHash2 = HashUtil.generateTextContentHash(html2);
      const textHash3 = HashUtil.generateTextContentHash(html3);

      expect(textHash1).toBe(textHash2); // Same text content
      expect(textHash1).not.toBe(textHash3); // Different text content
    });

    it('should clean up session data', async () => {
      mockElasticsearchClient.deleteByQuery.mockResolvedValue({});

      await indexingService.deleteSessionData('test-session');

      // Verify delete was called for all indices
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(3);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: 'crawl-results',
        query: {
          term: {
            sessionId: 'test-session'
          }
        }
      });
    });

    it('should get index statistics', async () => {
      const mockStats = {
        indices: {
          'crawl-results': {
            total: {
              docs: { count: 100 },
              store: { size_in_bytes: 1024000 }
            }
          },
          'issues': {
            total: {
              docs: { count: 50 },
              store: { size_in_bytes: 512000 }
            }
          },
          'content': {
            total: {
              docs: { count: 75 },
              store: { size_in_bytes: 768000 }
            }
          }
        }
      };

      mockElasticsearchClient.indices.stats.mockResolvedValue(mockStats);

      const stats = await indexingService.getIndexStats();

      expect(stats).toEqual({
        crawlResults: 100,
        issues: 50,
        content: 75,
        totalSize: 2304000
      });
    });
  });

  describe('Search query building', () => {
    it('should build complex search queries with filters', async () => {
      const mockResponse = {
        hits: { hits: [], total: { value: 0 } },
        aggregations: {}
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const complexQuery: SearchQuery = {
        query: 'accessibility issues',
        filters: {
          sessionId: 'test-session',
          status: ['success', 'failed'],
          dateRange: {
            from: new Date('2023-01-01'),
            to: new Date('2023-12-31')
          },
          accessibilityScore: {
            min: 0.0,
            max: 0.5
          }
        },
        sort: {
          field: 'accessibilityScore',
          order: 'asc'
        },
        pagination: {
          page: 2,
          size: 50
        },
        highlight: true
      };

      await searchService.searchCrawlResults(complexQuery);

      // Verify the search was called with correct parameters
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'crawl-results',
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: expect.objectContaining({
              multi_match: expect.objectContaining({
                query: 'accessibility issues'
              })
            }),
            filter: expect.arrayContaining([
              { term: { sessionId: 'test-session' } },
              { terms: { status: ['success', 'failed'] } },
              { range: { accessibilityScore: { gte: 0.0, lte: 0.5 } } }
            ])
          })
        }),
        sort: [{ accessibilityScore: { order: 'asc' } }],
        from: 50, // (page 2 - 1) * size 50
        size: 50,
        highlight: expect.any(Object),
        aggs: expect.any(Object)
      });
    });
  });
});