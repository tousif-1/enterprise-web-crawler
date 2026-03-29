import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/error.middleware';
import { queryParamsSchema } from '../middleware/validation.middleware';
import { CrawlResultRepository } from '../database/repositories/crawl-result.repository';
import { IssueRepository } from '../database/repositories/issue.repository';
import { LinkRepository } from '../database/repositories/link.repository';
import Joi from 'joi';

const router = Router();
const crawlResultRepo = new CrawlResultRepository();
const issueRepo = new IssueRepository();
const linkRepo = new LinkRepository();

// Extended query schema for crawl results
const crawlResultQuerySchema = queryParamsSchema.keys({
  sessionId: Joi.string().uuid(),
  status: Joi.string().valid('success', 'failed', 'skipped'),
  minAccessibilityScore: Joi.number().min(0).max(100),
  maxAccessibilityScore: Joi.number().min(0).max(100),
  hasIssues: Joi.boolean(),
  issueType: Joi.string().valid('broken_link', 'missing_image', 'accessibility', 'performance'),
  issueSeverity: Joi.string().valid('low', 'medium', 'high', 'critical'),
  url: Joi.string()
});

// GET /api/crawl-results - List crawl results with filtering
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { error, value: query } = crawlResultQuerySchema.validate(req.query);
  if (error) {
    throw new AppError(`Query validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const { 
    page, 
    limit, 
    sessionId, 
    status, 
    minAccessibilityScore, 
    maxAccessibilityScore,
    hasIssues,
    issueType,
    issueSeverity,
    url,
    sortBy, 
    sortOrder 
  } = query;
  
  const offset = (page - 1) * limit;

  const filters: any = {};
  if (sessionId) filters.sessionId = sessionId;
  if (status) filters.status = status;
  if (minAccessibilityScore !== undefined) filters.minAccessibilityScore = minAccessibilityScore;
  if (maxAccessibilityScore !== undefined) filters.maxAccessibilityScore = maxAccessibilityScore;
  if (hasIssues !== undefined) filters.hasIssues = hasIssues;
  if (issueType) filters.issueType = issueType;
  if (issueSeverity) filters.issueSeverity = issueSeverity;
  if (url) filters.url = url;

  const results = await crawlResultRepo.findAll(filters, {
    limit,
    offset,
    orderBy: sortBy,
    orderDirection: sortOrder
  });

  const total = await crawlResultRepo.count(filters);

  res.json({
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// GET /api/crawl-results/:id - Get specific crawl result
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const result = await crawlResultRepo.findById(id);
  if (!result) {
    throw new AppError('Crawl result not found', 404);
  }

  res.json({ data: result });
}));

// GET /api/crawl-results/:id/issues - Get issues for specific crawl result
router.get('/:id/issues', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error, value: query } = queryParamsSchema.validate(req.query);
  if (error) {
    throw new AppError(`Query validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const result = await crawlResultRepo.findById(id);
  if (!result) {
    throw new AppError('Crawl result not found', 404);
  }

  const { page, limit, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const issues = await issueRepo.findByResultId(id, {
    limit,
    offset,
    sortBy,
    sortOrder
  });

  const total = await issueRepo.countByResultId(id);

  res.json({
    data: issues,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// GET /api/crawl-results/session/:sessionId/summary - Get session results summary
router.get('/session/:sessionId/summary', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const summary = await crawlResultRepo.getSessionSummary(sessionId);
  
  if (!summary) {
    throw new AppError('Session not found or has no results', 404);
  }

  res.json({ data: summary });
}));

// GET /api/crawl-results/session/:sessionId/issues - Get all issues for session
router.get('/session/:sessionId/issues', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { error, value: query } = queryParamsSchema.validate(req.query);
  if (error) {
    throw new AppError(`Query validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const { page, limit, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const issues = await issueRepo.findBySessionId(sessionId, {
    limit,
    offset,
    sortBy,
    sortOrder
  });

  const total = await issueRepo.countBySessionId(sessionId);

  res.json({
    data: issues,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// GET /api/crawl-results/session/:sessionId/links - Get all links for session
router.get('/session/:sessionId/links', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { error, value: query } = queryParamsSchema.validate(req.query);
  if (error) {
    throw new AppError(`Query validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const { page, limit, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const links = await linkRepo.findBySessionId(sessionId, {
    limit,
    offset,
    sortBy,
    sortOrder
  });

  const total = await linkRepo.countBySessionId(sessionId);

  res.json({
    data: links,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// GET /api/crawl-results/search - Search crawl results
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const searchSchema = Joi.object({
    q: Joi.string().required().min(1),
    sessionId: Joi.string().uuid(),
    type: Joi.string().valid('url', 'issue', 'content').default('content'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  });

  const { error, value: query } = searchSchema.validate(req.query);
  if (error) {
    throw new AppError(`Search validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const { q, sessionId, type, page, limit } = query;
  const offset = (page - 1) * limit;

  let results;
  let total;

  switch (type) {
    case 'url':
      results = await crawlResultRepo.searchByUrl(q, sessionId, { limit, offset });
      total = await crawlResultRepo.countSearchByUrl(q, sessionId);
      break;
    case 'issue':
      results = await issueRepo.searchByDescription(q, sessionId, { limit, offset });
      total = await issueRepo.countSearchByDescription(q, sessionId);
      break;
    case 'content':
    default:
      // This would typically use Elasticsearch for full-text search
      // For now, we'll search by URL as a fallback
      results = await crawlResultRepo.searchByUrl(q, sessionId, { limit, offset });
      total = await crawlResultRepo.countSearchByUrl(q, sessionId);
      break;
  }

  res.json({
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    query: {
      term: q,
      type,
      sessionId
    }
  });
}));

export { router as crawlResultRoutes };