import { ErrorContext, ErrorCategory, ErrorSeverity, ErrorMetrics } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface ErrorAlert {
  id: string;
  type: 'error_rate' | 'error_spike' | 'critical_error' | 'service_down';
  message: string;
  severity: ErrorSeverity;
  context: ErrorContext;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ErrorMonitoringService extends EventEmitter {
  private errorCounts: Map<string, number> = new Map();
  private errorsByCategory: Map<ErrorCategory, number> = new Map();
  private errorsBySeverity: Map<ErrorSeverity, number> = new Map();
  private errorsByService: Map<string, number> = new Map();
  private recentErrors: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];
  private alertThresholds = {
    errorRate: 0.1, // 10% error rate
    criticalErrorCount: 5, // 5 critical errors in monitoring window
    errorSpike: 3, // 3x normal error rate
    monitoringWindowMs: 300000 // 5 minutes
  };

  constructor() {
    super();
    
    // Initialize category counters
    const categories: ErrorCategory[] = [
      'network', 'http', 'validation', 'database', 
      'external_service', 'system', 'business_logic', 
      'authentication', 'authorization'
    ];
    categories.forEach(category => this.errorsByCategory.set(category, 0));

    // Initialize severity counters
    const severities: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];
    severities.forEach(severity => this.errorsBySeverity.set(severity, 0));

    // Clean up old errors periodically
    setInterval(() => this.cleanupOldErrors(), 60000); // Every minute
  }

  recordError(error: Error, context: ErrorContext): void {
    const timestamp = new Date();
    
    // Store recent error
    this.recentErrors.push({ error, context, timestamp });
    
    // Update counters
    const service = context.service || 'unknown';
    this.errorCounts.set('total', (this.errorCounts.get('total') || 0) + 1);
    this.errorsByService.set(service, (this.errorsByService.get(service) || 0) + 1);

    // Update category counter if available
    if ('category' in error && error.category) {
      const currentCount = this.errorsByCategory.get(error.category as ErrorCategory) || 0;
      this.errorsByCategory.set(error.category as ErrorCategory, currentCount + 1);
    }

    // Update severity counter if available
    if ('severity' in error && error.severity) {
      const currentCount = this.errorsBySeverity.get(error.severity as ErrorSeverity) || 0;
      this.errorsBySeverity.set(error.severity as ErrorSeverity, currentCount + 1);
    }

    // Check for alerts
    this.checkForAlerts(error, context, timestamp);

    // Emit error event for external monitoring
    this.emit('error', { error, context, timestamp });
  }

  private checkForAlerts(error: Error, context: ErrorContext, timestamp: Date): void {
    // Check for critical errors
    if ('severity' in error && error.severity === 'critical') {
      const criticalErrorsInWindow = this.getErrorsInWindow('critical');
      if (criticalErrorsInWindow >= this.alertThresholds.criticalErrorCount) {
        this.emitAlert({
          type: 'critical_error',
          message: `${criticalErrorsInWindow} critical errors detected in the last ${this.alertThresholds.monitoringWindowMs / 60000} minutes`,
          severity: 'critical',
          context,
          metadata: { criticalErrorCount: criticalErrorsInWindow }
        });
      }
    }

    // Check error rate
    const recentErrorCount = this.getRecentErrorCount();
    const totalRequests = this.getTotalRequestCount(); // This would need to be implemented
    if (totalRequests > 0) {
      const errorRate = recentErrorCount / totalRequests;
      if (errorRate > this.alertThresholds.errorRate) {
        this.emitAlert({
          type: 'error_rate',
          message: `High error rate detected: ${(errorRate * 100).toFixed(2)}%`,
          severity: 'high',
          context,
          metadata: { errorRate, recentErrorCount, totalRequests }
        });
      }
    }

    // Check for error spikes
    const currentErrorRate = this.getCurrentErrorRate();
    const baselineErrorRate = this.getBaselineErrorRate();
    if (baselineErrorRate > 0 && currentErrorRate > baselineErrorRate * this.alertThresholds.errorSpike) {
      this.emitAlert({
        type: 'error_spike',
        message: `Error spike detected: ${currentErrorRate.toFixed(2)} errors/min (baseline: ${baselineErrorRate.toFixed(2)})`,
        severity: 'high',
        context,
        metadata: { currentErrorRate, baselineErrorRate, spikeMultiplier: currentErrorRate / baselineErrorRate }
      });
    }
  }

  private emitAlert(alertData: Omit<ErrorAlert, 'id' | 'timestamp'>): void {
    const alert: ErrorAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...alertData
    };

    logger.error('Error monitoring alert triggered', new Error(alert.message), {
      alert,
      type: alert.type,
      severity: alert.severity
    });

    this.emit('alert', alert);
  }

  private getErrorsInWindow(severity?: ErrorSeverity): number {
    const windowStart = new Date(Date.now() - this.alertThresholds.monitoringWindowMs);
    return this.recentErrors.filter(({ error, timestamp }) => {
      const matchesSeverity = !severity || ('severity' in error && error.severity === severity);
      const inWindow = timestamp >= windowStart;
      return matchesSeverity && inWindow;
    }).length;
  }

  private getRecentErrorCount(): number {
    const windowStart = new Date(Date.now() - this.alertThresholds.monitoringWindowMs);
    return this.recentErrors.filter(({ timestamp }) => timestamp >= windowStart).length;
  }

  private getCurrentErrorRate(): number {
    const windowStart = new Date(Date.now() - 60000); // Last minute
    const errorsInLastMinute = this.recentErrors.filter(({ timestamp }) => timestamp >= windowStart).length;
    return errorsInLastMinute;
  }

  private getBaselineErrorRate(): number {
    // Calculate baseline from errors 5-10 minutes ago
    const baselineEnd = new Date(Date.now() - 300000); // 5 minutes ago
    const baselineStart = new Date(Date.now() - 600000); // 10 minutes ago
    const baselineErrors = this.recentErrors.filter(({ timestamp }) => 
      timestamp >= baselineStart && timestamp <= baselineEnd
    ).length;
    return baselineErrors / 5; // Average per minute
  }

  private getTotalRequestCount(): number {
    // This would need to be implemented based on your request tracking
    // For now, return a placeholder
    return 100;
  }

  private cleanupOldErrors(): void {
    const cutoff = new Date(Date.now() - this.alertThresholds.monitoringWindowMs * 2);
    this.recentErrors = this.recentErrors.filter(({ timestamp }) => timestamp >= cutoff);
  }

  getMetrics(): ErrorMetrics {
    const windowStart = new Date(Date.now() - this.alertThresholds.monitoringWindowMs);
    const recentErrorCount = this.recentErrors.filter(({ timestamp }) => timestamp >= windowStart).length;
    const totalRequests = this.getTotalRequestCount();
    
    return {
      errorCount: this.errorCounts.get('total') || 0,
      errorRate: totalRequests > 0 ? recentErrorCount / totalRequests : 0,
      lastErrorTime: this.recentErrors.length > 0 ? 
        this.recentErrors[this.recentErrors.length - 1].timestamp : undefined,
      errorsByCategory: Object.fromEntries(this.errorsByCategory) as Record<ErrorCategory, number>,
      errorsBySeverity: Object.fromEntries(this.errorsBySeverity) as Record<ErrorSeverity, number>
    };
  }

  getServiceMetrics(service: string) {
    const serviceErrors = this.recentErrors.filter(({ context }) => context.service === service);
    const windowStart = new Date(Date.now() - this.alertThresholds.monitoringWindowMs);
    const recentServiceErrors = serviceErrors.filter(({ timestamp }) => timestamp >= windowStart);

    return {
      service,
      totalErrors: serviceErrors.length,
      recentErrors: recentServiceErrors.length,
      errorRate: recentServiceErrors.length / (this.alertThresholds.monitoringWindowMs / 60000), // errors per minute
      lastErrorTime: serviceErrors.length > 0 ? 
        serviceErrors[serviceErrors.length - 1].timestamp : undefined
    };
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    const isHealthy = metrics.errorRate < this.alertThresholds.errorRate;
    
    return {
      healthy: isHealthy,
      errorRate: metrics.errorRate,
      errorCount: metrics.errorCount,
      lastErrorTime: metrics.lastErrorTime,
      status: isHealthy ? 'healthy' : 'degraded'
    };
  }

  // Configuration methods
  setAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    logger.info('Error monitoring alert thresholds updated', { thresholds: this.alertThresholds });
  }

  getAlertThresholds() {
    return { ...this.alertThresholds };
  }
}