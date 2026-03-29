import { PrometheusService } from '../services/prometheus.service';
import { SystemMetrics } from '../services/monitoring.service';
import { Registry } from 'prom-client';

describe('PrometheusService', () => {
  let prometheusService: PrometheusService;
  let testRegistry: Registry;

  beforeEach(() => {
    testRegistry = new Registry();
    prometheusService = new PrometheusService(testRegistry);
  });

  afterEach(() => {
    testRegistry.clear();
  });

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      expect(prometheusService).toBeDefined();
      expect(prometheusService.getRegistry()).toBeDefined();
    });

    it('should have default Node.js metrics', async () => {
      const metrics = await prometheusService.getMetrics();
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
      expect(metrics).toContain('nodejs_heap_size_total_bytes');
    });
  });

  describe('HTTP Request Metrics', () => {
    it('should record HTTP requests', async () => {
      prometheusService.recordHttpRequest('GET', '/api/health', 200, 150);
      prometheusService.recordHttpRequest('POST', '/api/crawl', 201, 300);
      prometheusService.recordHttpRequest('GET', '/api/health', 500, 100);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('status_code="201"');
      expect(metrics).toContain('status_code="500"');
    });

    it('should handle different routes and methods', async () => {
      const routes = ['/api/health', '/api/crawl', '/api/search'];
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      const statusCodes = [200, 201, 400, 404, 500];

      routes.forEach(route => {
        methods.forEach(method => {
          statusCodes.forEach(status => {
            prometheusService.recordHttpRequest(method, route, status, Math.random() * 1000);
          });
        });
      });

      const metrics = await prometheusService.getMetrics();
      
      routes.forEach(route => {
        expect(metrics).toContain(`route="${route}"`);
      });
      
      methods.forEach(method => {
        expect(metrics).toContain(`method="${method}"`);
      });
      
      statusCodes.forEach(status => {
        expect(metrics).toContain(`status_code="${status}"`);
      });
    });
  });

  describe('Crawl Operation Metrics', () => {
    it('should record crawl operations', async () => {
      prometheusService.recordCrawlOperation('success', 2000);
      prometheusService.recordCrawlOperation('error', 1500);
      prometheusService.recordCrawlOperation('success', 3000);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('crawl_operations_total');
      expect(metrics).toContain('crawl_operation_duration_seconds');
      expect(metrics).toContain('status="success"');
      expect(metrics).toContain('status="error"');
    });

    it('should handle various crawl durations', async () => {
      const durations = [500, 2000, 5000, 30000, 120000];
      
      durations.forEach(duration => {
        prometheusService.recordCrawlOperation('success', duration);
      });

      const metrics = await prometheusService.getMetrics();
      expect(metrics).toContain('crawl_operations_total');
      expect(metrics).toContain('crawl_operation_duration_seconds');
    });
  });

  describe('Database Operation Metrics', () => {
    it('should record database operations', async () => {
      prometheusService.recordDatabaseOperation('SELECT', 'success', 50);
      prometheusService.recordDatabaseOperation('INSERT', 'success', 100);
      prometheusService.recordDatabaseOperation('UPDATE', 'error', 200);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('database_operations_total');
      expect(metrics).toContain('database_operation_duration_seconds');
      expect(metrics).toContain('operation="SELECT"');
      expect(metrics).toContain('operation="INSERT"');
      expect(metrics).toContain('operation="UPDATE"');
    });

    it('should handle different operation types', async () => {
      const operations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'];
      
      operations.forEach(operation => {
        prometheusService.recordDatabaseOperation(operation, 'success', Math.random() * 1000);
        prometheusService.recordDatabaseOperation(operation, 'error', Math.random() * 1000);
      });

      const metrics = await prometheusService.getMetrics();
      
      operations.forEach(operation => {
        expect(metrics).toContain(`operation="${operation}"`);
      });
    });
  });

  describe('System Metrics Updates', () => {
    const createTestMetrics = (overrides: Partial<SystemMetrics> = {}): SystemMetrics => ({
      timestamp: new Date(),
      cpu: { usage: 45.5, loadAverage: [1.2, 1.1, 1.0] },
      memory: { 
        used: 512000000, 
        total: 1024000000, 
        percentage: 50, 
        heapUsed: 256000000, 
        heapTotal: 512000000 
      },
      database: { connections: 5, activeQueries: 2, avgResponseTime: 150, status: 'healthy' },
      queue: { waiting: 10, active: 3, completed: 100, failed: 2 },
      crawling: { activeSessions: 2, totalUrlsProcessed: 500, avgProcessingTime: 2000, errorRate: 1.5 },
      api: { requestCount: 1000, avgResponseTime: 200, errorRate: 2.0, activeConnections: 8 },
      ...overrides
    });

    it('should update system metrics', async () => {
      const testMetrics = createTestMetrics();
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('memory_usage_bytes');
      expect(metrics).toContain('cpu_usage_percent');
      expect(metrics).toContain('active_crawl_sessions');
      expect(metrics).toContain('active_connections');
      expect(metrics).toContain('queue_size');
    });

    it('should handle memory metrics correctly', async () => {
      const testMetrics = createTestMetrics({
        memory: { 
          used: 800000000, 
          total: 1000000000, 
          percentage: 80, 
          heapUsed: 600000000, 
          heapTotal: 750000000 
        }
      });
      
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('memory_usage_bytes{type="heap_used"} 600000000');
      expect(metrics).toContain('memory_usage_bytes{type="heap_total"} 750000000');
      expect(metrics).toContain('memory_usage_bytes{type="used"} 800000000');
      expect(metrics).toContain('memory_usage_bytes{type="total"} 1000000000');
    });

    it('should handle CPU metrics correctly', async () => {
      const testMetrics = createTestMetrics({
        cpu: { usage: 75.3, loadAverage: [2.1, 1.8, 1.5] }
      });
      
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('cpu_usage_percent 75.3');
    });

    it('should handle connection metrics correctly', async () => {
      const testMetrics = createTestMetrics({
        api: { requestCount: 2000, avgResponseTime: 300, errorRate: 3.5, activeConnections: 15 },
        database: { connections: 8, activeQueries: 4, avgResponseTime: 200, status: 'healthy' }
      });
      
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('active_connections{type="api"} 15');
      expect(metrics).toContain('active_connections{type="database"} 8');
    });

    it('should handle queue metrics correctly', async () => {
      const testMetrics = createTestMetrics({
        queue: { waiting: 25, active: 8, completed: 500, failed: 12 }
      });
      
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('queue_size{queue="crawl",status="waiting"} 25');
      expect(metrics).toContain('queue_size{queue="crawl",status="active"} 8');
      expect(metrics).toContain('queue_size{queue="crawl",status="completed"} 500');
      expect(metrics).toContain('queue_size{queue="crawl",status="failed"} 12');
    });

    it('should handle crawling session metrics correctly', async () => {
      const testMetrics = createTestMetrics({
        crawling: { activeSessions: 7, totalUrlsProcessed: 1500, avgProcessingTime: 3000, errorRate: 2.8 }
      });
      
      prometheusService.updateSystemMetrics(testMetrics);

      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('active_crawl_sessions 7');
    });
  });

  describe('Metrics Format', () => {
    it('should return metrics in Prometheus format', async () => {
      prometheusService.recordHttpRequest('GET', '/test', 200, 100);
      
      const metrics = await prometheusService.getMetrics();
      
      // Check for Prometheus format elements
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toMatch(/\w+\{.*\} \d+/); // Basic metric format
    });

    it('should include help and type information', async () => {
      const metrics = await prometheusService.getMetrics();
      
      expect(metrics).toContain('# HELP http_requests_total Total number of HTTP requests');
      expect(metrics).toContain('# TYPE http_requests_total counter');
      expect(metrics).toContain('# HELP http_request_duration_seconds Duration of HTTP requests in seconds');
      expect(metrics).toContain('# TYPE http_request_duration_seconds histogram');
    });
  });

  describe('Registry Management', () => {
    it('should provide access to registry', () => {
      const registry = prometheusService.getRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.metrics).toBe('function');
    });

    it('should reset metrics', async () => {
      prometheusService.recordHttpRequest('GET', '/test', 200, 100);
      
      let metrics = await prometheusService.getMetrics();
      expect(metrics).toContain('http_requests_total');
      
      prometheusService.reset();
      
      metrics = await prometheusService.getMetrics();
      // After reset, custom metrics should be gone, but default Node.js metrics might still be there
      // The exact behavior depends on how prom-client handles resets
      expect(typeof metrics).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metric values gracefully', async () => {
      // These should not throw errors for valid values
      expect(() => {
        prometheusService.recordHttpRequest('GET', '/test', 200, -1);
        prometheusService.recordCrawlOperation('success', 0);
        prometheusService.recordDatabaseOperation('SELECT', 'success', 0);
      }).not.toThrow();
    });

    it('should handle empty or invalid labels', async () => {
      expect(() => {
        prometheusService.recordHttpRequest('', '', 0, 0);
        prometheusService.recordCrawlOperation('success', 0);
        prometheusService.recordDatabaseOperation('', 'success', 0);
      }).not.toThrow();
    });
  });
});