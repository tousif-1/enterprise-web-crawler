import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { SystemMetrics } from './monitoring.service';

export class PrometheusService {
  private readonly registry: any;
  
  // Custom metrics - initialized in constructor
  private httpRequestsTotal!: Counter<string>;
  private httpRequestDuration!: Histogram<string>;
  private crawlOperationsTotal!: Counter<string>;
  private crawlOperationDuration!: Histogram<string>;
  private databaseOperationsTotal!: Counter<string>;
  private databaseOperationDuration!: Histogram<string>;
  private memoryUsageBytes!: Gauge<string>;
  private cpuUsagePercent!: Gauge<string>;
  private activeCrawlSessions!: Gauge<string>;
  private activeConnections!: Gauge<string>;
  private queueSize!: Gauge<string>;

  constructor(customRegistry?: any) {
    this.registry = customRegistry || register;
    
    // Initialize custom metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [this.registry]
    });

    this.crawlOperationsTotal = new Counter({
      name: 'crawl_operations_total',
      help: 'Total number of crawl operations',
      labelNames: ['status'],
      registers: [this.registry]
    });

    this.crawlOperationDuration = new Histogram({
      name: 'crawl_operation_duration_seconds',
      help: 'Duration of crawl operations in seconds',
      labelNames: ['status'],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry]
    });

    this.databaseOperationsTotal = new Counter({
      name: 'database_operations_total',
      help: 'Total number of database operations',
      labelNames: ['operation', 'status'],
      registers: [this.registry]
    });

    this.databaseOperationDuration = new Histogram({
      name: 'database_operation_duration_seconds',
      help: 'Duration of database operations in seconds',
      labelNames: ['operation', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry]
    });

    this.memoryUsageBytes = new Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.cpuUsagePercent = new Gauge({
      name: 'cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.registry]
    });

    this.activeCrawlSessions = new Gauge({
      name: 'active_crawl_sessions',
      help: 'Number of active crawl sessions',
      registers: [this.registry]
    });

    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Size of various queues',
      labelNames: ['queue', 'status'],
      registers: [this.registry]
    });
    
    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry });
  }

  public recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration / 1000);
  }

  public recordCrawlOperation(status: 'success' | 'error', duration: number): void {
    this.crawlOperationsTotal.inc({ status });
    this.crawlOperationDuration.observe({ status }, duration / 1000);
  }

  public recordDatabaseOperation(operation: string, status: 'success' | 'error', duration: number): void {
    this.databaseOperationsTotal.inc({ operation, status });
    this.databaseOperationDuration.observe({ operation, status }, duration / 1000);
  }

  public updateSystemMetrics(metrics: SystemMetrics): void {
    // Memory metrics
    this.memoryUsageBytes.set({ type: 'heap_used' }, metrics.memory.heapUsed);
    this.memoryUsageBytes.set({ type: 'heap_total' }, metrics.memory.heapTotal);
    this.memoryUsageBytes.set({ type: 'used' }, metrics.memory.used);
    this.memoryUsageBytes.set({ type: 'total' }, metrics.memory.total);

    // CPU metrics
    this.cpuUsagePercent.set(metrics.cpu.usage);

    // Crawling metrics
    this.activeCrawlSessions.set(metrics.crawling.activeSessions);

    // Connection metrics
    this.activeConnections.set({ type: 'api' }, metrics.api.activeConnections);
    this.activeConnections.set({ type: 'database' }, metrics.database.connections);

    // Queue metrics
    this.queueSize.set({ queue: 'crawl', status: 'waiting' }, metrics.queue.waiting);
    this.queueSize.set({ queue: 'crawl', status: 'active' }, metrics.queue.active);
    this.queueSize.set({ queue: 'crawl', status: 'completed' }, metrics.queue.completed);
    this.queueSize.set({ queue: 'crawl', status: 'failed' }, metrics.queue.failed);
  }

  public async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  public getRegistry() {
    return this.registry;
  }

  public reset(): void {
    this.registry.clear();
  }
}

// Singleton instance
export const prometheusService = new PrometheusService();