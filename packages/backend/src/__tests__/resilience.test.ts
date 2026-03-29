import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResilienceService, ResilienceManager } from '../services/resilience.service';
import { ErrorContext } from '@enterprise-web-crawler/shared';

describe('Resilience Service', () => {
  let resilienceService: ResilienceService;
  let context: ErrorContext;

  beforeEach(() => {
    resilienceService = new ResilienceService('test-service', {
      retry: {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false
      },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 500,
        expectedErrors: ['ECONNREFUSED']
      },
      timeout: 5000,
      bulkhead: {
        maxConcurrent: 2,
        queueSize: 3
      }
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

  describe('Basic Execution', () => {
    it('should execute operation successfully', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await resilienceService.execute(operation, context);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should apply retry and circuit breaker by default', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');
      
      const promise = resilienceService.execute(operation, context);
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should skip retry when requested', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));
      
      await expect(
        resilienceService.execute(operation, context, { skipRetry: true })
      ).rejects.toThrow('Failure');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should skip circuit breaker when requested', async () => {
      // First trip the circuit breaker
      const failingOperation = vi.fn().mockRejectedValue(new Error('Failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await resilienceService.execute(failingOperation, context, { skipRetry: true });
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Now the circuit breaker should be open, but we skip it
      const operation = vi.fn().mockResolvedValue('success');
      const result = await resilienceService.execute(operation, context, { 
        skipCircuitBreaker: true,
        skipRetry: true 
      });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );
      
      const promise = resilienceService.execute(operation, context, { timeout: 1000 });
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await expect(promise).rejects.toThrow('Operation timed out after 1000ms');
    });

    it('should not timeout fast operations', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 500))
      );
      
      const promise = resilienceService.execute(operation, context, { timeout: 1000 });
      
      await vi.advanceTimersByTimeAsync(500);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('Bulkhead Pattern', () => {
    it('should allow concurrent operations up to limit', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 1000))
      );
      
      // Start 2 operations (at the limit)
      const promise1 = resilienceService.execute(operation, context);
      const promise2 = resilienceService.execute(operation, context);
      
      // Both should start immediately
      expect(operation).toHaveBeenCalledTimes(2);
      
      await vi.advanceTimersByTimeAsync(1000);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('success');
      expect(result2).toBe('success');
    });

    it('should queue operations beyond concurrent limit', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 1000))
      );
      
      // Start 3 operations (1 over the limit)
      const promise1 = resilienceService.execute(operation, context);
      const promise2 = resilienceService.execute(operation, context);
      const promise3 = resilienceService.execute(operation, context);
      
      // Only 2 should start immediately
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Complete first two operations
      await vi.advanceTimersByTimeAsync(1000);
      
      // Third operation should now start
      expect(operation).toHaveBeenCalledTimes(3);
      
      await vi.advanceTimersByTimeAsync(1000);
      
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
      expect(result1).toBe('success');
      expect(result2).toBe('success');
      expect(result3).toBe('success');
    });

    it('should reject operations when queue is full', async () => {
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('success'), 10000))
      );
      
      // Fill up concurrent slots (2) and queue (3)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(resilienceService.execute(operation, context));
      }
      
      // The 6th operation should be rejected
      await expect(
        resilienceService.execute(operation, context)
      ).rejects.toThrow('Bulkhead queue full for service: test-service');
    });
  });

  describe('Convenience Methods', () => {
    it('should execute with network resilience', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await resilienceService.executeWithNetworkResilience(operation, context);
      
      expect(result).toBe('success');
    });

    it('should execute with database resilience', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await resilienceService.executeWithDatabaseResilience(operation, context);
      
      expect(result).toBe('success');
    });

    it('should execute with external service resilience', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await resilienceService.executeWithExternalServiceResilience(operation, context);
      
      expect(result).toBe('success');
    });
  });

  describe('Metrics and Health', () => {
    it('should provide service metrics', () => {
      const metrics = resilienceService.getMetrics();
      
      expect(metrics.service).toBe('test-service');
      expect(metrics.circuitBreaker).toBeDefined();
      expect(metrics.retry).toBeDefined();
      expect(metrics.bulkhead).toBeDefined();
      expect(metrics.bulkhead?.activeCalls).toBe(0);
      expect(metrics.bulkhead?.queuedCalls).toBe(0);
    });

    it('should provide health status', () => {
      const healthStatus = resilienceService.getHealthStatus();
      
      expect(healthStatus.service).toBe('test-service');
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.circuitBreakerState).toBe('CLOSED');
      expect(healthStatus.activeCalls).toBe(0);
      expect(healthStatus.queuedCalls).toBe(0);
    });

    it('should report unhealthy when circuit breaker is open', async () => {
      // Trip the circuit breaker
      const operation = vi.fn().mockRejectedValue(new Error('Failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await resilienceService.execute(operation, context, { skipRetry: true });
        } catch (error) {
          // Expected to fail
        }
      }
      
      const healthStatus = resilienceService.getHealthStatus();
      
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.circuitBreakerState).toBe('OPEN');
    });
  });
});

describe('Resilience Manager', () => {
  let resilienceManager: ResilienceManager;

  beforeEach(() => {
    resilienceManager = new ResilienceManager();
  });

  it('should create and cache resilience services', () => {
    const service1 = resilienceManager.getResilienceService('service1');
    const service2 = resilienceManager.getResilienceService('service1');
    const service3 = resilienceManager.getResilienceService('service2');
    
    expect(service1).toBe(service2); // Same instance for same config
    expect(service1).not.toBe(service3); // Different instance for different service
  });

  it('should create different instances for different configs', () => {
    const config1 = { timeout: 1000 };
    const config2 = { timeout: 2000 };
    
    const service1 = resilienceManager.getResilienceService('service1', config1);
    const service2 = resilienceManager.getResilienceService('service1', config2);
    
    expect(service1).not.toBe(service2);
  });

  it('should provide metrics for all services', () => {
    resilienceManager.getResilienceService('service1');
    resilienceManager.getResilienceService('service2');
    
    const metrics = resilienceManager.getAllMetrics();
    
    expect(metrics).toHaveLength(2);
    expect(metrics.some(m => m.service === 'service1')).toBe(true);
    expect(metrics.some(m => m.service === 'service2')).toBe(true);
  });

  it('should provide health status for all services', () => {
    resilienceManager.getResilienceService('service1');
    resilienceManager.getResilienceService('service2');
    
    const healthStatus = resilienceManager.getHealthStatus();
    
    expect(healthStatus.service1).toBeDefined();
    expect(healthStatus.service2).toBeDefined();
    expect(healthStatus.service1.healthy).toBe(true);
    expect(healthStatus.service2.healthy).toBe(true);
  });
});