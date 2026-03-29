import { ResilienceService } from '../services/resilience.service';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { RetryService } from '../services/retry.service';
import { ErrorMonitoringService } from '../services/error-monitoring.service';
import { NetworkError, DatabaseError, ExternalServiceError } from '../middleware/error.middleware';
import { ErrorContext } from '@enterprise-web-crawler/shared';

// Demo: Error Handling and Resilience Patterns

async function demonstrateErrorHandling() {
  console.log('=== Error Handling and Resilience Patterns Demo ===\n');

  // 1. Circuit Breaker Pattern
  console.log('1. Circuit Breaker Pattern');
  const circuitBreaker = new CircuitBreakerService('external-api', {
    failureThreshold: 3,
    resetTimeout: 5000,
    monitoringPeriod: 1000,
    expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT']
  });

  // Simulate failing service
  let callCount = 0;
  const failingService = async () => {
    callCount++;
    if (callCount <= 3) {
      throw new Error('Service temporarily unavailable');
    }
    return 'Success after recovery';
  };

  // Try to call the failing service
  for (let i = 1; i <= 5; i++) {
    try {
      const result = await circuitBreaker.execute(failingService);
      console.log(`  Call ${i}: ${result}`);
    } catch (error) {
      console.log(`  Call ${i}: Failed - ${(error as Error).message}`);
    }
  }

  console.log(`  Circuit Breaker State: ${circuitBreaker.getState().state}\n`);

  // 2. Retry Pattern with Exponential Backoff
  console.log('2. Retry Pattern with Exponential Backoff');
  const retryService = new RetryService({
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    jitter: false
  });

  const context: ErrorContext = {
    service: 'demo-service',
    operation: 'retry-demo',
    timestamp: new Date()
  };

  let retryCallCount = 0;
  const intermittentService = async () => {
    retryCallCount++;
    if (retryCallCount <= 2) {
      throw new NetworkError('Network timeout');
    }
    return 'Success after retries';
  };

  try {
    const result = await retryService.execute(intermittentService, context);
    console.log(`  Retry Result: ${result}`);
  } catch (error) {
    console.log(`  Retry Failed: ${(error as Error).message}`);
  }
  console.log(`  Total Attempts: ${retryCallCount}\n`);

  // 3. Combined Resilience Service
  console.log('3. Combined Resilience Service');
  const resilienceService = new ResilienceService('combined-demo', {
    retry: {
      maxRetries: 2,
      baseDelay: 50,
      maxDelay: 500,
      backoffMultiplier: 2
    },
    circuitBreaker: {
      failureThreshold: 2,
      resetTimeout: 2000,
      monitoringPeriod: 500,
      expectedErrors: []
    },
    timeout: 1000,
    bulkhead: {
      maxConcurrent: 2,
      queueSize: 3
    }
  });

  // Simulate database operation with resilience
  const databaseOperation = async () => {
    // Simulate random failure
    if (Math.random() < 0.3) {
      throw new DatabaseError('Database connection timeout');
    }
    return 'Database query successful';
  };

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await resilienceService.executeWithDatabaseResilience(
        databaseOperation,
        { ...context, operation: `db-query-${i}` }
      );
      console.log(`  DB Operation ${i}: ${result}`);
    } catch (error) {
      console.log(`  DB Operation ${i}: Failed - ${(error as Error).message}`);
    }
  }

  console.log(`  Resilience Health: ${JSON.stringify(resilienceService.getHealthStatus(), null, 2)}\n`);

  // 4. Error Monitoring
  console.log('4. Error Monitoring');
  const errorMonitoring = new ErrorMonitoringService();

  // Set up alert listener
  errorMonitoring.on('alert', (alert) => {
    console.log(`  🚨 ALERT: ${alert.type} - ${alert.message}`);
  });

  // Simulate various errors
  const errors = [
    new NetworkError('Connection refused'),
    new DatabaseError('Query timeout'),
    new ExternalServiceError('API rate limit exceeded'),
    new NetworkError('DNS resolution failed'),
    new DatabaseError('Connection pool exhausted')
  ];

  errors.forEach((error, index) => {
    errorMonitoring.recordError(error, {
      ...context,
      operation: `error-simulation-${index + 1}`
    });
  });

  const metrics = errorMonitoring.getMetrics();
  console.log('  Error Metrics:');
  console.log(`    Total Errors: ${metrics.errorCount}`);
  console.log(`    Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
  console.log(`    By Category: ${JSON.stringify(metrics.errorsByCategory)}`);
  console.log(`    By Severity: ${JSON.stringify(metrics.errorsBySeverity)}`);
  console.log(`    Health Status: ${errorMonitoring.getHealthStatus().status}\n`);

  // 5. Bulkhead Pattern Demo
  console.log('5. Bulkhead Pattern Demo');
  const bulkheadService = new ResilienceService('bulkhead-demo', {
    bulkhead: {
      maxConcurrent: 2,
      queueSize: 2
    }
  });

  const slowOperation = (id: number) => async () => {
    console.log(`    Operation ${id} started`);
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`    Operation ${id} completed`);
    return `Result ${id}`;
  };

  // Start 5 operations (2 concurrent, 2 queued, 1 rejected)
  const bulkheadPromises = [];
  for (let i = 1; i <= 5; i++) {
    bulkheadPromises.push(
      bulkheadService.execute(slowOperation(i), {
        ...context,
        operation: `bulkhead-op-${i}`
      }).catch(error => `Operation ${i} rejected: ${error.message}`)
    );
  }

  const bulkheadResults = await Promise.all(bulkheadPromises);
  bulkheadResults.forEach((result, index) => {
    console.log(`  Operation ${index + 1}: ${result}`);
  });

  console.log('\n=== Demo Complete ===');
}

// Run the demo
if (require.main === module) {
  demonstrateErrorHandling().catch(console.error);
}

export { demonstrateErrorHandling };