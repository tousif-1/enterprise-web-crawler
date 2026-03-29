import { SearchService } from '../services/search.service';
import { IndexingService } from '../services/indexing.service';
import { getElasticsearchClient } from '../config/elasticsearch.config';
import { 
  CrawlResult, 
  Issue, 
  SearchQuery,
  SearchFilters 
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

(getElasticsearchClient as jest.Mock).mockReturnValue({
  getClient: () => mockElasticsearchClient,
  createIndex: jest.fn(),
  deleteIndex: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn()
});

describe('SearchService', () => {
  let searchService: SearchService;
  let indexingService: IndexingService;

  beforeEach(() => {
    searchService = new SearchService();
    indexingService = new IndexingService();
    jest.clearAllMocks();
  });

  describe('searchCrawlResults', () => {
    it('should search crawl results with basic query', async () => {
      const mockResponse = {
        body: {
          hits: {
            hits: [
              {
                _id: 'result1',
                _score: 1.5,
                _source: {
                  id: 'result1',
                  sessionId: 'session1',
                  url: 'https://example.com',
                  status: 'success',
                  httpStatus: 200,
                  responseTime: 500,
                  contentHash: 'hash123',
                  lastModified: new Date(),
                  issues: [],
                  accessibilityScore: 0.85,
                  createdAt: new Date()
                },
                highlight: {
                  url: ['<mark>example</mark>.com']
                }
              }
            ],
            total: { value: 1 }
          },
          aggregations: {
            status_counts: {
              buckets: [
                { key: 'success', doc_count: 10 },
                { key: 'failed', doc_count: 2 }
              ]
            }
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const searchQuery: SearchQuery = {
        query: 'example',
        pagination: { page: 1, size: 20 },
        highlight: true
      };

      const result = await searchService.searchCrawlResults(searchQuery);

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].id).toBe('result1');
      expect(result.hits[0].highlight).toBeDefined();
      expect(result.total).toBe(1);
      expect(result.aggregations?.statusCounts).toEqual({
        success: 10,
        failed: 2
      });
    });

    it('should apply filters correctly', async () => {
      const mockResponse = {
        body: {
          hits: { hits: [], total: { value: 0 } },
          aggregations: {}
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const filters: SearchFilters = {
        sessionId: 'session1',
        status: ['success', 'failed'],
        httpStatus: [200, 404],
        dateRange: {
          from: new Date('2023-01-01'),
          to: new Date('2023-12-31')
        },
        accessibilityScore: {
          min: 0.5,
          max: 1.0
        }
      };

      const searchQuery: SearchQuery = {
        query: 'test',
        filters,
        sort: { field: 'createdAt', order: 'desc' },
        pagination: { page: 1, size: 10 }
      };

      await searchService.searchCrawlResults(searchQuery);

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'crawl-results',
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { sessionId: 'session1' } },
                { terms: { status: ['success', 'failed'] } },
                { terms: { httpStatus: [200, 404] } },
                { range: { createdAt: { gte: filters.dateRange!.from, lte: filters.dateRange!.to } } },
                { range: { accessibilityScore: { gte: 0.5, lte: 1.0 } } }
              ])
            })
          }),
          sort: [{ createdAt: { order: 'desc' } }],
          from: 0,
          size: 10
        })
      });
    });
  });

  describe('searchIssues', () => {
    it('should search issues with filters', async () => {
      const mockResponse = {
        body: {
          hits: {
            hits: [
              {
                _id: 'issue1',
                _score: 2.0,
                _source: {
                  id: 'issue1',
                  type: 'accessibility',
                  severity: 'high',
                  description: 'Missing alt text',
                  element: 'img',
                  wcagGuideline: '1.1.1',
                  remediation: 'Add alt attribute'
                }
              }
            ],
            total: { value: 1 }
          },
          aggregations: {
            issue_type_counts: {
              buckets: [
                { key: 'accessibility', doc_count: 15 },
                { key: 'broken_link', doc_count: 5 }
              ]
            },
            severity_counts: {
              buckets: [
                { key: 'high', doc_count: 8 },
                { key: 'medium', doc_count: 12 }
              ]
            }
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const searchQuery: SearchQuery = {
        query: 'alt text',
        filters: {
          issueType: ['accessibility'],
          severity: ['high', 'medium']
        }
      };

      const result = await searchService.searchIssues(searchQuery);

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].source.type).toBe('accessibility');
      expect(result.aggregations?.issueTypeCounts).toEqual({
        accessibility: 15,
        broken_link: 5
      });
      expect(result.aggregations?.severityCounts).toEqual({
        high: 8,
        medium: 12
      });
    });
  });

  describe('searchContent', () => {
    it('should perform full-text content search', async () => {
      const mockResponse = {
        body: {
          hits: {
            hits: [
              {
                _id: 'content1',
                _score: 3.0,
                _source: {
                  sessionId: 'session1',
                  url: 'https://example.com/page1',
                  title: 'Example Page',
                  content: '<html><body>This is example content</body></html>',
                  textContent: 'This is example content',
                  contentHash: 'hash456',
                  lastModified: new Date(),
                  metadata: { title: 'Example Page' }
                },
                highlight: {
                  title: ['<mark>Example</mark> Page'],
                  textContent: ['This is <mark>example</mark> content']
                }
              }
            ],
            total: { value: 1 }
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const searchQuery: SearchQuery = {
        query: 'example content',
        highlight: true
      };

      const result = await searchService.searchContent(searchQuery);

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].highlight).toBeDefined();
      expect(result.hits[0].highlight!.title).toContain('<mark>Example</mark>');
    });
  });

  describe('searchAll', () => {
    it('should search all indices simultaneously', async () => {
      const mockCrawlResponse = {
        body: {
          hits: { hits: [{ _id: '1', _score: 1, _source: {} }], total: { value: 1 } },
          aggregations: {}
        }
      };

      const mockIssuesResponse = {
        body: {
          hits: { hits: [{ _id: '2', _score: 1, _source: {} }], total: { value: 1 } },
          aggregations: {}
        }
      };

      const mockContentResponse = {
        body: {
          hits: { hits: [{ _id: '3', _score: 1, _source: {} }], total: { value: 1 } },
          aggregations: {}
        }
      };

      mockElasticsearchClient.search
        .mockResolvedValueOnce(mockCrawlResponse)
        .mockResolvedValueOnce(mockIssuesResponse)
        .mockResolvedValueOnce(mockContentResponse);

      const searchQuery: SearchQuery = {
        query: 'test search'
      };

      const result = await searchService.searchAll(searchQuery);

      expect(result.crawlResults.hits).toHaveLength(1);
      expect(result.issues.hits).toHaveLength(1);
      expect(result.content.hits).toHaveLength(1);
      expect(mockElasticsearchClient.search).toHaveBeenCalledTimes(3);
    });
  });

  describe('getSuggestions', () => {
    it('should return search suggestions', async () => {
      const mockResponse = {
        body: {
          suggest: {
            suggestions: [
              {
                options: [
                  { text: 'example' },
                  { text: 'example.com' },
                  { text: 'example page' }
                ]
              }
            ]
          }
        }
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const suggestions = await searchService.getSuggestions('exam', 'title');

      expect(suggestions).toEqual(['example', 'example.com', 'example page']);
      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: ['crawl-results', 'content'],
        body: {
          suggest: {
            suggestions: {
              text: 'exam',
              term: {
                field: 'title',
                size: 5
              }
            }
          }
        }
      });
    });
  });

  describe('getAggregations', () => {
    it('should return aggregations for all data', async () => {
      const mockCrawlAggs = {
        body: {
          aggregations: {
            status_counts: {
              buckets: [
                { key: 'success', doc_count: 100 },
                { key: 'failed', doc_count: 10 }
              ]
            },
            http_status_counts: {
              buckets: [
                { key: 200, doc_count: 90 },
                { key: 404, doc_count: 20 }
              ]
            }
          }
        }
      };

      const mockIssuesAggs = {
        body: {
          aggregations: {
            issue_type_counts: {
              buckets: [
                { key: 'accessibility', doc_count: 50 },
                { key: 'broken_link', doc_count: 30 }
              ]
            },
            severity_counts: {
              buckets: [
                { key: 'high', doc_count: 20 },
                { key: 'medium', doc_count: 40 }
              ]
            }
          }
        }
      };

      mockElasticsearchClient.search
        .mockResolvedValueOnce(mockCrawlAggs)
        .mockResolvedValueOnce(mockIssuesAggs);

      const aggregations = await searchService.getAggregations();

      expect(aggregations).toEqual({
        statusCounts: { success: 100, failed: 10 },
        httpStatusCounts: { '200': 90, '404': 20 },
        issueTypeCounts: { accessibility: 50, broken_link: 30 },
        severityCounts: { high: 20, medium: 40 }
      });
    });

    it('should filter aggregations by session ID', async () => {
      const mockCrawlAggs = {
        body: { aggregations: { status_counts: { buckets: [] } } }
      };

      const mockIssuesAggs = {
        body: { aggregations: { issue_type_counts: { buckets: [] } } }
      };

      mockElasticsearchClient.search
        .mockResolvedValueOnce(mockCrawlAggs)
        .mockResolvedValueOnce(mockIssuesAggs);

      await searchService.getAggregations('session123');

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: { term: { sessionId: 'session123' } }
          })
        })
      );
    });
  });
});

describe('IndexingService', () => {
  let indexingService: IndexingService;

  beforeEach(() => {
    indexingService = new IndexingService();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize indices successfully', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(false);
      mockElasticsearchClient.indices.create.mockResolvedValue({});

      await indexingService.initialize();

      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('indexCrawlResult', () => {
    it('should index crawl result with HTML content', async () => {
      const crawlResult: CrawlResult = {
        id: 'result1',
        sessionId: 'session1',
        url: 'https://example.com',
        status: 'success',
        httpStatus: 200,
        responseTime: 500,
        contentHash: 'hash123',
        lastModified: new Date(),
        issues: [],
        accessibilityScore: 0.85,
        createdAt: new Date()
      };

      const htmlContent = '<html><head><title>Example</title></head><body>Content</body></html>';

      mockElasticsearchClient.index.mockResolvedValue({});

      await indexingService.indexCrawlResult(crawlResult, htmlContent);

      expect(mockElasticsearchClient.index).toHaveBeenCalledTimes(2); // Once for crawl results, once for content
      expect(mockElasticsearchClient.index).toHaveBeenCalledWith({
        index: 'crawl-results',
        id: 'result1',
        body: expect.objectContaining({
          ...crawlResult,
          content: htmlContent,
          title: 'Example'
        })
      });
    });
  });

  describe('indexIssues', () => {
    it('should bulk index multiple issues', async () => {
      const issues: Issue[] = [
        {
          id: 'issue1',
          type: 'accessibility',
          severity: 'high',
          description: 'Missing alt text',
          element: 'img',
          wcagGuideline: '1.1.1',
          remediation: 'Add alt attribute'
        },
        {
          id: 'issue2',
          type: 'broken_link',
          severity: 'medium',
          description: 'Link returns 404',
          element: 'a'
        }
      ];

      mockElasticsearchClient.bulk.mockResolvedValue({});
      mockElasticsearchClient.index.mockResolvedValue({});

      await indexingService.indexIssues(issues, 'session1', 'https://example.com');

      expect(mockElasticsearchClient.bulk).toHaveBeenCalledWith({
        body: expect.arrayContaining([
          { index: { _index: 'issues', _id: 'issue1' } },
          expect.objectContaining({
            id: 'issue1',
            sessionId: 'session1',
            url: 'https://example.com'
          })
        ])
      });

      expect(mockElasticsearchClient.index).toHaveBeenCalledTimes(2); // Once for each issue in content index
    });
  });

  describe('deleteSessionData', () => {
    it('should delete all data for a session', async () => {
      mockElasticsearchClient.deleteByQuery.mockResolvedValue({});

      await indexingService.deleteSessionData('session1');

      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledTimes(3);
      expect(mockElasticsearchClient.deleteByQuery).toHaveBeenCalledWith({
        index: 'crawl-results',
        body: {
          query: {
            term: {
              sessionId: 'session1'
            }
          }
        }
      });
    });
  });

  describe('getIndexStats', () => {
    it('should return index statistics', async () => {
      const mockStats = {
        body: {
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
});