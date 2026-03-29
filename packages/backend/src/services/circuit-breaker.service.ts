import { CircuitBreakerConfig, CircuitBreakerState } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export class CircuitBreakerService extends EventEmitter {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private serviceName: string;

  constructor(serviceName: string, config: CircuitBreakerConfig) {
    super();
    this.serviceName = serviceName;
    this.config = config;
    this.state = {
      state: 'CLOSED',
      failureCount: 0
    };

    logger.info(`Circuit breaker initialized for service: ${serviceName}`, {
      config: this.config
    });
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state.state = 'HALF_OPEN';
        logger.info(`Circuit breaker transitioning to HALF_OPEN for service: ${this.serviceName}`);
        this.emit('stateChange', 'HALF_OPEN');
      } else {
        const error = new Error(`Circuit breaker is OPEN for service: ${this.serviceName}`);
        logger.warn('Circuit breaker rejected request', {
          service: this.serviceName,
          state: this.state.state,
          nextAttemptTime: this.state.nextAttemptTime
        });
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.reset();
      logger.info(`Circuit breaker reset to CLOSED for service: ${this.serviceName}`);
    }
    
    // Reset failure count on success
    this.state.failureCount = 0;
  }

  private onFailure(error: Error): void {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    const isExpectedError = this.config.expectedErrors.some(expectedError => 
      error.message.includes(expectedError) || error.name === expectedError
    );

    if (!isExpectedError) {
      logger.warn('Circuit breaker recorded failure', {
        service: this.serviceName,
        failureCount: this.state.failureCount,
        threshold: this.config.failureThreshold,
        error: error.message
      });

      if (this.state.failureCount >= this.config.failureThreshold) {
        this.trip();
      }
    }
  }

  private trip(): void {
    this.state.state = 'OPEN';
    this.state.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    
    logger.error(`Circuit breaker OPENED for service: ${this.serviceName}`, {
      failureCount: this.state.failureCount,
      nextAttemptTime: this.state.nextAttemptTime
    });

    this.emit('stateChange', 'OPEN');
    this.emit('trip', {
      service: this.serviceName,
      failureCount: this.state.failureCount,
      nextAttemptTime: this.state.nextAttemptTime
    });
  }

  private reset(): void {
    this.state = {
      state: 'CLOSED',
      failureCount: 0
    };
    
    this.emit('stateChange', 'CLOSED');
    this.emit('reset', { service: this.serviceName });
  }

  private shouldAttemptReset(): boolean {
    return this.state.nextAttemptTime ? 
      new Date() >= this.state.nextAttemptTime : 
      false;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  getMetrics() {
    return {
      service: this.serviceName,
      state: this.state.state,
      failureCount: this.state.failureCount,
      lastFailureTime: this.state.lastFailureTime,
      nextAttemptTime: this.state.nextAttemptTime,
      config: this.config
    };
  }

  // Manual controls for testing and emergency situations
  forceOpen(): void {
    this.state.state = 'OPEN';
    this.state.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    logger.warn(`Circuit breaker manually opened for service: ${this.serviceName}`);
    this.emit('stateChange', 'OPEN');
  }

  forceClose(): void {
    this.reset();
    logger.info(`Circuit breaker manually closed for service: ${this.serviceName}`);
  }
}

export class CircuitBreakerManager {
  private circuitBreakers: Map<string, CircuitBreakerService> = new Map();
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 10000, // 10 seconds
    expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
  };

  getCircuitBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreakerService {
    if (!this.circuitBreakers.has(serviceName)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      const circuitBreaker = new CircuitBreakerService(serviceName, finalConfig);
      
      // Set up monitoring
      this.setupMonitoring(circuitBreaker);
      
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    return this.circuitBreakers.get(serviceName)!;
  }

  private setupMonitoring(circuitBreaker: CircuitBreakerService): void {
    circuitBreaker.on('stateChange', (newState) => {
      logger.info('Circuit breaker state changed', {
        service: circuitBreaker.getMetrics().service,
        newState,
        metrics: circuitBreaker.getMetrics()
      });
    });

    circuitBreaker.on('trip', (data) => {
      logger.error('Circuit breaker tripped', data);
    });

    circuitBreaker.on('reset', (data) => {
      logger.info('Circuit breaker reset', data);
    });
  }

  getAllMetrics() {
    const metrics: any[] = [];
    for (const [serviceName, circuitBreaker] of this.circuitBreakers) {
      metrics.push(circuitBreaker.getMetrics());
    }
    return metrics;
  }

  getHealthStatus() {
    const status: Record<string, any> = {};
    for (const [serviceName, circuitBreaker] of this.circuitBreakers) {
      const state = circuitBreaker.getState();
      status[serviceName] = {
        healthy: state.state === 'CLOSED',
        state: state.state,
        failureCount: state.failureCount
      };
    }
    return status;
  }
}

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();