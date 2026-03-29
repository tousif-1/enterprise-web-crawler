import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorMonitoringService } from '../services/error-monitoring.service';
import { AppError } from '../middleware/error.middleware';
import { ErrorContext } from '@enterprise-web-crawler/shared';

describe('Error Monitoring Service', () => {
  let errorMonitoring: ErrorMonitoringService;
  let context: ErrorContext;

  beforeEach(() => {
    errorMonitoring = new ErrorMonitoringService();
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

  describe('Error Recording', () => {
    it('should record basic error information', () => {
      const error = new Error('Test error');
      
      errorMonitoring.recordError(error, context);
      
      const metrics = errorMonitoring.getMetrics();
      expect(metrics.errorCount).toBe(1);
    });

    it('should record error categories', () => {
      const error = new AppError('Network error', 503, 'network', 'high');
      
      errorMonitoring.recordError(error, context);
      
      const metrics = errorMonitoring.getMetrics();
      expect(metrics.errorsByCategory.network).toBe(1);
      expect(metrics.errorsByCategory.database).toBe(0);
    });

    it('should record error severities', () => {
      const error = new AppError('Critical error', 500, 'system', 'critical');
      
      errorMonitoring.recordError(error, context);
      
      const metrics = errorMonitoring.getMetrics();
      expect(metrics.errorsBySeverity.critical).toBe(1);
      expect(metrics.errorsBySeverity.high).toBe(0);
    });

    it('should track errors by service', () => {
      const context1 = { ...context, service: 'service1' };
      const context2 = { ...context, service: 'service2' };
      
      errorMonitoring.recordError(new Error('Error 1'), context1);
      errorMonitoring.recordError(new Error('Error 2'), context1);
      errorMonitoring.recordError(new Error('Error 3'), context2);
      
      const service1Metrics = errorMonitoring.getServiceMetrics('service1');
      const service2Metrics = errorMonitoring.getServiceMetrics('service2');
      
      expect(service1Metrics.totalErrors).toBe(2);
      expect(service2Metrics.totalErrors).toBe(1);
    });
  });

  describe('Alert Generation', () => {
    it('should emit alert for critical errors', () => {
      const alertHandler = vi.fn();
      errorMonitoring.on('alert', alertHandler);
      
      // Generate 5 critical errors to trigger alert
      for (let i = 0; i < 5; i++) {
        const error = new AppError('Critical error', 500, 'system', 'critical');
        errorMonitoring.recordError(error, context);
      }
      
      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'critical_error',
          severity: 'critical',
          message: expect.stringContaining('5 critical errors detected')
        })
      );
    });

    it('should emit error event for each recorded error', () => {
      const errorHandler = vi.fn();
      errorMonitoring.on('error', errorHandler);
      
      const error = new Error('Test error');
      errorMonitoring.recordError(error, context);
      
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          context,
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate error metrics correctly', () => {
      const error1 = new AppError('Error 1', 500, 'network', 'high');
      const error2 = new AppError('Error 2', 400, 'validation', 'low');
      
      errorMonitoring.recordError(error1, context);
      errorMonitoring.recordError(error2, context);
      
      const metrics = errorMonitoring.getMetrics();
      
      expect(metrics.errorCount).toBe(2);
      expect(metrics.errorsByCategory.network).toBe(1);
      expect(metrics.errorsByCategory.validation).toBe(1);
      expect(metrics.errorsBySeverity.high).toBe(1);
      expect(metrics.errorsBySeverity.low).toBe(1);
      expect(metrics.lastErrorTime).toBeDefined();
    });

    it('should provide service-specific metrics', () => {
      const serviceContext = { ...context, service: 'specific-service' };
      
      errorMonitoring.recordError(new Error('Error 1'), serviceContext);
      errorMonitoring.recordError(new Error('Error 2'), serviceContext);
      
      const serviceMetrics = errorMonitoring.getServiceMetrics('specific-service');
      
      expect(serviceMetrics.service).toBe('specific-service');
      expect(serviceMetrics.totalErrors).toBe(2);
      expect(serviceMetrics.recentErrors).toBe(2);
      expect(serviceMetrics.lastErrorTime).toBeDefined();
    });
  });

  describe('Health Status', () => {
    it('should report healthy status with low error rate', () => {
      const healthStatus = errorMonitoring.getHealthStatus();
      
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.errorCount).toBe(0);
      expect(healthStatus.errorRate).toBe(0);
    });

    it('should report degraded status with high error rate', () => {
      // Mock getTotalRequestCount to return a value for error rate calculation
      const originalGetTotalRequestCount = (errorMonitoring as any).getTotalRequestCount;
      (errorMonitoring as any).getTotalRequestCount = vi.fn().mockReturnValue(10);
      
      // Generate errors to exceed threshold (10% = 1 error out of 10 requests)
      for (let i = 0; i < 2; i++) {
        errorMonitoring.recordError(new Error('Test error'), context);
      }
      
      const healthStatus = errorMonitoring.getHealthStatus();
      
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.errorCount).toBe(2);
      
      // Restore original method
      (errorMonitoring as any).getTotalRequestCount = originalGetTotalRequestCount;
    });
  });

  describe('Configuration', () => {
    it('should allow updating alert thresholds', () => {
      const newThresholds = {
        errorRate: 0.05, // 5%
        criticalErrorCount: 3
      };
      
      errorMonitoring.setAlertThresholds(newThresholds);
      
      const thresholds = errorMonitoring.getAlertThresholds();
      expect(thresholds.errorRate).toBe(0.05);
      expect(thresholds.criticalErrorCount).toBe(3);
    });

    it('should preserve existing thresholds when updating', () => {
      const originalThresholds = errorMonitoring.getAlertThresholds();
      
      errorMonitoring.setAlertThresholds({ errorRate: 0.05 });
      
      const updatedThresholds = errorMonitoring.getAlertThresholds();
      expect(updatedThresholds.errorRate).toBe(0.05);
      expect(updatedThresholds.criticalErrorCount).toBe(originalThresholds.criticalErrorCount);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old errors', () => {
      // Record an error
      errorMonitoring.recordError(new Error('Old error'), context);
      
      // Fast-forward time beyond cleanup threshold (2x monitoring window)
      vi.advanceTimersByTime(600000 + 1000); // 10 minutes + 1 second
      
      // Trigger cleanup by advancing another minute
      vi.advanceTimersByTime(60000);
      
      const metrics = errorMonitoring.getMetrics();
      // The error should still be counted in total but not in recent metrics
      expect(metrics.errorCount).toBe(1);
    });
  });

  describe('Error Rate Calculation', () => {
    it('should calculate current error rate', () => {
      // Mock the private methods for testing
      const getCurrentErrorRate = (errorMonitoring as any).getCurrentErrorRate.bind(errorMonitoring);
      
      // Record errors within the last minute
      errorMonitoring.recordError(new Error('Error 1'), context);
      errorMonitoring.recordError(new Error('Error 2'), context);
      
      const errorRate = getCurrentErrorRate();
      expect(errorRate).toBe(2); // 2 errors in the last minute
    });

    it('should calculate baseline error rate', () => {
      const getBaselineErrorRate = (errorMonitoring as any).getBaselineErrorRate.bind(errorMonitoring);
      
      // Record errors in the baseline period (5-10 minutes ago)
      vi.setSystemTime(new Date(Date.now() - 420000)); // 7 minutes ago
      errorMonitoring.recordError(new Error('Baseline error 1'), context);
      errorMonitoring.recordError(new Error('Baseline error 2'), context);
      
      // Return to current time
      vi.setSystemTime(new Date());
      
      const baselineRate = getBaselineErrorRate();
      expect(baselineRate).toBe(0.4); // 2 errors over 5 minutes = 0.4 per minute
    });
  });
});