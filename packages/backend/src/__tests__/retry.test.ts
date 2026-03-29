import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RetryService, RetryManager } from '../services/retry.service';
import { AppError } from '../middleware/error.middleware';
import { ErrorContext } from '@enterprise-web-crawler/shared';

describe('Retry Service', () => {
  let retryService: RetryService;
  let context: ErrorContext;

  beforeEach(() => {
    retryService = new RetryService({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false // Disable jitter for predictable tests
    });

    context = {
      service: 'test-service',
      operation: 'test-operation',
      timestamp: new Date()
    };

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Successful Operations', () => {
    it('should execute operation successfully on first try', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryService.execute(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return result after successful retry', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');
      
      const promise = retryService.execute(operation, context);
      
      // Fast-forward through the delay
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retry Logic', () => {
    it('should retry retryable errors', async () => {
      const retryableError = new AppError('Network error', 503, 'network', 'high', true, true);
      const operation = vi.fn().mockRejectedValue(retryableError);
      
      const promise = retryService.execute(operation, context);
      
      // Fast-forward through all retries
      await vi.advanceTimersByTimeAsync(700); // 100 + 200 + 400
      
      await expect(promise).rejects.toThrow('Network error');
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new AppError('Validation error', 400, 'validation', 'low', true, false);
      const operation = vi.fn().mockRejectedValue(nonRetryableError);
      
      await expect(retryService.execute(operation, context)).rejects.toThrow('Validation error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use custom retry predicate', async () => {
      const error = new Error('Custom error');
      const operation = vi.fn().mockRejectedValue(error);
      const shouldRetry = vi.fn().mockReturnValue(true);
      
      const promise = retryService.execute(operation, context, shouldRetry);
      
      await vi.advanceTimersByTimeAsync(700);
      
      await expect(promise).rejects.toThrow('Custom error');
      expect(shouldRetry).toHaveBeenCalledWith(error);
      expect(operation).toHaveBeenCalledTimes(4);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate correct delays', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      
      const promise = retryService.execute(operation, context);
      
      // Check delays: 100ms, 200ms, 400ms
      expect(operation).toHaveBeenCalledTimes(1);
      
      await vi.advanceTimersByTimeAsync(99);
      expect(operation).toHaveBeenCalledTimes(1);
      
      await vi.advanceTimersByTimeAsync(1);
      expect(operation).toHaveBeenCalledTimes(2);
      
      await vi.advanceTimersByTimeAsync(199);
      expect(operation).toHaveBeenCalledTimes(2);
      
      await vi.advanceTimersByTimeAsync(1);
      expect(operation).toHaveBeenCalledTimes(3);
      
      await vi.advanceTimersByTimeAsync(399);
      expect(operation).toHaveBeenCalledTimes(3);
      
      await vi.advanceTimersByTimeAsync(1);
      expect(operation).toHaveBeenCalledTimes(4);
      
      await expect(promise).rejects.toThrow();
    });

    it('should cap delay at maxDelay', async () => {
      const retryServiceWithLowMax = new RetryService({
        maxRetries: 5,
        baseDelay: 100,
        maxDelay: 300,
        backoffMultiplier: 2,
        jitter: false
      });
      
      const operation = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      
      const promise = retryServiceWithLowMax.execute(operation, context);
      
      // Delays should be: 100, 200, 300, 300, 300 (capped)
      await vi.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);
      
      await vi.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(3);
      
      await vi.advanceTimersByTimeAsync(300);
      expect(operation).toHaveBeenCalledTimes(4);
      
      await vi.advanceTimersByTimeAsync(300);
      expect(operation).toHaveBeenCalledTimes(5);
      
      await vi.advanceTimersByTimeAsync(300);
      expect(operation).toHaveBeenCalledTimes(6);
      
      await expect(promise).rejects.toThrow();
    });
  });

  describe('Error Classification', () => {
    it('should retry network errors', async () => {
      const networkErrors = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNRESET',
        'EPIPE'
      ];
      
      for (const errorCode of networkErrors) {
        const operation = vi.fn().mockRejectedValue(new Error(errorCode));
        
        const promise = retryService.execute(operation, context);
        await vi.advanceTimersByTimeAsync(700);
        
        await expect(promise).rejects.toThrow();
        expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
        
        vi.clearAllMocks();
      }
    });

    it('should retry HTTP 5xx errors', async () => {
      const httpErrors = [500, 502, 503, 504];
      
      for (const statusCode of httpErrors) {
        const operation = vi.fn().mockRejectedValue(new Error(`HTTP status code ${statusCode}`));
        
        const promise = retryService.execute(operation, context);
        await vi.advanceTimersByTimeAsync(700);
        
        await expect(promise).rejects.toThrow();
        expect(operation).toHaveBeenCalledTimes(4);
        
        vi.clearAllMocks();
      }
    });

    it('should retry timeout errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Request timeout'));
      
      const promise = retryService.execute(operation, context);
      await vi.advanceTimersByTimeAsync(700);
      
      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should retry rate limit errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
      
      const promise = retryService.execute(operation, context);
      await vi.advanceTimersByTimeAsync(700);
      
      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should not retry HTTP 4xx errors (except 408, 429)', async () => {
      const nonRetryableErrors = [400, 401, 403, 404];
      
      for (const statusCode of nonRetryableErrors) {
        const operation = vi.fn().mockRejectedValue(new Error(`HTTP status code ${statusCode}`));
        
        await expect(retryService.execute(operation, context)).rejects.toThrow();
        expect(operation).toHaveBeenCalledTimes(1);
        
        vi.clearAllMocks();
      }
    });
  });
});

describe('Retry Manager', () => {
  let retryManager: RetryManager;
  let context: ErrorContext;

  beforeEach(() => {
    retryManager = new RetryManager();
    context = {
      service: 'test-service',
      operation: 'test-operation',
      timestamp: new Date()
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create and reuse retry services', () => {
    const service1 = retryManager.getRetryService('service1');
    const service2 = retryManager.getRetryService('service1');
    const service3 = retryManager.getRetryService('service2');
    
    expect(service1).toBe(service2);
    expect(service1).not.toBe(service3);
  });

  it('should provide network retry with correct config', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    
    const promise = retryManager.withNetworkRetry(operation, context);
    await vi.advanceTimersByTimeAsync(31000); // Should retry 5 times with longer delays
    
    await expect(promise).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(6); // Initial + 5 retries
  });

  it('should provide database retry with correct config', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Database connection failed'));
    
    const promise = retryManager.withDatabaseRetry(operation, context);
    await vi.advanceTimersByTimeAsync(5000);
    
    await expect(promise).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should provide external service retry with correct config', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    
    const promise = retryManager.withExternalServiceRetry(operation, context);
    await vi.advanceTimersByTimeAsync(60000);
    
    await expect(promise).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(5); // Initial + 4 retries
  });
});