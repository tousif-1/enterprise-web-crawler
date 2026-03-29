import { describe, it, expect } from 'vitest';
import { 
  AppError, 
  NetworkError, 
  ValidationError, 
  DatabaseError, 
  ExternalServiceError,
  BusinessLogicError
} from '../middleware/error.middleware';

describe('Error Classes', () => {
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
});