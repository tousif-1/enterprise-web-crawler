import { EventEmitter } from 'events';
import { DatabaseConnection } from '../database/connection';
import { config } from '../config';

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  database: {
    connections: number;
    activeQueries: number;
    avgResponseTime: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  crawling: {
    activeSessions: number;
    totalUrlsProcessed: number;
    avgProcessingTime: number;
    errorRate: number;
  };
  api: {
    requestCount: number;
    avgResponseTime: number;
    errorRate: number;
    activeConnections: number;
  };
}

export interface PerformanceThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: 'warning' | 'critical';
  description: string;
}

export interface Alert {
  id: string;
  type: 'threshold' | 'health' | 'error';
  severity: 'warning' | 'critical';
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

export class MonitoringService extends EventEmitter {
  private metrics: SystemMetrics[] = [];
  private alerts: Alert[] = [];
  private thresholds: PerformanceThreshold[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private readonly maxMetricsHistory = 1000;
  private readonly metricsCollectionInterval = 30000; // 30 seconds

  // API metrics tracking
  private apiMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    errorCount: 0,
    activeConnections: 0,
  };

  // Database metrics tracking
  private dbMetrics = {
    queryCount: 0,
    totalQueryTime: 0,
    activeQueries: 0,
  };

  // Crawling metrics tracking
  private crawlMetrics = {
    activeSessions: 0,
    totalUrlsProcessed: 0,
    totalProcessingTime: 0,
    errorCount: 0,
  };

  constructor() {
    super();
    this.initializeDefaultThresholds();
  }

  private initializeDefaultThresholds(): void {
    this.thresholds = [
      {
        metric: 'memory.percentage',
        operator: 'gt',
        value: 85,
        severity: 'warning',
        description: 'Memory usage above 85%'
      },
      {
        metric: 'memory.percentage',
        operator: 'gt',
        value: 95,
        severity: 'critical',
        description: 'Memory usage above 95%'
      },
      {
        metric: 'cpu.usage',
        operator: 'gt',
        value: 80,
        severity: 'warning',
        description: 'CPU usage above 80%'
      },
      {
        metric: 'cpu.usage',
        operator: 'gt',
        value: 95,
        severity: 'critical',
        description: 'CPU usage above 95%'
      },
      {
        metric: 'database.avgResponseTime',
        operator: 'gt',
        value: 1000,
        severity: 'warning',
        description: 'Database response time above 1 second'
      },
      {
        metric: 'database.avgResponseTime',
        operator: 'gt',
        value: 5000,
        severity: 'critical',
        description: 'Database response time above 5 seconds'
      },
      {
        metric: 'api.errorRate',
        operator: 'gt',
        value: 5,
        severity: 'warning',
        description: 'API error rate above 5%'
      },
      {
        metric: 'api.errorRate',
        operator: 'gt',
        value: 15,
        severity: 'critical',
        description: 'API error rate above 15%'
      },
      {
        metric: 'crawling.errorRate',
        operator: 'gt',
        value: 10,
        severity: 'warning',
        description: 'Crawling error rate above 10%'
      },
      {
        metric: 'crawling.errorRate',
        operator: 'gt',
        value: 25,
        severity: 'critical',
        description: 'Crawling error rate above 25%'
      }
    ];
  }

  public startMonitoring(): void {
    if (this.metricsInterval) {
      return;
    }

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.metricsCollectionInterval);

    console.log('Monitoring service started');
  }

  public stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    console.log('Monitoring service stopped');
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.gatherSystemMetrics();
      this.metrics.push(metrics);

      // Keep only the last N metrics
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics = this.metrics.slice(-this.maxMetricsHistory);
      }

      // Check thresholds and generate alerts
      this.checkThresholds(metrics);

      // Emit metrics event for real-time updates
      this.emit('metrics', metrics);
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  private async gatherSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Calculate CPU usage percentage (simplified)
    const cpuPercent = Math.min(100, (cpuUsage.user + cpuUsage.system) / 1000000 / 30); // Rough estimate

    // Database metrics
    const dbStatus = await this.getDatabaseStatus();
    
    return {
      timestamp: new Date(),
      cpu: {
        usage: cpuPercent,
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal
      },
      database: {
        connections: dbStatus.connections,
        activeQueries: this.dbMetrics.activeQueries,
        avgResponseTime: this.dbMetrics.queryCount > 0 
          ? this.dbMetrics.totalQueryTime / this.dbMetrics.queryCount 
          : 0,
        status: dbStatus.status
      },
      queue: await this.getQueueMetrics(),
      crawling: {
        activeSessions: this.crawlMetrics.activeSessions,
        totalUrlsProcessed: this.crawlMetrics.totalUrlsProcessed,
        avgProcessingTime: this.crawlMetrics.totalUrlsProcessed > 0
          ? this.crawlMetrics.totalProcessingTime / this.crawlMetrics.totalUrlsProcessed
          : 0,
        errorRate: this.crawlMetrics.totalUrlsProcessed > 0
          ? (this.crawlMetrics.errorCount / this.crawlMetrics.totalUrlsProcessed) * 100
          : 0
      },
      api: {
        requestCount: this.apiMetrics.requestCount,
        avgResponseTime: this.apiMetrics.requestCount > 0
          ? this.apiMetrics.totalResponseTime / this.apiMetrics.requestCount
          : 0,
        errorRate: this.apiMetrics.requestCount > 0
          ? (this.apiMetrics.errorCount / this.apiMetrics.requestCount) * 100
          : 0,
        activeConnections: this.apiMetrics.activeConnections
      }
    };
  }

  private async getDatabaseStatus(): Promise<{ connections: number; status: 'healthy' | 'degraded' | 'unhealthy' }> {
    try {
      const start = Date.now();
      await DatabaseConnection.query('SELECT 1');
      const responseTime = Date.now() - start;

      return {
        connections: 1, // Simplified - would need actual connection pool metrics
        status: responseTime < 1000 ? 'healthy' : responseTime < 5000 ? 'degraded' : 'unhealthy'
      };
    } catch (error) {
      return {
        connections: 0,
        status: 'unhealthy'
      };
    }
  }

  private async getQueueMetrics(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
    // This would integrate with the actual queue system (Bull/Redis)
    // For now, return mock data
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };
  }

  private checkThresholds(metrics: SystemMetrics): void {
    for (const threshold of this.thresholds) {
      const value = this.getMetricValue(metrics, threshold.metric);
      if (value !== undefined && this.evaluateThreshold(value, threshold)) {
        this.createAlert({
          type: 'threshold',
          severity: threshold.severity,
          message: `${threshold.description}: ${value}`,
          metric: threshold.metric,
          value,
          threshold: threshold.value
        });
      }
    }
  }

  private getMetricValue(metrics: SystemMetrics, metricPath: string): number | undefined {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return typeof value === 'number' ? value : undefined;
  }

  private evaluateThreshold(value: number, threshold: PerformanceThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return value > threshold.value;
      case 'gte': return value >= threshold.value;
      case 'lt': return value < threshold.value;
      case 'lte': return value <= threshold.value;
      case 'eq': return value === threshold.value;
      default: return false;
    }
  }

  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp'>): void {
    // Check if similar alert already exists and is not resolved
    const existingAlert = this.alerts.find(alert => 
      !alert.resolved && 
      alert.metric === alertData.metric && 
      alert.severity === alertData.severity
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...alertData
    };

    this.alerts.push(alert);
    this.emit('alert', alert);
    
    console.warn(`ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
  }

  // Public methods for tracking metrics
  public trackApiRequest(responseTime: number, isError: boolean = false): void {
    this.apiMetrics.requestCount++;
    this.apiMetrics.totalResponseTime += responseTime;
    if (isError) {
      this.apiMetrics.errorCount++;
    }
  }

  public trackDatabaseQuery(queryTime: number): void {
    this.dbMetrics.queryCount++;
    this.dbMetrics.totalQueryTime += queryTime;
  }

  public trackCrawlOperation(processingTime: number, isError: boolean = false): void {
    this.crawlMetrics.totalUrlsProcessed++;
    this.crawlMetrics.totalProcessingTime += processingTime;
    if (isError) {
      this.crawlMetrics.errorCount++;
    }
  }

  public updateActiveSessions(count: number): void {
    this.crawlMetrics.activeSessions = count;
  }

  public updateActiveConnections(count: number): void {
    this.apiMetrics.activeConnections = count;
  }

  public updateActiveQueries(count: number): void {
    this.dbMetrics.activeQueries = count;
  }

  // Getters for current state
  public getCurrentMetrics(): SystemMetrics | undefined {
    return this.metrics[this.metrics.length - 1];
  }

  public getMetricsHistory(limit?: number): SystemMetrics[] {
    if (limit) {
      return this.metrics.slice(-limit);
    }
    return [...this.metrics];
  }

  public getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  public getAllAlerts(): Alert[] {
    return [...this.alerts];
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  public addThreshold(threshold: PerformanceThreshold): void {
    this.thresholds.push(threshold);
  }

  public removeThreshold(metric: string, value: number): boolean {
    const index = this.thresholds.findIndex(t => t.metric === metric && t.value === value);
    if (index !== -1) {
      this.thresholds.splice(index, 1);
      return true;
    }
    return false;
  }

  public getThresholds(): PerformanceThreshold[] {
    return [...this.thresholds];
  }

  public getHealthStatus(): { healthy: boolean; issues: string[] } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical');
    
    return {
      healthy: criticalAlerts.length === 0,
      issues: activeAlerts.map(alert => alert.message)
    };
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();