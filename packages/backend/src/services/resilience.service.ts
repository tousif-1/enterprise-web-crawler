import { CircuitBreakerService, circuitBreakerManager } from './circuit-breaker.service';
import { RetryService, retryManager } from './retry.service';
import { ErrorContext, RetryConfig, CircuitBreakerConfig } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

export interface ResilienceConfig {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  timeout?: number;
  bulkhead?: {
    maxConcurrent: number;
    queueSize: number;
  };
}

export class ResilienceService {
  private retryService: RetryService;
  private circuitBreaker: CircuitBreakerService;
  private serviceName: string;
  private config: ResilienceConfig;
  private activeCalls: Set<Promise<any>> = new Set();
  private callQueue: Array<() => void> = [];

  constructor(serviceName: string, config: ResilienceConfig = {}) {
    this.serviceName = serviceName;
    this.config = config;
    
    this.retryService = new RetryService(config.retry);
    this.circuitBreaker = circuitBreakerManager.getCircuitBreaker(serviceName, config.circuitBreaker);
  }

  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options?: {
      skipRetry?: boolean;
      skipCircuitBreaker?: boolean;
      timeout?: number;
    }
  ): Promise<T> {
    const finalContext = {
      ...context,
      service: this.serviceName,
      timestamp: new Date()
    };

    // Apply bulkhead pattern if configured
    if (this.config.bulkhead) {
      await this.acquireBulkheadSlot();
    }

    try {
      const wrappedOperation = this.wrapWithTimeout(operation, options?.timeout || this.config.timeout);

      if (options?.skipCircuitBreaker) {
        // Skip circuit breaker, but still apply retry
        if (options?.skipRetry) {
          return await wrappedOperation();
        } else {
          return await this.retryService.execute(wrappedOperation, finalContext);
        }
      }

      // Apply circuit breaker pattern
      return await this.circuitBreaker.execute(async () => {
        if (options?.skipRetry) {
          return await wrappedOperation();
        } else {
          return await this.retryService.execute(wrappedOperation, finalContext);
        }
      });
    } finally {
      if (this.config.bulkhead) {
        this.releaseBulkheadSlot();
      }
    }
  }

  private wrapWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): () => Promise<T> {
    if (!timeoutMs) {
      return operation;
    }

    return async (): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        operation()
          .then(resolve)
          .catch(reject)
          .finally(() => clearTimeout(timer));
      });
    };
  }

  private async acquireBulkheadSlot(): Promise<void> {
    if (!this.config.bulkhead) return;

    const { maxConcurrent, queueSize } = this.config.bulkhead;

    if (this.activeCalls.size < maxConcurrent) {
      return; // Slot available
    }

    if (this.callQueue.length >= queueSize) {
      throw new Error(`Bulkhead queue full for service: ${this.serviceName}`);
    }

    // Wait for a slot to become available
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.callQueue.findIndex(callback => callback === resolve);
        if (index !== -1) {
          this.callQueue.splice(index, 1);
        }
        reject(new Error(`Bulkhead timeout for service: ${this.serviceName}`));
      }, 30000); // 30 second timeout

      const callback = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      this.callQueue.push(callback);
    });
  }

  private releaseBulkheadSlot(): void {
    if (!this.config.bulkhead) return;

    // Process next item in queue
    const nextCallback = this.callQueue.shift();
    if (nextCallback) {
      nextCallback();
    }
  }

  // Convenience methods for common patterns
  async executeWithNetworkResilience<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    return this.execute(operation, context);
  }

  async executeWithDatabaseResilience<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    const dbConfig: ResilienceConfig = {
      retry: {
        maxRetries: 3,
        baseDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 1.5
      },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 30000
      },
      timeout: 10000
    };

    const dbResilience = new ResilienceService(`${this.serviceName}-db`, dbConfig);
    return dbResilience.execute(operation, context);
  }

  async executeWithExternalServiceResilience<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    const externalConfig: ResilienceConfig = {
      retry: {
        maxRetries: 4,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2.5
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      },
      timeout: 30000,
      bulkhead: {
        maxConcurrent: 10,
        queueSize: 50
      }
    };

    const externalResilience = new ResilienceService(`${this.serviceName}-external`, externalConfig);
    return externalResilience.execute(operation, context);
  }

  getMetrics() {
    return {
      service: this.serviceName,
      circuitBreaker: this.circuitBreaker.getMetrics(),
      retry: this.retryService.getConfig(),
      bulkhead: this.config.bulkhead ? {
        activeCalls: this.activeCalls.size,
        queuedCalls: this.callQueue.length,
        maxConcurrent: this.config.bulkhead.maxConcurrent,
        queueSize: this.config.bulkhead.queueSize
      } : null
    };
  }

  getHealthStatus() {
    const circuitBreakerState = this.circuitBreaker.getState();
    const isHealthy = circuitBreakerState.state === 'CLOSED';

    return {
      service: this.serviceName,
      healthy: isHealthy,
      circuitBreakerState: circuitBreakerState.state,
      activeCalls: this.activeCalls.size,
      queuedCalls: this.callQueue.length
    };
  }
}

export class ResilienceManager {
  private services: Map<string, ResilienceService> = new Map();

  getResilienceService(serviceName: string, config?: ResilienceConfig): ResilienceService {
    const key = `${serviceName}-${JSON.stringify(config)}`;
    
    if (!this.services.has(key)) {
      this.services.set(key, new ResilienceService(serviceName, config));
    }

    return this.services.get(key)!;
  }

  getAllMetrics() {
    const metrics: any[] = [];
    for (const [key, service] of this.services) {
      metrics.push(service.getMetrics());
    }
    return metrics;
  }

  getHealthStatus() {
    const status: Record<string, any> = {};
    for (const [key, service] of this.services) {
      const serviceStatus = service.getHealthStatus();
      status[serviceStatus.service] = serviceStatus;
    }
    return status;
  }
}

// Singleton instance
export const resilienceManager = new ResilienceManager();