import { JobManagerService } from '../services/job-manager.service';
import { JobSchedulerService } from '../services/job-scheduler.service';
import {
  CrawlSession,
  CrawlConfig,
  CrawlJob,
  QueueStats,
  ResourceAllocation
} from '@enterprise-web-crawler/shared';

// Mock dependencies
jest.mock('../services/job-scheduler.service');
jest.mock('../utils/logger');

const MockedJobSchedulerService = JobSchedulerService as jest.MockedClass<typeof JobSchedulerService>;

describe('JobManagerService', () => {
  let jobManager: JobManagerService;
  let mockJobScheduler: jest.Mocked<JobSchedulerService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock JobSchedulerService
    mockJobScheduler = {
      scheduleJob: jest.fn(),
      getJobStatus: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
      retryFailedJobs: jest.fn(),
      getQueueStats: jest.fn(),
      getResourceAllocation: jest.fn(),
      cleanup: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    MockedJobSchedulerService.mockImplementation(() => mockJobScheduler);

    jobManager = new JobManagerService(mockJobScheduler);
  });

  afterEach(async () => {
    try {
      await jobManager.cleanup();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('constructor', () => {
    it('should set up job scheduler event handlers', () => {
      expect(mockJobScheduler.on).toHaveBeenCalledWith('job:completed', expect.any(Function));
      expect(mockJobScheduler.on).toHaveBeenCalledWith('job:failed', expect.any(Function));
      expect(mockJobScheduler.on).toHaveBeenCalledWith('job:progress', expect.any(Function));
      expect(mockJobScheduler.on).toHaveBeenCalledWith('session:paused', expect.any(Function));
      expect(mockJobScheduler.on).toHaveBeenCalledWith('session:resumed', expect.any(Function));
      expect(mockJobScheduler.on).toHaveBeenCalledWith('resource:update', expect.any(Function));
    });
  });

  describe('startCrawlSession', () => {
    it('should schedule jobs for all URLs in the session', async () => {
      const config: CrawlConfig = {
        urls: ['https://example.com', 'https://example.com/page1', 'https://example.com/page2'],
        excludePaths: ['/admin'],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true
      };

      const session: CrawlSession = {
        id: 'session-123',
        userId: 'user-456',
        name: 'Test Crawl',
        status: 'pending',
        config,
        startTime: new Date(),
        progress: {
          totalUrls: 3,
          processedUrls: 0,
          failedUrls: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockJobScheduler.scheduleJob
        .mockResolvedValueOnce('job-1')
        .mockResolvedValueOnce('job-2')
        .mockResolvedValueOnce('job-3')
        .mockResolvedValueOnce('job-4') // validation
        .mockResolvedValueOnce('job-5') // analysis
        .mockResolvedValueOnce('job-6'); // report

      await jobManager.startCrawlSession(session);

      // Should schedule crawl jobs for each URL
      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'crawl_url',
        {
          sessionId: 'session-123',
          url: 'https://example.com',
          config
        },
        'normal'
      );

      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'crawl_url',
        {
          sessionId: 'session-123',
          url: 'https://example.com/page1',
          config
        },
        'normal'
      );

      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'crawl_url',
        {
          sessionId: 'session-123',
          url: 'https://example.com/page2',
          config
        },
        'normal'
      );

      // Should schedule follow-up jobs
      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'validate_links',
        expect.objectContaining({
          sessionId: 'session-123',
          config,
          dependsOn: ['job-1', 'job-2', 'job-3']
        }),
        'normal'
      );

      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'analyze_accessibility',
        expect.objectContaining({
          sessionId: 'session-123',
          config,
          dependsOn: ['job-1', 'job-2', 'job-3']
        }),
        'normal'
      );

      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'generate_report',
        expect.objectContaining({
          sessionId: 'session-123',
          config
        }),
        'low'
      );

      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledTimes(6);
    });

    it('should determine priority based on URL count', async () => {
      const largeConfig: CrawlConfig = {
        urls: Array.from({ length: 15000 }, (_, i) => `https://example.com/page${i}`),
        excludePaths: [],
        maxDepth: 1,
        concurrency: 10,
        respectRobots: true
      };

      const session: CrawlSession = {
        id: 'large-session',
        userId: 'user-456',
        name: 'Large Crawl',
        status: 'pending',
        config: largeConfig,
        startTime: new Date(),
        progress: {
          totalUrls: 15000,
          processedUrls: 0,
          failedUrls: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockJobScheduler.scheduleJob.mockResolvedValue('job-id');

      await jobManager.startCrawlSession(session);

      // Should use high priority for large crawls
      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith(
        'crawl_url',
        expect.any(Object),
        'high'
      );
    });

    it('should handle errors during session start', async () => {
      const session: CrawlSession = {
        id: 'error-session',
        userId: 'user-456',
        name: 'Error Crawl',
        status: 'pending',
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 1,
          concurrency: 1,
          respectRobots: true
        },
        startTime: new Date(),
        progress: {
          totalUrls: 1,
          processedUrls: 0,
          failedUrls: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockJobScheduler.scheduleJob.mockRejectedValue(new Error('Scheduling failed'));

      await expect(jobManager.startCrawlSession(session)).rejects.toThrow('Scheduling failed');
    });
  });

  describe('pauseCrawlSession', () => {
    it('should pause all jobs for a session', async () => {
      mockJobScheduler.pauseSession.mockResolvedValue();

      await jobManager.pauseCrawlSession('session-123');

      expect(mockJobScheduler.pauseSession).toHaveBeenCalledWith('session-123');
    });

    it('should handle pause errors', async () => {
      mockJobScheduler.pauseSession.mockRejectedValue(new Error('Pause failed'));

      await expect(jobManager.pauseCrawlSession('session-123')).rejects.toThrow('Pause failed');
    });
  });

  describe('resumeCrawlSession', () => {
    it('should resume all paused jobs for a session', async () => {
      mockJobScheduler.resumeSession.mockResolvedValue();

      await jobManager.resumeCrawlSession('session-123');

      expect(mockJobScheduler.resumeSession).toHaveBeenCalledWith('session-123');
    });

    it('should handle resume errors', async () => {
      mockJobScheduler.resumeSession.mockRejectedValue(new Error('Resume failed'));

      await expect(jobManager.resumeCrawlSession('session-123')).rejects.toThrow('Resume failed');
    });
  });

  describe('retryFailedJobs', () => {
    it('should retry failed jobs and return count', async () => {
      mockJobScheduler.retryFailedJobs.mockResolvedValue(5);

      const retriedCount = await jobManager.retryFailedJobs('session-123');

      expect(retriedCount).toBe(5);
      expect(mockJobScheduler.retryFailedJobs).toHaveBeenCalledWith('session-123');
    });

    it('should handle retry errors', async () => {
      mockJobScheduler.retryFailedJobs.mockRejectedValue(new Error('Retry failed'));

      await expect(jobManager.retryFailedJobs('session-123')).rejects.toThrow('Retry failed');
    });
  });

  describe('getSessionStatus', () => {
    it('should return comprehensive session status', async () => {
      const mockQueueStats: Record<string, QueueStats> = {
        crawl: { waiting: 2, active: 1, completed: 5, failed: 0, delayed: 0, paused: 0 },
        analysis: { waiting: 1, active: 0, completed: 3, failed: 1, delayed: 0, paused: 0 },
        validation: { waiting: 0, active: 1, completed: 2, failed: 0, delayed: 0, paused: 0 },
        report: { waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 }
      };

      const mockResourceAllocation: ResourceAllocation = {
        maxConcurrentJobs: 20,
        currentActiveJobs: 2,
        availableSlots: 18,
        memoryUsage: 45,
        cpuUsage: 30
      };

      mockJobScheduler.getQueueStats.mockResolvedValue(mockQueueStats);
      mockJobScheduler.getResourceAllocation.mockResolvedValue(mockResourceAllocation);

      const status = await jobManager.getSessionStatus('session-123');

      expect(status).toEqual({
        session: null, // No active session in this test
        queueStats: mockQueueStats,
        resourceAllocation: mockResourceAllocation
      });

      expect(mockJobScheduler.getQueueStats).toHaveBeenCalled();
      expect(mockJobScheduler.getResourceAllocation).toHaveBeenCalled();
    });

    it('should handle status retrieval errors', async () => {
      mockJobScheduler.getQueueStats.mockRejectedValue(new Error('Stats failed'));

      await expect(jobManager.getSessionStatus('session-123')).rejects.toThrow('Stats failed');
    });
  });

  describe('getSystemStatus', () => {
    it('should return overall system status', async () => {
      const mockQueueStats: Record<string, QueueStats> = {
        crawl: { waiting: 5, active: 2, completed: 10, failed: 1, delayed: 0, paused: 0 },
        analysis: { waiting: 3, active: 1, completed: 8, failed: 0, delayed: 0, paused: 0 },
        validation: { waiting: 2, active: 3, completed: 15, failed: 2, delayed: 0, paused: 0 },
        report: { waiting: 1, active: 0, completed: 5, failed: 0, delayed: 0, paused: 0 }
      };

      const mockResourceAllocation: ResourceAllocation = {
        maxConcurrentJobs: 25,
        currentActiveJobs: 6,
        availableSlots: 19,
        memoryUsage: 60,
        cpuUsage: 40
      };

      mockJobScheduler.getQueueStats.mockResolvedValue(mockQueueStats);
      mockJobScheduler.getResourceAllocation.mockResolvedValue(mockResourceAllocation);

      const status = await jobManager.getSystemStatus();

      expect(status).toEqual({
        activeSessions: 0, // No active sessions in this test
        queueStats: mockQueueStats,
        resourceAllocation: mockResourceAllocation
      });
    });
  });

  describe('scheduleJob', () => {
    it('should delegate job scheduling to job scheduler', async () => {
      mockJobScheduler.scheduleJob.mockResolvedValue('job-123');

      const jobData = {
        sessionId: 'session-456',
        url: 'https://example.com'
      };

      const jobId = await jobManager.scheduleJob('crawl_url', jobData, 'high');

      expect(jobId).toBe('job-123');
      expect(mockJobScheduler.scheduleJob).toHaveBeenCalledWith('crawl_url', jobData, 'high');
    });
  });

  describe('getJobStatus', () => {
    it('should delegate job status retrieval to job scheduler', async () => {
      const mockJob: CrawlJob = {
        id: 'job-123',
        sessionId: 'session-456',
        type: 'crawl_url',
        priority: 'normal',
        data: { sessionId: 'session-456', url: 'https://example.com' },
        status: 'active',
        progress: { percentage: 50, processed: 5, total: 10 },
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3
      };

      mockJobScheduler.getJobStatus.mockResolvedValue(mockJob);

      const result = await jobManager.getJobStatus('job-123');

      expect(result).toEqual(mockJob);
      expect(mockJobScheduler.getJobStatus).toHaveBeenCalledWith('job-123');
    });
  });

  describe('cleanup', () => {
    it('should cleanup job scheduler and clear active sessions', async () => {
      mockJobScheduler.cleanup.mockResolvedValue();

      await jobManager.cleanup();

      expect(mockJobScheduler.cleanup).toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      mockJobScheduler.cleanup.mockRejectedValue(new Error('Cleanup failed'));

      await expect(jobManager.cleanup()).rejects.toThrow('Cleanup failed');
    });
  });

  describe('event handling', () => {
    it('should emit events when receiving job scheduler events', (done) => {
      const mockJob: CrawlJob = {
        id: 'job-123',
        sessionId: 'session-456',
        type: 'crawl_url',
        priority: 'normal',
        data: { sessionId: 'session-456' },
        status: 'completed',
        progress: { percentage: 100, processed: 10, total: 10 },
        createdAt: new Date(),
        completedAt: new Date(),
        retryCount: 0,
        maxRetries: 3
      };

      jobManager.on('job:completed', (job) => {
        expect(job).toEqual(mockJob);
        done();
      });

      // Simulate job scheduler emitting completed event
      const completedHandler = mockJobScheduler.on.mock.calls.find(
        call => call[0] === 'job:completed'
      )?.[1];

      if (completedHandler) {
        completedHandler(mockJob);
      }
    });

    it('should emit session events', (done) => {
      jobManager.on('session:paused', (sessionId, jobCount) => {
        expect(sessionId).toBe('session-123');
        expect(jobCount).toBe(5);
        done();
      });

      // Simulate job scheduler emitting session paused event
      const pausedHandler = mockJobScheduler.on.mock.calls.find(
        call => call[0] === 'session:paused'
      )?.[1];

      if (pausedHandler) {
        pausedHandler('session-123', 5);
      }
    });
  });
});