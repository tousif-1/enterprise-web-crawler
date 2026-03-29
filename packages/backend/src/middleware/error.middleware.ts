import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ErrorContext, ErrorCategory, ErrorSeverity } from '@enterprise-web-crawler/shared';
import { ErrorMonitoringService } from '../services/error-monitoring.service';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  context?: ErrorContext;
  retryable?: boolean;
}

export class AppError extends Error implements ApiError {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly retryable: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    category: ErrorCategory = 'system',
    severity: ErrorSeverity = 'medium',
    isOperational: boolean = true,
    retryable: boolean = false,
    context?: ErrorContext
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.category = category;
    this.severity = severity;
    this.retryable = retryable;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 503, 'network', 'high', true, true, context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400, 'validation', 'low', true, false, context);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 500, 'database', 'high', true, true, context);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, retryable: boolean = true, context?: ErrorContext) {
    super(message, 502, 'external_service', 'medium', true, retryable, context);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 422, 'business_logic', 'medium', true, false, context);
  }
}

const errorMonitoring = new ErrorMonitoringService();

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { statusCode = 500, message, stack, category, severity, context } = error;

  // Generate request ID if not present
  const requestId = req.headers['x-request-id'] as string || generateRequestId();

  // Create error context
  const errorContext: ErrorContext = {
    service: 'backend-api',
    operation: `${req.method} ${req.path}`,
    url: req.url,
    requestId,
    timestamp: new Date(),
    metadata: {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ...context?.metadata
    },
    ...context
  };

  // Log error with context
  logger.error('Request error occurred', error, {
    context: errorContext,
    category,
    severity,
    statusCode,
    stack: process.env.NODE_ENV === 'development' ? stack : undefined
  });

  // Record error metrics
  errorMonitoring.recordError(error, errorContext);

  // Determine if error should be exposed to client
  const isOperationalError = error.isOperational !== false;
  const shouldExposeError = isOperationalError && statusCode < 500;

  const response = {
    error: {
      message: shouldExposeError ? message : 'Internal server error',
      code: error.name,
      requestId,
      timestamp: errorContext.timestamp.toISOString(),
      ...(process.env.NODE_ENV === 'development' && { 
        stack,
        context: errorContext 
      })
    }
  };

  // Set response headers
  res.set('X-Request-ID', requestId);
  
  // Send error response
  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  
  res.set('X-Request-ID', requestId);
  res.status(404).json({
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      requestId,
      timestamp: new Date().toISOString()
    }
  });
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.set('X-Request-ID', requestId);
  next();
};

export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new AppError(
          'Request timeout',
          408,
          'system',
          'medium',
          true,
          true,
          {
            service: 'backend-api',
            operation: `${req.method} ${req.path}`,
            timestamp: new Date(),
            metadata: { timeoutMs }
          }
        );
        next(error);
      }
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));
    
    next();
  };
};

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}