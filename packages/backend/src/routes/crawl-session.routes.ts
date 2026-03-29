import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { asyncHandler, AppError } from '../middleware/error.middleware';
import { validationMiddleware, crawlSessionSchema, updateCrawlSessionSchema, queryParamsSchema } from '../middleware/validation.middleware';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { JobManagerService } from '../services/job-manager.service';
import { JobSchedulerService } from '../services/job-scheduler.service';
import { config } from '../config';
import { CrawlSession } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

const router = Router();
const crawlSessionRepo = new CrawlSessionRepository();
const jobScheduler = new JobSchedulerService(config.jobScheduler);
const jobManager = new JobManagerService(jobScheduler);

interface RequestWithIO extends Request {
  io: SocketIOServer;
}

// GET /api/crawl-sessions - List crawl sessions with pagination and filtering
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { error, value: query } = queryParamsSchema.validate(req.query);
  if (error) {
    throw new AppError(`Query validation error: ${error.details.map(d => d.message).join(', ')}`, 400);
  }

  const { page, limit, status, userId, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const filters: any = {};
  if (status) filters.status = status;
  if (userId) filters.userId = userId;

  const sessions = await crawlSessionRepo.findAll(filters, {
    limit,
    offset,
    orderBy: sortBy,
    orderDirection: sortOrder
  });

  const total = await crawlSessionRepo.count(filters);

  res.json({
    data: sessions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// GET /api/crawl-sessions/:id - Get specific crawl session
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  res.json({ data: session });
}));

// POST /api/crawl-sessions - Create new crawl session
router.post('/', 
  validationMiddleware(crawlSessionSchema),
  asyncHandler(async (req: RequestWithIO, res: Response) => {
    const sessionData = req.body;
    
    // Create the crawl session
    const session = await crawlSessionRepo.create({
      ...sessionData,
      status: 'pending' as const,
      progress: {
        totalUrls: sessionData.config.urls.length,
        processedUrls: 0,
        failedUrls: 0
      }
    });

    logger.info(`Created crawl session ${session.id} for user ${session.userId}`);

    // Emit real-time update
    req.io.emit('crawl-session-created', session);

    res.status(201).json({ data: session });
  })
);

// PUT /api/crawl-sessions/:id - Update crawl session
router.put('/:id',
  validationMiddleware(updateCrawlSessionSchema),
  asyncHandler(async (req: RequestWithIO, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const existingSession = await crawlSessionRepo.findById(id);
    if (!existingSession) {
      throw new AppError('Crawl session not found', 404);
    }

    const updatedSession = await crawlSessionRepo.update(id, updateData);
    
    logger.info(`Updated crawl session ${id}`);

    // Emit real-time update
    req.io.emit('crawl-session-updated', updatedSession);

    res.json({ data: updatedSession });
  })
);

// DELETE /api/crawl-sessions/:id - Delete crawl session
router.delete('/:id', asyncHandler(async (req: RequestWithIO, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  // Don't allow deletion of running sessions
  if (session.status === 'running') {
    throw new AppError('Cannot delete running crawl session. Please pause it first.', 400);
  }

  await crawlSessionRepo.delete(id);
  
  logger.info(`Deleted crawl session ${id}`);

  // Emit real-time update
  req.io.emit('crawl-session-deleted', { id });

  res.status(204).send();
}));

// POST /api/crawl-sessions/:id/start - Start crawl session
router.post('/:id/start', asyncHandler(async (req: RequestWithIO, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  if (session.status === 'running') {
    throw new AppError('Crawl session is already running', 400);
  }

  // Update session status to running
  const updatedSession = await crawlSessionRepo.update(id, { 
    status: 'running',
    startTime: new Date()
  });

  if (!updatedSession) {
    throw new AppError('Failed to update crawl session', 500);
  }

  // Schedule crawl jobs
  await jobManager.startCrawlSession(updatedSession);

  logger.info(`Started crawl session ${id}`);

  // Emit real-time update
  req.io.emit('crawl-session-started', updatedSession);

  res.json({ data: updatedSession });
}));

// POST /api/crawl-sessions/:id/pause - Pause crawl session
router.post('/:id/pause', asyncHandler(async (req: RequestWithIO, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  if (session.status !== 'running') {
    throw new AppError('Can only pause running crawl sessions', 400);
  }

  // Update session status to paused
  const updatedSession = await crawlSessionRepo.update(id, { status: 'paused' });

  if (!updatedSession) {
    throw new AppError('Failed to update crawl session', 500);
  }

  // Pause related jobs
  await jobManager.pauseCrawlSession(id);

  logger.info(`Paused crawl session ${id}`);

  // Emit real-time update
  req.io.emit('crawl-session-paused', updatedSession);

  res.json({ data: updatedSession });
}));

// POST /api/crawl-sessions/:id/resume - Resume crawl session
router.post('/:id/resume', asyncHandler(async (req: RequestWithIO, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  if (session.status !== 'paused') {
    throw new AppError('Can only resume paused crawl sessions', 400);
  }

  // Update session status to running
  const updatedSession = await crawlSessionRepo.update(id, { status: 'running' });

  if (!updatedSession) {
    throw new AppError('Failed to update crawl session', 500);
  }

  // Resume related jobs
  await jobManager.resumeCrawlSession(id);

  logger.info(`Resumed crawl session ${id}`);

  // Emit real-time update
  req.io.emit('crawl-session-resumed', updatedSession);

  res.json({ data: updatedSession });
}));

// GET /api/crawl-sessions/:id/progress - Get crawl session progress
router.get('/:id/progress', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  // Get job progress from job manager
  const sessionStatus = await jobManager.getSessionStatus(id);

  const progress = {
    ...session.progress,
    jobs: sessionStatus.queueStats,
    resources: sessionStatus.resourceAllocation
  };

  res.json({ data: progress });
}));

// POST /api/crawl-sessions/:id/rescan-failed - Re-scan failed links
router.post('/:id/rescan-failed', asyncHandler(async (req: RequestWithIO, res: Response) => {
  const { id } = req.params;

  const session = await crawlSessionRepo.findById(id);
  if (!session) {
    throw new AppError('Crawl session not found', 404);
  }

  if (session.status === 'running') {
    throw new AppError('Cannot rescan failed links while session is running', 400);
  }

  // Get failed URLs from crawl results
  const failedUrls = await jobManager.getFailedUrlsForSession(id);
  
  if (failedUrls.length === 0) {
    return res.json({ 
      message: 'No failed URLs found to rescan',
      data: { failedUrls: 0 }
    });
  }

  // Create a new rescan session
  const rescanSession = await crawlSessionRepo.create({
    userId: session.userId,
    name: `${session.name} - Failed Links Rescan`,
    config: {
      ...session.config,
      urls: failedUrls
    },
    status: 'pending' as const,
    progress: {
      totalUrls: failedUrls.length,
      processedUrls: 0,
      failedUrls: 0
    }
  });

  logger.info(`Created failed link rescan session ${rescanSession.id} for ${failedUrls.length} URLs`);

  // Start the rescan session
  await jobManager.startFailedLinkRescan(rescanSession);

  // Emit real-time update
  req.io.emit('crawl-session-created', rescanSession);
  req.io.emit('failed-link-rescan-started', { 
    originalSessionId: id, 
    rescanSessionId: rescanSession.id,
    failedUrlCount: failedUrls.length
  });

  res.status(201).json({ 
    data: rescanSession,
    message: `Started rescan of ${failedUrls.length} failed URLs`
  });
}));

// POST /api/crawl-sessions/:id/validate-patterns - Validate exclusion patterns
router.post('/:id/validate-patterns', asyncHandler(async (req: Request, res: Response) => {
  const { patterns, testUrls } = req.body;

  if (!Array.isArray(patterns)) {
    throw new AppError('Patterns must be an array', 400);
  }

  // Validate patterns using the crawler service
  const validationResults = await jobManager.validateExclusionPatterns(patterns);
  
  let testResults: any[] = [];
  if (Array.isArray(testUrls) && testUrls.length > 0) {
    testResults = await jobManager.testExclusionPatterns(patterns, testUrls);
  }

  res.json({ 
    data: {
      validations: validationResults,
      testResults: testResults
    }
  });
}));

export { router as crawlSessionRoutes };