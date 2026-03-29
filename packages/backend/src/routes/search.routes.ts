import { Router, Request, Response } from 'express';
import { SearchService } from '../services/search.service';
import { IndexingService } from '../services/indexing.service';
import { SearchQuery } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';
import Joi from 'joi';

const router = Router();
const searchService = new SearchService();
const indexingService = new IndexingService();

// Validation schemas
const searchQuerySchema = Joi.object({
  query: Joi.string().allow('').optional(),
  filters: Joi.object({
    sessionId: Joi.string().optional(),
    status: Joi.array().items(Joi.string()).optional(),
    issueType: Joi.array().items(Joi.string()).optional(),
    severity: Joi.array().items(Joi.string()).optional(),
    dateRange: Joi.object({
      from: Joi.date().optional(),
      to: Joi.date().optional()
    }).optional(),
    httpStatus: Joi.array().items(Joi.number()).optional(),
    accessibilityScore: Joi.object({
      min: Joi.number().min(0).max(1).optional(),
      max: Joi.number().min(0).max(1).optional()
    }).optional()
  }).optional(),
  sort: Joi.object({
    field: Joi.string().required(),
    order: Joi.string().valid('asc', 'desc').required()
  }).optional(),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    size: Joi.number().integer().min(1).max(100).default(20)
  }).optional(),
  highlight: Joi.boolean().default(true)
});

// Search crawl results
router.post('/crawl-results', async (req: Request, res: Response) => {
  try {
    const { error, value } = searchQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search query',
        details: error.details
      });
    }

    const searchQuery: SearchQuery = value;
    const results = await searchService.searchCrawlResults(searchQuery);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error searching crawl results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search crawl results'
    });
  }
});

// Search issues
router.post('/issues', async (req: Request, res: Response) => {
  try {
    const { error, value } = searchQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search query',
        details: error.details
      });
    }

    const searchQuery: SearchQuery = value;
    const results = await searchService.searchIssues(searchQuery);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error searching issues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search issues'
    });
  }
});

// Search content (full-text search)
router.post('/content', async (req: Request, res: Response) => {
  try {
    const { error, value } = searchQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search query',
        details: error.details
      });
    }

    const searchQuery: SearchQuery = value;
    const results = await searchService.searchContent(searchQuery);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error searching content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search content'
    });
  }
});

// Search all indices
router.post('/all', async (req: Request, res: Response) => {
  try {
    const { error, value } = searchQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search query',
        details: error.details
      });
    }

    const searchQuery: SearchQuery = value;
    const results = await searchService.searchAll(searchQuery);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Error searching all indices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search all indices'
    });
  }
});

// Get search suggestions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { query, field } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const suggestions = await searchService.getSuggestions(
      query,
      typeof field === 'string' ? field : 'title'
    );

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    logger.error('Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions'
    });
  }
});

// Get aggregations
router.get('/aggregations', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    const aggregations = await searchService.getAggregations(
      typeof sessionId === 'string' ? sessionId : undefined
    );

    res.json({
      success: true,
      data: aggregations
    });
  } catch (error) {
    logger.error('Error getting aggregations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get aggregations'
    });
  }
});

// Get index statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await indexingService.getIndexStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting index stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get index stats'
    });
  }
});

// Refresh indices (for testing/admin purposes)
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    await indexingService.refreshIndices();

    res.json({
      success: true,
      message: 'Indices refreshed successfully'
    });
  } catch (error) {
    logger.error('Error refreshing indices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh indices'
    });
  }
});

export default router;