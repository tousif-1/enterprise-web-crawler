import request from 'supertest';
import express from 'express';
import searchRoutes from '../routes/search.routes';
import { SearchService } from '../services/search.service';
import { IndexingService } from '../services/indexing.service';

// Mock the services
jest.mock('../services/search.service');
jest.mock('../services/indexing.service');
jest.mock('../utils/logger');

const MockSearchService = SearchService as jest.MockedClass<typeof SearchService>;
const MockIndexingService = IndexingService as jest.MockedClass<typeof IndexingService>;

describe('Search Routes', () => {
  let app: express.Application;
  let mockSearchService: jest.Mocked<SearchService>;
  let mockIndexingService: jest.Mocked<IndexingService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/search', searchRoutes);

    mockSearchService = new MockSearchService() as jest.Mocked<SearchService>;
    mockIndexingService = new MockIndexingService() as jest.Mocked<IndexingService>;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('POST /api/search/crawl-results', () => {
    it('should search crawl results successfully', async () => {
      const mockResults = {
        hits: [
          {
            id: 'result1',
            score: 1.5,
            source: {
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
        total: 1,
        page: 1,
        size: 20,
        aggregations: {
          statusCounts: { success: 10, failed: 2 }
        }
      };

      mockSearchService.searchCrawlResults.mockResolvedValue(mockResults);

      const searchQuery = {
        query: 'example',
        pagination: { page: 1, size: 20 },
        highlight: true
      };

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(searchQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResults);
      expect(mockSearchService.searchCrawlResults).toHaveBeenCalledWith(searchQuery);
    });

    it('should validate search query parameters', async () => {
      const invalidQuery = {
        query: 123, // Should be string
        pagination: {
          page: 0, // Should be >= 1
          size: 200 // Should be <= 100
        }
      };

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(invalidQuery)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid search query');
      expect(response.body.details).toBeDefined();
    });

    it('should handle search service errors', async () => {
      mockSearchService.searchCrawlResults.mockRejectedValue(new Error('Search failed'));

      const searchQuery = {
        query: 'test'
      };

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(searchQuery)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to search crawl results');
    });
  });

  describe('POST /api/search/issues', () => {
    it('should search issues successfully', async () => {
      const mockResults = {
        hits: [
          {
            id: 'issue1',
            score: 2.0,
            source: {
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
        total: 1,
        page: 1,
        size: 20,
        aggregations: {
          issueTypeCounts: { accessibility: 15, broken_link: 5 },
          severityCounts: { high: 8, medium: 12 }
        }
      };

      mockSearchService.searchIssues.mockResolvedValue(mockResults);

      const searchQuery = {
        query: 'alt text',
        filters: {
          issueType: ['accessibility'],
          severity: ['high', 'medium']
        }
      };

      const response = await request(app)
        .post('/api/search/issues')
        .send(searchQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResults);
      expect(mockSearchService.searchIssues).toHaveBeenCalledWith(searchQuery);
    });
  });

  describe('POST /api/search/content', () => {
    it('should search content successfully', async () => {
      const mockResults = {
        hits: [
          {
            id: 'content1',
            score: 3.0,
            source: {
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
        total: 1,
        page: 1,
        size: 20
      };

      mockSearchService.searchContent.mockResolvedValue(mockResults);

      const searchQuery = {
        query: 'example content',
        highlight: true
      };

      const response = await request(app)
        .post('/api/search/content')
        .send(searchQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResults);
      expect(mockSearchService.searchContent).toHaveBeenCalledWith(searchQuery);
    });
  });

  describe('POST /api/search/all', () => {
    it('should search all indices successfully', async () => {
      const mockResults = {
        crawlResults: {
          hits: [{ id: '1', score: 1, source: {} }],
          total: 1,
          page: 1,
          size: 20
        },
        issues: {
          hits: [{ id: '2', score: 1, source: {} }],
          total: 1,
          page: 1,
          size: 20
        },
        content: {
          hits: [{ id: '3', score: 1, source: {} }],
          total: 1,
          page: 1,
          size: 20
        }
      };

      mockSearchService.searchAll.mockResolvedValue(mockResults);

      const searchQuery = {
        query: 'test search'
      };

      const response = await request(app)
        .post('/api/search/all')
        .send(searchQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResults);
      expect(mockSearchService.searchAll).toHaveBeenCalledWith(searchQuery);
    });
  });

  describe('GET /api/search/suggestions', () => {
    it('should return search suggestions', async () => {
      const mockSuggestions = ['example', 'example.com', 'example page'];

      mockSearchService.getSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ query: 'exam', field: 'title' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSuggestions);
      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('exam', 'title');
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Query parameter is required');
    });

    it('should use default field when not provided', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([]);

      await request(app)
        .get('/api/search/suggestions')
        .query({ query: 'test' })
        .expect(200);

      expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test', 'title');
    });
  });

  describe('GET /api/search/aggregations', () => {
    it('should return aggregations for all data', async () => {
      const mockAggregations = {
        statusCounts: { success: 100, failed: 10 },
        httpStatusCounts: { '200': 90, '404': 20 },
        issueTypeCounts: { accessibility: 50, broken_link: 30 },
        severityCounts: { high: 20, medium: 40 }
      };

      mockSearchService.getAggregations.mockResolvedValue(mockAggregations);

      const response = await request(app)
        .get('/api/search/aggregations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAggregations);
      expect(mockSearchService.getAggregations).toHaveBeenCalledWith(undefined);
    });

    it('should filter aggregations by session ID', async () => {
      const mockAggregations = {
        statusCounts: { success: 50, failed: 5 }
      };

      mockSearchService.getAggregations.mockResolvedValue(mockAggregations);

      const response = await request(app)
        .get('/api/search/aggregations')
        .query({ sessionId: 'session123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAggregations);
      expect(mockSearchService.getAggregations).toHaveBeenCalledWith('session123');
    });
  });

  describe('GET /api/search/stats', () => {
    it('should return index statistics', async () => {
      const mockStats = {
        crawlResults: 100,
        issues: 50,
        content: 75,
        totalSize: 2304000
      };

      mockIndexingService.getIndexStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/search/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
      expect(mockIndexingService.getIndexStats).toHaveBeenCalled();
    });
  });

  describe('POST /api/search/refresh', () => {
    it('should refresh indices successfully', async () => {
      mockIndexingService.refreshIndices.mockResolvedValue();

      const response = await request(app)
        .post('/api/search/refresh')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Indices refreshed successfully');
      expect(mockIndexingService.refreshIndices).toHaveBeenCalled();
    });

    it('should handle refresh errors', async () => {
      mockIndexingService.refreshIndices.mockRejectedValue(new Error('Refresh failed'));

      const response = await request(app)
        .post('/api/search/refresh')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to refresh indices');
    });
  });

  describe('Complex search scenarios', () => {
    it('should handle complex search with all filters', async () => {
      const mockResults = {
        hits: [],
        total: 0,
        page: 1,
        size: 20,
        aggregations: {}
      };

      mockSearchService.searchCrawlResults.mockResolvedValue(mockResults);

      const complexQuery = {
        query: 'accessibility issues',
        filters: {
          sessionId: 'session123',
          status: ['success', 'failed'],
          issueType: ['accessibility', 'broken_link'],
          severity: ['high', 'critical'],
          dateRange: {
            from: new Date('2023-01-01'),
            to: new Date('2023-12-31')
          },
          httpStatus: [200, 404, 500],
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

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(complexQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSearchService.searchCrawlResults).toHaveBeenCalledWith(complexQuery);
    });

    it('should validate date range filters', async () => {
      const queryWithInvalidDates = {
        query: 'test',
        filters: {
          dateRange: {
            from: 'invalid-date',
            to: 'also-invalid'
          }
        }
      };

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(queryWithInvalidDates)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid search query');
    });

    it('should validate accessibility score range', async () => {
      const queryWithInvalidScore = {
        query: 'test',
        filters: {
          accessibilityScore: {
            min: -0.5, // Invalid: below 0
            max: 1.5   // Invalid: above 1
          }
        }
      };

      const response = await request(app)
        .post('/api/search/crawl-results')
        .send(queryWithInvalidScore)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid search query');
    });
  });
});