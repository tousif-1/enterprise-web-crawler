import { EventEmitter } from 'events';
import { JobSchedulerService } from './job-scheduler.service';
import {
  CrawlSession,
  CrawlJobData,
  JobPriority,
  CrawlJob,
  QueueStats,
  ResourceAllocation,
  CrawlConfig
} from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

/**
 * High-level job management service that orchestrates crawl sessions
 * and coordinates with the job scheduler
 */
export class JobManagerService extends EventEmitter {
  private jobScheduler: JobSchedulerService;
  private activeSessions: Map<string, CrawlSession> = new Map();

  constructor(jobScheduler: JobSchedulerService) {
    super();
    this.jobScheduler = jobScheduler;
    this.setupJobSchedulerEvents();
  }

  private setupJobSchedulerEvents(): void {
    this.jobScheduler.on('job:completed', (job: CrawlJob) => {
      this.handleJobCompleted(job);
    });

    this.jobScheduler.on('job:failed', (job: CrawlJob, error: Error) => {
      this.handleJobFailed(job, error);
    });

    this.jobScheduler.on('job:progress', (job: CrawlJob, progress: number) => {
      this.handleJobProgress(job, progress);
    });

    this.jobScheduler.on('session:paused', (sessionId: string, jobCount: number) => {
      this.emit('session:paused', sessionId, jobCount);
    });

    this.jobScheduler.on('session:resumed', (sessionId: string, jobCount: number) => {
      this.emit('session:resumed', sessionId, jobCount);
    });

    this.jobScheduler.on('resource:update', (allocation: ResourceAllocation) => {
      this.emit('resource:update', allocation);
    });
  }

  /**
   * Start a complete crawl session by scheduling all necessary jobs
   */
  public async startCrawlSession(session: CrawlSession): Promise<void> {
    try {
      logger.info(`Starting crawl session ${session.id}`, {
        sessionId: session.id,
        urlCount: session.config.urls.length,
        config: session.config
      });

      this.activeSessions.set(session.id, session);

      // Schedule crawl jobs for each URL
      const crawlJobIds: string[] = [];
      for (const url of session.config.urls) {
        const jobData: CrawlJobData = {
          sessionId: session.id,
          url,
          config: session.config
        };

        const jobId = await this.jobScheduler.scheduleJob(
          'crawl_url',
          jobData,
          this.determinePriority(session)
        );

        crawlJobIds.push(jobId);
      }

      // Schedule follow-up jobs that depend on crawl completion
      await this.scheduleFollowUpJobs(session, crawlJobIds);

      this.emit('session:started', session.id, crawlJobIds);
      logger.info(`Crawl session ${session.id} started with ${crawlJobIds.length} jobs`);

    } catch (error) {
      logger.error(`Failed to start crawl session ${session.id}`, error instanceof Error ? error : new Error(String(error)));
      this.emit('session:error', session.id, error);
      throw error;
    }
  }

  /**
   * Pause all jobs for a crawl session
   */
  public async pauseCrawlSession(sessionId: string): Promise<void> {
    try {
      await this.jobScheduler.pauseSession(sessionId);
      
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'paused';
        this.activeSessions.set(sessionId, session);
      }

      logger.info(`Crawl session ${sessionId} paused`);
    } catch (error) {
      logger.error(`Failed to pause crawl session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Resume all paused jobs for a crawl session
   */
  public async resumeCrawlSession(sessionId: string): Promise<void> {
    try {
      await this.jobScheduler.resumeSession(sessionId);
      
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'running';
        this.activeSessions.set(sessionId, session);
      }

      logger.info(`Crawl session ${sessionId} resumed`);
    } catch (error) {
      logger.error(`Failed to resume crawl session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Cancel all jobs for a crawl session
   */
  public async cancelCrawlSession(sessionId: string): Promise<void> {
    try {
      // Get all jobs for the session and cancel them
      const stats = await this.jobScheduler.getQueueStats();
      
      // This is a simplified approach - in a real implementation,
      // you'd need to track job IDs per session
      logger.info(`Cancelling crawl session ${sessionId}`);
      
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.endTime = new Date();
        this.activeSessions.set(sessionId, session);
      }

      this.emit('session:cancelled', sessionId);
    } catch (error) {
      logger.error(`Failed to cancel crawl session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Retry failed jobs for a crawl session
   */
  public async retryFailedJobs(sessionId: string): Promise<number> {
    try {
      const retriedCount = await this.jobScheduler.retryFailedJobs(sessionId);
      
      logger.info(`Retried ${retriedCount} failed jobs for session ${sessionId}`);
      this.emit('session:retry', sessionId, retriedCount);
      
      return retriedCount;
    } catch (error) {
      logger.error(`Failed to retry jobs for session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get comprehensive session status including job progress
   */
  public async getSessionStatus(sessionId: string): Promise<{
    session: CrawlSession | null;
    queueStats: Record<string, QueueStats>;
    resourceAllocation: ResourceAllocation;
  }> {
    try {
      const session = this.activeSessions.get(sessionId) || null;
      const queueStats = await this.jobScheduler.getQueueStats();
      const resourceAllocation = await this.jobScheduler.getResourceAllocation();

      return {
        session,
        queueStats,
        resourceAllocation
      };
    } catch (error) {
      logger.error(`Failed to get session status for ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get overall system status
   */
  public async getSystemStatus(): Promise<{
    activeSessions: number;
    queueStats: Record<string, QueueStats>;
    resourceAllocation: ResourceAllocation;
  }> {
    try {
      const queueStats = await this.jobScheduler.getQueueStats();
      const resourceAllocation = await this.jobScheduler.getResourceAllocation();

      return {
        activeSessions: this.activeSessions.size,
        queueStats,
        resourceAllocation
      };
    } catch (error) {
      logger.error('Failed to get system status', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Schedule a single job (for manual job scheduling)
   */
  public async scheduleJob(
    type: CrawlJob['type'],
    data: CrawlJobData,
    priority: JobPriority = 'normal'
  ): Promise<string> {
    return this.jobScheduler.scheduleJob(type, data, priority);
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<CrawlJob | null> {
    return this.jobScheduler.getJobStatus(jobId);
  }

  private async scheduleFollowUpJobs(session: CrawlSession, crawlJobIds: string[]): Promise<void> {
    // Schedule link validation job (depends on crawl completion)
    const validationJobData: CrawlJobData = {
      sessionId: session.id,
      config: session.config,
      dependsOn: crawlJobIds // Custom field to track dependencies
    };

    await this.jobScheduler.scheduleJob(
      'validate_links',
      validationJobData,
      this.determinePriority(session)
    );

    // Schedule accessibility analysis job
    const analysisJobData: CrawlJobData = {
      sessionId: session.id,
      config: session.config,
      dependsOn: crawlJobIds
    };

    await this.jobScheduler.scheduleJob(
      'analyze_accessibility',
      analysisJobData,
      this.determinePriority(session)
    );

    // Schedule report generation job (depends on all other jobs)
    const reportJobData: CrawlJobData = {
      sessionId: session.id,
      config: session.config
    };

    await this.jobScheduler.scheduleJob(
      'generate_report',
      reportJobData,
      'low' // Reports are typically lower priority
    );
  }

  private determinePriority(session: CrawlSession): JobPriority {
    // Determine priority based on session characteristics
    const urlCount = session.config.urls.length;
    
    if (urlCount > 10000) {
      return 'high'; // Large crawls get high priority
    } else if (urlCount > 1000) {
      return 'normal';
    } else {
      return 'normal';
    }
  }

  private handleJobCompleted(job: CrawlJob): void {
    logger.info(`Job completed: ${job.id} (${job.type}) for session ${job.sessionId}`);

    this.updateSessionProgress(job.sessionId);
    this.emit('job:completed', job);
  }

  private handleJobFailed(job: CrawlJob, error: Error): void {
    logger.error(`Job failed: ${job.id} (${job.type}) for session ${job.sessionId}`, error);

    this.updateSessionProgress(job.sessionId);
    this.emit('job:failed', job, error);

    // If job has exhausted retries, check if session should be marked as failed
    if (job.retryCount >= job.maxRetries) {
      this.checkSessionCompletion(job.sessionId);
    }
  }

  private handleJobProgress(job: CrawlJob, progress: number): void {
    this.emit('job:progress', job, progress);
    
    // Update session progress
    this.updateSessionProgress(job.sessionId);
  }

  private async updateSessionProgress(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      // Get current job stats for this session
      const stats = await this.jobScheduler.getQueueStats();
      
      // Calculate overall progress (simplified)
      const totalJobs = Object.values(stats).reduce((sum, stat) => 
        sum + stat.active + stat.completed + stat.failed + stat.waiting + stat.delayed, 0
      );
      
      const completedJobs = Object.values(stats).reduce((sum, stat) => 
        sum + stat.completed, 0
      );

      const failedJobs = Object.values(stats).reduce((sum, stat) => 
        sum + stat.failed, 0
      );

      // Update session progress
      session.progress = {
        totalUrls: session.config.urls.length,
        processedUrls: completedJobs,
        failedUrls: failedJobs
      };

      session.updatedAt = new Date();
      this.activeSessions.set(sessionId, session);

      this.emit('session:progress', session);

    } catch (error) {
      logger.error(`Failed to update session progress for ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async checkSessionCompletion(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      const stats = await this.jobScheduler.getQueueStats();
      
      // Check if all jobs for this session are completed or failed
      const activeJobs = Object.values(stats).reduce((sum, stat) => 
        sum + stat.active + stat.waiting + stat.delayed, 0
      );

      if (activeJobs === 0) {
        session.status = 'completed';
        session.endTime = new Date();
        this.activeSessions.set(sessionId, session);

        logger.info(`Crawl session ${sessionId} completed`);
        this.emit('session:completed', session);
      }

    } catch (error) {
      logger.error(`Failed to check session completion for ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get failed URLs for a session to enable re-scanning
   */
  public async getFailedUrlsForSession(sessionId: string): Promise<string[]> {
    try {
      // This would typically query the database for failed crawl results
      // For now, we'll return a placeholder implementation
      logger.info(`Getting failed URLs for session ${sessionId}`);
      
      // In a real implementation, this would query the CrawlResult table
      // for results with status 'failed' for the given sessionId
      const failedUrls: string[] = [];
      
      return failedUrls;
    } catch (error) {
      logger.error(`Failed to get failed URLs for session ${sessionId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start a failed link rescan session
   */
  public async startFailedLinkRescan(session: CrawlSession): Promise<void> {
    try {
      logger.info(`Starting failed link rescan session ${session.id}`, {
        sessionId: session.id,
        urlCount: session.config.urls.length
      });

      this.activeSessions.set(session.id, session);

      // Schedule rescan jobs with lower concurrency and higher delays
      const rescanConfig: CrawlConfig = {
        ...session.config,
        concurrency: Math.min(session.config.concurrency, 3), // Lower concurrency for rescans
        respectRobots: true // Always respect robots.txt for rescans
      };

      const crawlJobIds: string[] = [];
      for (const url of session.config.urls) {
        const jobData: CrawlJobData = {
          sessionId: session.id,
          url,
          config: rescanConfig,
          isRescan: true // Custom flag to indicate this is a rescan
        };

        const jobId = await this.jobScheduler.scheduleJob(
          'crawl_url',
          jobData,
          'low' // Lower priority for rescans
        );

        crawlJobIds.push(jobId);
      }

      this.emit('session:rescan-started', session.id, crawlJobIds);
      logger.info(`Failed link rescan session ${session.id} started with ${crawlJobIds.length} jobs`);

    } catch (error) {
      logger.error(`Failed to start rescan session ${session.id}`, error instanceof Error ? error : new Error(String(error)));
      this.emit('session:error', session.id, error);
      throw error;
    }
  }

  /**
   * Validate exclusion patterns
   */
  public async validateExclusionPatterns(patterns: string[]): Promise<Array<{ pattern: string; valid: boolean; error?: string; type?: string }>> {
    try {
      // This would typically use the crawler service to validate patterns
      // For now, we'll implement basic validation
      const results = patterns.map(pattern => {
        try {
          // Basic validation logic
          if (!pattern.trim()) {
            return { pattern, valid: false, error: 'Pattern cannot be empty' };
          }

          // Check for regex pattern
          if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
            try {
              new RegExp(pattern.slice(1, -1));
              return { pattern, valid: true, type: 'regex' };
            } catch (error) {
              return { pattern, valid: false, error: 'Invalid regular expression' };
            }
          }

          // Check for glob patterns
          if (pattern.includes('*') || pattern.includes('?')) {
            return { pattern, valid: true, type: 'glob' };
          }

          // Default to prefix pattern
          return { pattern, valid: true, type: 'prefix' };
        } catch (error) {
          return { 
            pattern, 
            valid: false, 
            error: error instanceof Error ? error.message : 'Invalid pattern' 
          };
        }
      });

      return results;
    } catch (error) {
      logger.error('Failed to validate exclusion patterns', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Test exclusion patterns against URLs
   */
  public async testExclusionPatterns(patterns: string[], testUrls: string[]): Promise<Array<{ url: string; excluded: boolean; matchedPattern?: string }>> {
    try {
      // This would typically use the crawler service's pattern matcher
      // For now, we'll implement basic testing
      const results = testUrls.map(url => {
        for (const pattern of patterns) {
          // Simple prefix matching for basic patterns
          if (!pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('/')) {
            try {
              const urlObj = new URL(url);
              if (urlObj.pathname.startsWith(pattern)) {
                return { url, excluded: true, matchedPattern: pattern };
              }
            } catch (error) {
              // Invalid URL, skip
            }
          }
        }
        return { url, excluded: false };
      });

      return results;
    } catch (error) {
      logger.error('Failed to test exclusion patterns', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      await this.jobScheduler.cleanup();
      this.activeSessions.clear();
      logger.info('Job manager cleanup completed');
    } catch (error) {
      logger.error('Error during job manager cleanup', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}