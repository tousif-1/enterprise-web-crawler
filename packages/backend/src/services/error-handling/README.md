# Error Handling and Resilience Patterns

This directory contains comprehensive error handling and resilience patterns implementation for the Enterprise Web Crawler backend service.

## Overview

The error handling system implements multiple resilience patterns to ensure the application can gracefully handle failures and maintain service availability:

- **Circuit Breaker Pattern**: Prevents cascade failures by temporarily blocking calls to failing services
- **Retry Pattern with Exponential Backoff**: Automatically retries failed operations with increasing delays
- **Bulkhead Pattern**: Isolates resources to prevent total system failure
- **Timeout Pattern**: Prevents hanging operations
- **Error Monitoring**: Tracks and alerts on error patterns and system health

## Components

### 1. Enhanced Error Middleware (`error.middleware.ts`)

Provides comprehensive error handling with:
- Structured error classes with categories and severity levels
- Request ID tracking for distributed tracing
- Context-aware error logging
- Development vs production error exposure
- Timeout middleware for request handling

#### Error Classes

```typescript
// Base error class with rich metadata
class AppError extends Error {
  statusCode: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  context?: ErrorContext;
}

// Specific error types
class NetworkError extends AppError        // 503, retryable
class ValidationError extends AppError     // 400, non-retryable
class DatabaseError extends AppError       // 500, retryable
class ExternalServiceError extends AppError // 502, retryable
class BusinessLogicError extends AppError  // 422, non-retryable
```

### 2. Circuit Breaker Service (`circuit-breaker.service.ts`)

Implements the circuit breaker pattern to prevent cascade failures:

```typescript
const circuitBreaker = new CircuitBreakerService('external-api', {
  failureThreshold: 5,     // Trip after 5 failures
  resetTimeout: 60000,     // Try again after 1 minute
  monitoringPeriod: 10000, // Monitor over 10 seconds
  expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT']
});

// Execute operation with circuit breaker protection
const result = await circuitBreaker.execute(async () => {
  return await externalApiCall();
});
```

#### Circuit Breaker States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failures exceeded threshold, requests are rejected immediately
- **HALF_OPEN**: Testing if service has recovered

### 3. Retry Service (`retry.service.ts`)

Implements retry logic with exponential backoff:

```typescript
const retryService = new RetryService({
  maxRetries: 3,
  baseDelay: 1000,        // Start with 1 second
  maxDelay: 30000,        // Cap at 30 seconds
  backoffMultiplier: 2,   // Double delay each retry
  jitter: true            // Add randomness to prevent thundering herd
});

const result = await retryService.execute(operation, context);
```

#### Retry Logic

- Automatically retries network errors (ECONNREFUSED, ETIMEDOUT, etc.)
- Retries HTTP 5xx errors and specific 4xx errors (408, 429)
- Respects `retryable` flag on custom errors
- Supports custom retry predicates

### 4. Error Monitoring Service (`error-monitoring.service.ts`)

Tracks error patterns and generates alerts:

```typescript
const errorMonitoring = new ErrorMonitoringService();

// Record errors with context
errorMonitoring.recordError(error, context);

// Set up alert handlers
errorMonitoring.on('alert', (alert) => {
  console.log(`Alert: ${alert.type} - ${alert.message}`);
});

// Get metrics
const metrics = errorMonitoring.getMetrics();
```

#### Alert Types

- **Critical Error Alert**: Multiple critical errors in short time
- **Error Rate Alert**: Error rate exceeds threshold
- **Error Spike Alert**: Sudden increase in error rate
- **Service Down Alert**: Circuit breaker opens

### 5. Resilience Service (`resilience.service.ts`)

Combines multiple resilience patterns:

```typescript
const resilienceService = new ResilienceService('my-service', {
  retry: { maxRetries: 3, baseDelay: 1000 },
  circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 },
  timeout: 30000,
  bulkhead: { maxConcurrent: 10, queueSize: 50 }
});

// Execute with all resilience patterns
const result = await resilienceService.execute(operation, context);

// Convenience methods for specific scenarios
await resilienceService.executeWithNetworkResilience(operation, context);
await resilienceService.executeWithDatabaseResilience(operation, context);
await resilienceService.executeWithExternalServiceResilience(operation, context);
```

## Usage Examples

### Basic Error Handling

```typescript
import { asyncHandler, NetworkError } from '../middleware/error.middleware';

router.get('/api/data', asyncHandler(async (req, res) => {
  try {
    const data = await fetchExternalData();
    res.json(data);
  } catch (error) {
    // Throw structured error
    throw new NetworkError('Failed to fetch external data', {
      service: 'data-service',
      operation: 'fetch-data',
      timestamp: new Date(),
      metadata: { url: req.url }
    });
  }
}));
```

### Circuit Breaker Protection

```typescript
import { circuitBreakerManager } from '../services/circuit-breaker.service';

const circuitBreaker = circuitBreakerManager.getCircuitBreaker('payment-service');

const processPayment = async (paymentData) => {
  return await circuitBreaker.execute(async () => {
    return await paymentServiceApi.charge(paymentData);
  });
};
```

### Retry with Custom Logic

```typescript
import { retryManager } from '../services/retry.service';

const fetchWithRetry = async (url: string) => {
  return await retryManager.withNetworkRetry(
    async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    {
      service: 'http-client',
      operation: 'fetch',
      timestamp: new Date(),
      metadata: { url }
    }
  );
};
```

### Combined Resilience

```typescript
import { resilienceManager } from '../services/resilience.service';

const resilientDatabaseQuery = async (query: string) => {
  const resilience = resilienceManager.getResilienceService('database', {
    retry: { maxRetries: 3, baseDelay: 500 },
    circuitBreaker: { failureThreshold: 3, resetTimeout: 30000 },
    timeout: 10000
  });

  return await resilience.execute(
    async () => {
      return await database.query(query);
    },
    {
      service: 'database',
      operation: 'query',
      timestamp: new Date(),
      metadata: { query }
    }
  );
};
```

## Health Monitoring

### Health Check Endpoints

The system provides health check endpoints that include resilience status:

- `GET /api/health` - Basic health with resilience overview
- `GET /api/health/detailed` - Detailed health including circuit breaker states
- `GET /api/health/ready` - Readiness check for deployment
- `GET /api/health/metrics` - Detailed metrics for monitoring

### Metrics Collection

```typescript
// Circuit breaker metrics
const cbMetrics = circuitBreakerManager.getAllMetrics();

// Resilience service metrics
const resilienceMetrics = resilienceManager.getAllMetrics();

// Error monitoring metrics
const errorMetrics = errorMonitoring.getMetrics();
```

## Configuration

### Environment Variables

```bash
# Error monitoring thresholds
ERROR_RATE_THRESHOLD=0.1          # 10% error rate threshold
CRITICAL_ERROR_COUNT=5            # Critical error count threshold
MONITORING_WINDOW_MS=300000       # 5 minute monitoring window

# Circuit breaker defaults
CB_FAILURE_THRESHOLD=5            # Default failure threshold
CB_RESET_TIMEOUT=60000           # Default reset timeout (1 minute)

# Retry defaults
RETRY_MAX_RETRIES=3              # Default max retries
RETRY_BASE_DELAY=1000            # Default base delay (1 second)
RETRY_MAX_DELAY=30000            # Default max delay (30 seconds)
```

### Service-Specific Configuration

```typescript
// Configure different resilience patterns per service
const configs = {
  'external-api': {
    retry: { maxRetries: 5, baseDelay: 2000 },
    circuitBreaker: { failureThreshold: 10, resetTimeout: 120000 },
    timeout: 30000
  },
  'database': {
    retry: { maxRetries: 3, baseDelay: 500 },
    circuitBreaker: { failureThreshold: 3, resetTimeout: 30000 },
    timeout: 10000
  },
  'internal-service': {
    retry: { maxRetries: 2, baseDelay: 100 },
    circuitBreaker: { failureThreshold: 5, resetTimeout: 60000 },
    timeout: 5000
  }
};
```

## Testing

The implementation includes comprehensive tests for all resilience patterns:

- Unit tests for individual components
- Integration tests for combined patterns
- Error scenario testing
- Performance and load testing
- Circuit breaker state transition testing

Run tests:
```bash
npm test -- --testPathPattern=error-handling
npm test -- --testPathPattern=circuit-breaker
npm test -- --testPathPattern=retry
npm test -- --testPathPattern=resilience
```

## Best Practices

1. **Error Classification**: Always use appropriate error classes with correct categories and severity levels
2. **Context Enrichment**: Include relevant context information for debugging and monitoring
3. **Graceful Degradation**: Design fallback mechanisms for non-critical operations
4. **Monitoring Integration**: Set up alerts and dashboards for error metrics
5. **Testing**: Test error scenarios and recovery mechanisms regularly
6. **Documentation**: Document expected error conditions and recovery procedures

## Integration with External Monitoring

The error handling system is designed to integrate with external monitoring tools:

- **Prometheus**: Metrics can be exported for Prometheus scraping
- **Grafana**: Dashboards can visualize error rates and circuit breaker states
- **AlertManager**: Alerts can be forwarded to external alerting systems
- **Logging**: Structured logs are compatible with ELK stack and similar tools

## Performance Considerations

- Circuit breakers have minimal overhead when closed
- Retry logic uses efficient exponential backoff algorithms
- Error monitoring uses in-memory data structures with automatic cleanup
- Bulkhead pattern prevents resource exhaustion
- All patterns are designed for high-throughput scenarios