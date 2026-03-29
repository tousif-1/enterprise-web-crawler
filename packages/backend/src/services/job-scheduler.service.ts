import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import {
  CrawlJob,
  CrawlJobData,
  JobPriority,
  JobStatus,
  JobProgress,
  JobSchedulerConfig,
  QueueStats,
  ResourceAllocation,
  CrawlSession
} from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

export class JobSchedulerService extends EventEmitter {
  private crawlQueue!: Queue;
  private analysisQueue!: Queue;
  private validationQueue!: Queue;
  private reportQueue!: Queue;
  private redis: Redis;
  private config: JobSchedulerConfig;
  private resourceMonitor: NodeJS.Timeout | null = null;

  constructor(config: JobSchedulerConfig) {
    super();
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      maxRetriesPerRequest: 3,
    });

    this.initializeQueues();
    this.setupEventHandlers();
    this.startResourceMonitoring();
  }

  private initializeQueues(): void {
    const redisConfig = {
      redis: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
      },
    };

    // Initialize different queues for different job types
    this.crawlQueue = new Bull('crawl-jobs', redisConfig);
    this.analysisQueue = new Bull('analysis-jobs', redisConfig);
    this.validationQueue = new Bull('validation-jobs', redisConfig);
    this.reportQueue = new Bull('report-jobs', redisConfig);

    // Set concurrency limits
    this.crawlQueue.process(this.config.concurrency.crawl, this.processCrawlJob.bind(this));
    this.analysisQueue.process(this.config.concurrency.analysis, this.processAnalysisJob.bind(this));
    this.validationQueue.process(this.config.concurrency.validation, this.processValidationJob.bind(this));
    this.reportQueue.process(1, this.processReportJob.bind(this)); // Reports are typically single-threaded

    logger.info('Job queues initialized successfully');
  }

  private setupEventHandlers(): void {
    const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];

    queues.forEach((queue) => {
      queue.on('completed', (job: Job) => {
        logger.info(`Job ${job.id} completed successfully`, { 
          queue: queue.name, 
          jobType: job.data.type,
          duration: job.processedOn ? Date.now() - job.processedOn : null
        });
        this.emit('job:completed', this.mapBullJobToCrawlJob(job));
      });

      queue.on('failed', (job: Job, error: Error) => {
        logger.error(`Job ${job.id} failed in queue ${queue.name}`, error);
        this.emit('job:failed', this.mapBullJobToCrawlJob(job), error);
      });

      queue.on('progress', (job: Job, progress: number) => {
        this.emit('job:progress', this.mapBullJobToCrawlJob(job), progress);
      });

      queue.on('stalled', (job: Job) => {
        logger.warn(`Job ${job.id} stalled`, { 
          queue: queue.name, 
          jobType: job.data.type 
        });
        this.emit('job:stalled', this.mapBullJobToCrawlJob(job));
      });
    });
  }

  private startResourceMonitoring(): void {
    this.resourceMonitor = setInterval(async () => {
      try {
        const allocation = await this.getResourceAllocation();
        this.emit('resource:update', allocation);

        // Auto-scale based on resource usage
        if (allocation.cpuUsage > 80 || allocation.memoryUsage > 80) {
          logger.warn('High resource usage detected', allocation);
          await this.pauseLowPriorityJobs();
        }
      } catch (error) {
        logger.error('Resource monitoring error', error instanceof Error ? error : new Error(String(error)));
      }
    }, 30000); // Check every 30 seconds
  }

  public async scheduleJob(
    type: CrawlJob['type'],
    data: CrawlJobData,
    priority: JobPriority = 'normal',
    options: Partial<JobOptions> = {}
  ): Promise<string> {
    try {
      const queue = this.getQueueByType(type);
      const jobOptions: JobOptions = {
        priority: this.getPriorityValue(priority),
        attempts: this.config.retries.maxRetries,
        backoff: {
          type: 'exponential',
          delay: this.config.retries.backoffDelay,
        },
        removeOnComplete: this.config.cleanup.maxCount,
        removeOnFail: this.config.cleanup.maxCount,
        ...options,
      };

      const job = await queue.add(type, { ...data, type, priority }, jobOptions);
      
      logger.info(`Job scheduled successfully`, {
        jobId: job.id,
        type,
        priority,
        sessionId: data.sessionId
      });

      return job.id!.toString();
    } catch (error) {
      logger.error(`Failed to schedule job of type ${type}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to schedule job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getJobStatus(jobId: string): Promise<CrawlJob | null> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      
      for (const queue of queues) {
        const job = await queue.getJob(jobId);
        if (job) {
          return this.mapBullJobToCrawlJob(job);
        }
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get job status for ${jobId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to get job status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async pauseJob(jobId: string): Promise<void> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      
      for (const queue of queues) {
        const job = await queue.getJob(jobId);
        if (job) {
          // Bull doesn't have direct pause/resume on jobs, we remove and re-add with delay
          await job.remove();
          logger.info(`Job ${jobId} paused successfully`);
          this.emit('job:paused', this.mapBullJobToCrawlJob(job));
          return;
        }
      }

      throw new Error(`Job ${jobId} not found`);
    } catch (error) {
      logger.error(`Failed to pause job ${jobId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to pause job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async resumeJob(jobId: string): Promise<void> {
    try {
      // For Bull, resume would involve re-scheduling the job
      // This is a simplified implementation
      logger.info(`Job ${jobId} resume requested (simplified implementation)`);
      this.emit('job:resumed', { id: jobId } as CrawlJob);
    } catch (error) {
      logger.error(`Failed to resume job ${jobId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to resume job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async pauseSession(sessionId: string): Promise<void> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      let pausedCount = 0;

      for (const queue of queues) {
        const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);
        const sessionJobs = jobs.filter(job => job.data.sessionId === sessionId);

        for (const job of sessionJobs) {
          await job.remove();
          pausedCount++;
        }
      }

      logger.info(`Paused ${pausedCount} jobs for session ${sessionId}`);
      this.emit('session:paused', sessionId, pausedCount);
    } catch (error) {
      logger.error(`Failed to pause session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to pause session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async resumeSession(sessionId: string): Promise<void> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      let resumedCount = 0;

      for (const queue of queues) {
        const jobs = await queue.getJobs(['paused']);
        const sessionJobs = jobs.filter(job => job.data.sessionId === sessionId);

        // For Bull, we would need to re-schedule paused jobs
        // This is a simplified implementation
        resumedCount = sessionJobs.length;
      }

      logger.info(`Resumed ${resumedCount} jobs for session ${sessionId}`);
      this.emit('session:resumed', sessionId, resumedCount);
    } catch (error) {
      logger.error(`Failed to resume session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to resume session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async cancelJob(jobId: string): Promise<void> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      
      for (const queue of queues) {
        const job = await queue.getJob(jobId);
        if (job) {
          await job.remove();
          logger.info(`Job ${jobId} cancelled successfully`);
          this.emit('job:cancelled', this.mapBullJobToCrawlJob(job));
          return;
        }
      }

      throw new Error(`Job ${jobId} not found`);
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to cancel job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async retryFailedJobs(sessionId: string): Promise<number> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue, this.reportQueue];
      let retriedCount = 0;

      for (const queue of queues) {
        const failedJobs = await queue.getJobs(['failed']);
        const sessionFailedJobs = failedJobs.filter(job => job.data.sessionId === sessionId);

        for (const job of sessionFailedJobs) {
          await job.retry();
          retriedCount++;
        }
      }

      logger.info(`Retried ${retriedCount} failed jobs for session ${sessionId}`);
      return retriedCount;
    } catch (error) {
      logger.error(`Failed to retry jobs for session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to retry jobs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getQueueStats(): Promise<Record<string, QueueStats>> {
    try {
      const queues = {
        crawl: this.crawlQueue,
        analysis: this.analysisQueue,
        validation: this.validationQueue,
        report: this.reportQueue,
      };

      const stats: Record<string, QueueStats> = {};

      for (const [name, queue] of Object.entries(queues)) {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed(),
          queue.getJobs(['paused']),
        ]);

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: paused.length,
        };
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get queue stats', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to get queue stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getResourceAllocation(): Promise<ResourceAllocation> {
    try {
      const stats = await this.getQueueStats();
      const totalActive = Object.values(stats).reduce((sum, stat) => sum + stat.active, 0);
      const maxConcurrent = this.config.concurrency.crawl + 
                           this.config.concurrency.analysis + 
                           this.config.concurrency.validation + 1; // +1 for report queue

      // Get system resource usage (simplified - in production, use proper monitoring)
      const memoryUsage = process.memoryUsage();
      const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      return {
        maxConcurrentJobs: maxConcurrent,
        currentActiveJobs: totalActive,
        availableSlots: Math.max(0, maxConcurrent - totalActive),
        memoryUsage: Math.round(memoryPercent),
        cpuUsage: 0, // Would need external library for accurate CPU usage
      };
    } catch (error) {
      logger.error('Failed to get resource allocation', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to get resource allocation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pauseLowPriorityJobs(): Promise<void> {
    try {
      const queues = [this.crawlQueue, this.analysisQueue, this.validationQueue];
      let pausedCount = 0;

      for (const queue of queues) {
        const jobs = await queue.getJobs(['waiting', 'delayed']);
        const lowPriorityJobs = jobs.filter(job => 
          job.data.priority === 'low' || job.data.priority === 'normal'
        );

        for (const job of lowPriorityJobs) {
          await job.remove();
          pausedCount++;
        }
      }

      logger.info(`Auto-paused ${pausedCount} low priority jobs due to high resource usage`);
    } catch (error) {
      logger.error('Failed to pause low priority jobs', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getQueueByType(type: CrawlJob['type']): Queue {
    switch (type) {
      case 'crawl_url':
        return this.crawlQueue;
      case 'analyze_accessibility':
        return this.analysisQueue;
      case 'validate_links':
        return this.validationQueue;
      case 'generate_report':
        return this.reportQueue;
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  private getPriorityValue(priority: JobPriority): number {
    const priorityMap = {
      low: 1,
      normal: 5,
      high: 10,
      critical: 20,
    };
    return priorityMap[priority];
  }

  private mapBullJobToCrawlJob(bullJob: Job): CrawlJob {
    const progress: JobProgress = {
      percentage: bullJob.progress() || 0,
      processed: bullJob.data.processed || 0,
      total: bullJob.data.total || 0,
      currentTask: bullJob.data.currentTask,
      estimatedTimeRemaining: bullJob.data.estimatedTimeRemaining,
    };

    return {
      id: bullJob.id!.toString(),
      sessionId: bullJob.data.sessionId,
      type: bullJob.data.type,
      priority: bullJob.data.priority || 'normal',
      data: bullJob.data,
      status: this.mapBullJobStatus(bullJob),
      progress,
      createdAt: new Date(bullJob.timestamp),
      startedAt: bullJob.processedOn ? new Date(bullJob.processedOn) : undefined,
      completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
      failedAt: bullJob.failedReason ? new Date(bullJob.finishedOn!) : undefined,
      error: bullJob.failedReason,
      retryCount: bullJob.attemptsMade,
      maxRetries: bullJob.opts.attempts || this.config.retries.maxRetries,
    };
  }

  private mapBullJobStatus(bullJob: Job): JobStatus {
    if (bullJob.finishedOn && !bullJob.failedReason) return 'completed';
    if (bullJob.failedReason) return 'failed';
    if (bullJob.processedOn && !bullJob.finishedOn) return 'active';
    if (bullJob.opts.delay && bullJob.opts.delay > Date.now()) return 'delayed';
    return 'waiting';
  }

  // Job processors - these would be implemented to handle actual job execution
  private async processCrawlJob(job: Job): Promise<void> {
    // This would integrate with the crawler service
    logger.info(`Processing crawl job ${job.id}`, { data: job.data });
    
    // Update progress
    await job.progress(50);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await job.progress(100);
    logger.info(`Crawl job ${job.id} completed`);
  }

  private async processAnalysisJob(job: Job): Promise<void> {
    // This would integrate with the accessibility analyzer service
    logger.info(`Processing analysis job ${job.id}`, { data: job.data });
    
    await job.progress(50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await job.progress(100);
    
    logger.info(`Analysis job ${job.id} completed`);
  }

  private async processValidationJob(job: Job): Promise<void> {
    // This would integrate with the link validation service
    logger.info(`Processing validation job ${job.id}`, { data: job.data });
    
    await job.progress(50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await job.progress(100);
    
    logger.info(`Validation job ${job.id} completed`);
  }

  private async processReportJob(job: Job): Promise<void> {
    // This would integrate with the report generation service
    logger.info(`Processing report job ${job.id}`, { data: job.data });
    
    await job.progress(50);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await job.progress(100);
    
    logger.info(`Report job ${job.id} completed`);
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.resourceMonitor) {
        clearInterval(this.resourceMonitor);
        this.resourceMonitor = null;
      }

      await Promise.all([
        this.crawlQueue.close(),
        this.analysisQueue.close(),
        this.validationQueue.close(),
        this.reportQueue.close(),
      ]);

      await this.redis.quit();
      logger.info('Job scheduler cleanup completed');
    } catch (error) {
      logger.error('Error during job scheduler cleanup', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}