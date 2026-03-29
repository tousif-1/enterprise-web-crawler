import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreakerService, CircuitBreakerManager } from '../services/circuit-breaker.service';
import { CircuitBreakerConfig } from '@enterprise-web-crawler/shared';

describe('Circuit Breaker Service', () => {
  let circuitBreaker: CircuitBreakerService;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    config = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 500,
      expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT']
    };
    circuitBreaker = new CircuitBreakerService('test-service', config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Circuit Breaker States', () => {
    it('should start in CLOSED state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should remain CLOSED on successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });

    it('should increment failure count on operation failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to throw
      }
      
      expect(circuitBreaker.getState().failureCount).toBe(1);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should trip to OPEN state after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to throw
        }
      }
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
      expect(state.nextAttemptTime).toBeDefined();
    });

    it('should reject requests immediately when OPEN', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to throw
        }
      }
      
      // Now it should be OPEN and reject immediately
      const rejectedOperation = vi.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(rejectedOperation)).rejects.toThrow(
        'Circuit breaker is OPEN for service: test-service'
      );
      
      expect(rejectedOperation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to throw
        }
      }
      
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next operation should transition to HALF_OPEN
      const successOperation = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(successOperation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should reset to CLOSED on successful operation in HALF_OPEN', async () => {
      // Trip the circuit breaker
      const failOperation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to throw
        }
      }
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Successful operation should reset to CLOSED
      const successOperation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOperation);
      
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });
  });

  describe('Expected Errors', () => {
    it('should not count expected errors as failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to throw
      }
      
      expect(circuitBreaker.getState().failureCount).toBe(0);
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should count unexpected errors as failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Unexpected error'));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to throw
      }
      
      expect(circuitBreaker.getState().failureCount).toBe(1);
    });
  });

  describe('Manual Controls', () => {
    it('should force open circuit breaker', () => {
      circuitBreaker.forceOpen();
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.nextAttemptTime).toBeDefined();
    });

    it('should force close circuit breaker', () => {
      // First trip it
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState().state).toBe('OPEN');
      
      // Then force close
      circuitBreaker.forceClose();
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('Events', () => {
    it('should emit state change events', () => {
      const stateChangeHandler = vi.fn();
      circuitBreaker.on('stateChange', stateChangeHandler);
      
      circuitBreaker.forceOpen();
      
      expect(stateChangeHandler).toHaveBeenCalledWith('OPEN');
    });

    it('should emit trip events', () => {
      const tripHandler = vi.fn();
      circuitBreaker.on('trip', tripHandler);
      
      circuitBreaker.forceOpen();
      
      expect(tripHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test-service'
        })
      );
    });

    it('should emit reset events', () => {
      const resetHandler = vi.fn();
      circuitBreaker.on('reset', resetHandler);
      
      circuitBreaker.forceOpen();
      circuitBreaker.forceClose();
      
      expect(resetHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test-service'
        })
      );
    });
  });

  describe('Metrics', () => {
    it('should provide circuit breaker metrics', () => {
      const metrics = circuitBreaker.getMetrics();
      
      expect(metrics).toEqual({
        service: 'test-service',
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: undefined,
        nextAttemptTime: undefined,
        config
      });
    });
  });
});

describe('Circuit Breaker Manager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  it('should create and reuse circuit breakers', () => {
    const cb1 = manager.getCircuitBreaker('service1');
    const cb2 = manager.getCircuitBreaker('service1');
    const cb3 = manager.getCircuitBreaker('service2');
    
    expect(cb1).toBe(cb2); // Same instance
    expect(cb1).not.toBe(cb3); // Different instance
  });

  it('should provide health status for all circuit breakers', () => {
    const cb1 = manager.getCircuitBreaker('service1');
    const cb2 = manager.getCircuitBreaker('service2');
    
    cb2.forceOpen();
    
    const healthStatus = manager.getHealthStatus();
    
    expect(healthStatus).toEqual({
      service1: {
        healthy: true,
        state: 'CLOSED',
        failureCount: 0
      },
      service2: {
        healthy: false,
        state: 'OPEN',
        failureCount: 0
      }
    });
  });

  it('should provide metrics for all circuit breakers', () => {
    manager.getCircuitBreaker('service1');
    manager.getCircuitBreaker('service2');
    
    const metrics = manager.getAllMetrics();
    
    expect(metrics).toHaveLength(2);
    expect(metrics[0].service).toBe('service1');
    expect(metrics[1].service).toBe('service2');
  });
});