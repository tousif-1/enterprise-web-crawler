import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { 
  AppError, 
  NetworkError, 
  ValidationError, 
  DatabaseError, 
  ExternalServiceError,
  BusinessLogicError,
  errorHandler,
  requestIdMiddleware,
  timeoutMiddleware
} from '../middleware/error.middleware';

describe('Error Handling Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      url: '/test',
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      headers: {},
      body: {},
      params: {},
      query: {},
      get: vi.fn().mockReturnValue('test-user-agent')
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      headersSent: false,
      on: vi.fn()
    };

    mockNext = vi.fn() as unknown as NextFunction;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.category).toBe('system');
      expect(error.severity).toBe('medium');
      expect(error.isOperational).toBe(true);
      expect(error.retryable).toBe(false);
    });

    it('should create error with custom values', () => {
      const context = {
        service: 'test-service',
        operation: 'test-operation',
        timestamp: new Date()
      };

      const error = new AppError(
        'Custom error',
        400,
        'validation',
        'low',
        true,
        true,
        context
      );
      
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe('validation');
      expect(error.severity).toBe('low');
      expect(error.isOperational).toBe(true);
      expect(error.retryable).toBe(true);
      expect(error.context).toBe(context);
    });
  });

  describe('Specific Error Types', () => {
    it('should create NetworkError with correct properties', () => {
      const error = new NetworkError('Connection failed');
      
      expect(error.statusCode).toBe(503);
      expect(error.category).toBe('network');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe(true);
    });

    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe('validation');
      expect(error.severity).toBe('low');
      expect(error.retryable).toBe(false);
    });

    it('should create DatabaseError with correct properties', () => {
      const error = new DatabaseError('Database connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.category).toBe('database');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe(true);
    });

    it('should create ExternalServiceError with correct properties', () => {
      const error = new ExternalServiceError('Service unavailable');
      
      expect(error.statusCode).toBe(502);
      expect(error.category).toBe('external_service');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(true);
    });

    it('should create BusinessLogicError with correct properties', () => {
      const error = new BusinessLogicError('Business rule violation');
      
      expect(error.statusCode).toBe(422);
      expect(error.category).toBe('business_logic');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(false);
    });
  });

  describe('errorHandler', () => {
    it('should handle operational errors correctly', () => {
      const error = new ValidationError('Invalid input');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid input',
            code: 'ValidationError'
          })
        })
      );
    });

    it('should hide non-operational error messages', () => {
      const error = new AppError('Internal error', 500, 'system', 'high', false);
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Internal server error'
          })
        })
      );
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new ValidationError('Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            stack: expect.any(String)
          })
        })
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should set request ID header', () => {
      const error = new ValidationError('Test error');
      mockRequest.headers = { 'x-request-id': 'test-request-id' };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', 'test-request-id');
    });
  });

  describe('requestIdMiddleware', () => {
    it('should add request ID if not present', () => {
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.headers!['x-request-id']).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.headers!['x-request-id']);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should preserve existing request ID', () => {
      mockRequest.headers = { 'x-request-id': 'existing-id' };
      
      requestIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.headers['x-request-id']).toBe('existing-id');
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', 'existing-id');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('timeoutMiddleware', () => {
    it('should call next immediately if no timeout', () => {
      const middleware = timeoutMiddleware(1000);
      
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should trigger timeout error after specified time', async () => {
      const middleware = timeoutMiddleware(100);
      let capturedError: any = null;
      
      middleware(mockRequest as Request, mockResponse as Response, (error) => {
        capturedError = error;
      });
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(capturedError).toBeInstanceOf(AppError);
      expect(capturedError.message).toBe('Request timeout');
      expect(capturedError.statusCode).toBe(408);
    });

    it('should not trigger timeout if response finishes', () => {
      const middleware = timeoutMiddleware(100);
      let timeoutTriggered = false;
      
      const mockRes = {
        ...mockResponse,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 50); // Finish before timeout
          }
        })
      } as unknown as Response;
      
      middleware(mockRequest as Request, mockRes, () => {
        timeoutTriggered = true;
      });
      
      setTimeout(() => {
        expect(timeoutTriggered).toBe(false);
      }, 150);
    });
  });
});