import { RetryConfig, ErrorContext } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

export class RetryService {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...config
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    shouldRetry?: (error: Error) => boolean
  ): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        if (attempt > 0) {
          logger.info(`Retry attempt ${attempt}/${this.config.maxRetries}`, {
            context,
            attempt,
            maxRetries: this.config.maxRetries
          });
        }

        const result = await operation();
        
        if (attempt > 0) {
          logger.info('Operation succeeded after retry', {
            context,
            attempt,
            totalAttempts: attempt + 1
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Check if we should retry this error
        const isRetryable = shouldRetry ? shouldRetry(lastError) : this.isRetryableError(lastError);
        
        if (!isRetryable || attempt > this.config.maxRetries) {
          logger.error('Operation failed after all retry attempts', lastError, {
            context,
            attempt,
            maxRetries: this.config.maxRetries,
            isRetryable
          });
          break;
        }

        const delay = this.calculateDelay(attempt);
        
        logger.warn(`Operation failed, retrying in ${delay}ms`, {
          context,
          attempt,
          maxRetries: this.config.maxRetries,
          delay,
          error: lastError.message
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Cap at maxDelay
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(0, Math.floor(delay));
  }

  private isRetryableError(error: Error): boolean {
    // Check if error is marked as retryable
    if (error instanceof AppError) {
      return error.retryable;
    }

    // Network errors are generally retryable
    const retryableNetworkErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH'
    ];

    if (retryableNetworkErrors.some(code => error.message.includes(code))) {
      return true;
    }

    // HTTP status codes that are retryable
    const retryableHttpCodes = [408, 429, 500, 502, 503, 504];
    const httpStatusMatch = error.message.match(/status code (\d+)/);
    if (httpStatusMatch) {
      const statusCode = parseInt(httpStatusMatch[1]);
      return retryableHttpCodes.includes(statusCode);
    }

    // Timeout errors
    if (error.message.toLowerCase().includes('timeout')) {
      return true;
    }

    // Rate limiting
    if (error.message.toLowerCase().includes('rate limit')) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

export class RetryManager {
  private retryServices: Map<string, RetryService> = new Map();

  getRetryService(name: string, config?: Partial<RetryConfig>): RetryService {
    if (!this.retryServices.has(name)) {
      this.retryServices.set(name, new RetryService(config));
    }
    return this.retryServices.get(name)!;
  }

  // Convenience method for common retry scenarios
  async withRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryService = new RetryService(config);
    return retryService.execute(operation, context);
  }

  // Specific retry configurations for different scenarios
  async withNetworkRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    return this.withRetry(operation, context, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true
    });
  }

  async withDatabaseRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    return this.withRetry(operation, context, {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      jitter: true
    });
  }

  async withExternalServiceRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    return this.withRetry(operation, context, {
      maxRetries: 4,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2.5,
      jitter: true
    });
  }
}

// Singleton instance
export const retryManager = new RetryManager();