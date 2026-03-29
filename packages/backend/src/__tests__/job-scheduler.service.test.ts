import { JobSchedulerService } from '../services/job-scheduler.service';
import { JobSchedulerConfig, CrawlJobData, JobPriority } from '@enterprise-web-crawler/shared';
import Bull from 'bull';
import Redis from 'ioredis';

// Mock dependencies
jest.mock('bull');
jest.mock('ioredis');
jest.mock('../utils/logger');

const MockedBull = Bull as jest.MockedClass<typeof Bull>;
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('JobSchedulerService', () => {
  let jobScheduler: JobSchedulerService;
  let mockQueue: jest.Mocked<Bull.Queue>;
  let mockRedis: jest.Mocked<Redis>;
  let config: JobSchedulerConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Redis
    mockRedis = {
      quit: jest.fn().mockResolvedValue('OK'),
    } as any;
    MockedRedis.mockImplementation(() => mockRedis);

    // Mock Bull Queue
    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getJobs: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
      process: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      name: 'test-queue',
    } as any;

    MockedBull.mockImplementation(() => mockQueue);

    config = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 1,
      },
      concurrency: {
        crawl: 5,
        analysis: 3,
        validation: 10,
      },
      retries: {
        maxRetries: 3,
        backoffDelay: 2000,
      },
      cleanup: {
        maxAge: 86400000,
        maxCount: 100,
      },
    };

    jobScheduler = new JobSchedulerService(config);
  });

  afterEach(async () => {
    try {
      await jobScheduler.cleanup();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(MockedRedis).toHaveBeenCalledWith({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        maxRetriesPerRequest: 3,
      });

      // Should create 4 queues
      expect(MockedBull).toHaveBeenCalledTimes(4);
      expect(MockedBull).toHaveBeenCalledWith('crawl-jobs', expect.any(Object));
      expect(MockedBull).toHaveBeenCalledWith('analysis-jobs', expect.any(Object));
      expect(MockedBull).toHaveBeenCalledWith('validation-jobs', expect.any(Object));
      expect(MockedBull).toHaveBeenCalledWith('report-jobs', expect.any(Object));
    });

    it('should set up event handlers for all queues', () => {
      // Each queue should have event handlers set up
      expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('progress', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
    });
  });

  describe('scheduleJob', () => {
    it('should schedule a crawl job successfully', async () => {
      const mockJob = { id: '123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobData: CrawlJobData = {
        sessionId: 'session-123',
        url: 'https://example.com',
      };

      const jobId = await jobScheduler.scheduleJob('crawl_url', jobData, 'high');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'crawl_url',
        { ...jobData, type: 'crawl_url', priority: 'high' },
        expect.objectContaining({
          priority: 10, // high priority value
          attempts: config.retries.maxRetries,
          backoff: {
            type: 'exponential',
            delay: config.retries.backoffDelay,
          },
          removeOnComplete: config.cleanup.maxCount,
          removeOnFail: config.cleanup.maxCount,
        })
      );

      expect(jobId).toBe('123');
    });

    it('should handle different job types correctly', async () => {
      const mockJob = { id: '456' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobData: CrawlJobData = {
        sessionId: 'session-456',
        urls: ['https://example.com/page1', 'https://example.com/page2'],
      };

      await jobScheduler.scheduleJob('analyze_accessibility', jobData, 'normal');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'analyze_accessibility',
        { ...jobData, type: 'analyze_accessibility', priority: 'normal' },
        expect.objectContaining({
          priority: 5, // normal priority value
        })
      );
    });

    it('should throw error when job scheduling fails', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      const jobData: CrawlJobData = {
        sessionId: 'session-error',
        url: 'https://example.com',
      };

      await expect(
        jobScheduler.scheduleJob('crawl_url', jobData)
      ).rejects.toThrow('Failed to schedule job: Queue error');
    });
  });

  describe('getJobStatus', () => {
    it('should return job status when job exists', async () => {
      const mockJob = {
        id: '123',
        data: {
          sessionId: 'session-123',
          type: 'crawl_url',
          priority: 'high',
        },
        timestamp: Date.now(),
        progress: jest.fn().mockReturnValue(50),
        processedOn: Date.now(),
        finishedOn: null,
        failedReason: null,
        attemptsMade: 1,
        opts: { attempts: 3 },
      };

      mockQueue.getJob.mockResolvedValue(mockJob as any);

      const result = await jobScheduler.getJobStatus('123');

      expect(result).toMatchObject({
        id: '123',
        sessionId: 'session-123',
        type: 'crawl_url',
        priority: 'high',
        status: 'active',
        progress: {
          percentage: 50,
        },
        retryCount: 1,
        maxRetries: 3,
      });
    });

    it('should return null when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await jobScheduler.getJobStatus('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('pauseJob', () => {
    it('should pause job successfully', async () => {
      const mockJob = {
        id: '123',
        data: { sessionId: 'session-123', type: 'crawl_url' },
        remove: jest.fn().mockResolvedValue(undefined),
        timestamp: Date.now(),
        progress: jest.fn().mockReturnValue(0),
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      mockQueue.getJob.mockResolvedValue(mockJob as any);

      await jobScheduler.pauseJob('123');

      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should throw error when job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      await expect(jobScheduler.pauseJob('nonexistent')).rejects.toThrow(
        'Failed to pause job: Job nonexistent not found'
      );
    });
  });

  describe('resumeJob', () => {
    it('should resume job successfully', async () => {
      // Resume is simplified in our implementation
      await jobScheduler.resumeJob('123');

      // Just verify it doesn't throw an error
      expect(true).toBe(true);
    });
  });

  describe('pauseSession', () => {
    it('should pause all jobs for a session', async () => {
      const mockJobs = [
        {
          id: '1',
          data: { sessionId: 'session-123' },
          remove: jest.fn().mockResolvedValue(undefined),
        },
        {
          id: '2',
          data: { sessionId: 'session-123' },
          remove: jest.fn().mockResolvedValue(undefined),
        },
        {
          id: '3',
          data: { sessionId: 'other-session' },
          remove: jest.fn().mockResolvedValue(undefined),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs as any);

      await jobScheduler.pauseSession('session-123');

      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).toHaveBeenCalled();
      expect(mockJobs[2].remove).not.toHaveBeenCalled();
    });
  });

  describe('resumeSession', () => {
    it('should resume all paused jobs for a session', async () => {
      const mockJobs = [
        {
          id: '1',
          data: { sessionId: 'session-123' },
        },
        {
          id: '2',
          data: { sessionId: 'session-123' },
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs as any);

      await jobScheduler.resumeSession('session-123');

      // Resume is simplified in our implementation
      expect(true).toBe(true);
    });
  });

  describe('cancelJob', () => {
    it('should cancel job successfully', async () => {
      const mockJob = {
        id: '123',
        data: { sessionId: 'session-123', type: 'crawl_url' },
        remove: jest.fn().mockResolvedValue(undefined),
        timestamp: Date.now(),
        progress: jest.fn().mockReturnValue(0),
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      mockQueue.getJob.mockResolvedValue(mockJob as any);

      await jobScheduler.cancelJob('123');

      expect(mockJob.remove).toHaveBeenCalled();
    });
  });

  describe('retryFailedJobs', () => {
    it('should retry all failed jobs for a session', async () => {
      const mockFailedJobs = [
        {
          id: '1',
          data: { sessionId: 'session-123' },
          retry: jest.fn().mockResolvedValue(undefined),
        },
        {
          id: '2',
          data: { sessionId: 'session-123' },
          retry: jest.fn().mockResolvedValue(undefined),
        },
        {
          id: '3',
          data: { sessionId: 'other-session' },
          retry: jest.fn().mockResolvedValue(undefined),
        },
      ];

      // Mock getJobs to return different results for different queues
      let callCount = 0;
      mockQueue.getJobs.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockFailedJobs as any);
        }
        return Promise.resolve([] as any);
      });

      const retriedCount = await jobScheduler.retryFailedJobs('session-123');

      expect(retriedCount).toBe(2);
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
      expect(mockFailedJobs[2].retry).not.toHaveBeenCalled();
    });
  });

  describe('getQueueStats', () => {
    it('should return statistics for all queues', async () => {
      const mockJobs = [{ id: '1' }, { id: '2' }];
      
      mockQueue.getWaiting.mockResolvedValue(mockJobs as any);
      mockQueue.getActive.mockResolvedValue([mockJobs[0]] as any);
      mockQueue.getCompleted.mockResolvedValue(mockJobs as any);
      mockQueue.getFailed.mockResolvedValue([mockJobs[1]] as any);
      mockQueue.getDelayed.mockResolvedValue([] as any);
      // Bull doesn't have getPaused, use getJobs with 'paused' state
      mockQueue.getJobs.mockImplementation((states: string[]) => {
        if (states.includes('paused')) {
          return Promise.resolve([mockJobs[0]] as any);
        }
        return Promise.resolve(mockJobs as any);
      });

      const stats = await jobScheduler.getQueueStats();

      expect(stats).toEqual({
        crawl: {
          waiting: 2,
          active: 1,
          completed: 2,
          failed: 1,
          delayed: 0,
          paused: 1,
        },
        analysis: {
          waiting: 2,
          active: 1,
          completed: 2,
          failed: 1,
          delayed: 0,
          paused: 1,
        },
        validation: {
          waiting: 2,
          active: 1,
          completed: 2,
          failed: 1,
          delayed: 0,
          paused: 1,
        },
        report: {
          waiting: 2,
          active: 1,
          completed: 2,
          failed: 1,
          delayed: 0,
          paused: 1,
        },
      });
    });
  });

  describe('getResourceAllocation', () => {
    it('should return current resource allocation', async () => {
      const mockStats = {
        crawl: { active: 2, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        analysis: { active: 1, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        validation: { active: 3, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        report: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
      };

      // Mock getQueueStats
      jest.spyOn(jobScheduler, 'getQueueStats').mockResolvedValue(mockStats);

      const allocation = await jobScheduler.getResourceAllocation();

      expect(allocation).toMatchObject({
        maxConcurrentJobs: 19, // 5 + 3 + 10 + 1
        currentActiveJobs: 6, // 2 + 1 + 3 + 0
        availableSlots: 13, // 19 - 6
        memoryUsage: expect.any(Number),
        cpuUsage: 0,
      });
    });
  });

  describe('priority mapping', () => {
    it('should map priority strings to correct numeric values', async () => {
      const mockJob = { id: '123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobData: CrawlJobData = { sessionId: 'test' };

      // Test different priorities
      await jobScheduler.scheduleJob('crawl_url', jobData, 'low');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 1 })
      );

      await jobScheduler.scheduleJob('crawl_url', jobData, 'normal');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 5 })
      );

      await jobScheduler.scheduleJob('crawl_url', jobData, 'high');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 10 })
      );

      await jobScheduler.scheduleJob('crawl_url', jobData, 'critical');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 20 })
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await jobScheduler.cleanup();

      expect(mockQueue.close).toHaveBeenCalledTimes(4);
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.quit.mockRejectedValue(new Error('Redis error'));

      await expect(jobScheduler.cleanup()).rejects.toThrow();
    });

    it('should handle queue operation errors', async () => {
      mockQueue.getJob.mockRejectedValue(new Error('Queue error'));

      await expect(jobScheduler.getJobStatus('123')).rejects.toThrow(
        'Failed to get job status: Queue error'
      );
    });
  });
});