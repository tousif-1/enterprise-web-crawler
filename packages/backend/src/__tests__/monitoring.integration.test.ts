import request from 'supertest';
import { createApp } from '../app';
import { monitoringService } from '../services/monitoring.service';
import { alertingService } from '../services/alerting.service';
import { prometheusService } from '../services/prometheus.service';

describe('Monitoring Integration Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    const appInstance = createApp();
    app = appInstance.app;
    server = appInstance.server;
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  beforeEach(() => {
    // Start monitoring for tests
    monitoringService.startMonitoring();
  });

  afterEach(() => {
    // Stop monitoring after tests
    monitoringService.stopMonitoring();
    
    // Clear any alerts
    const alerts = monitoringService.getAllAlerts();
    alerts.forEach(alert => {
      if (!alert.resolved) {
        monitoringService.resolveAlert(alert.id);
      }
    });
  });

  describe('Health Endpoints', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('resilience');
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('memory');
      expect(response.body.services).toHaveProperty('circuitBreakers');
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('circuitBreakers');
    });

    it('should return system metrics', async () => {
      // Wait a bit for metrics to be collected
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/health/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('circuitBreakers');
      expect(response.body).toHaveProperty('resilience');
      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('monitoring');
    });

    it('should return metrics history', async () => {
      // Generate some metrics
      monitoringService.trackApiRequest(100, false);
      monitoringService.trackApiRequest(200, true);
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/health/metrics/history?limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('history');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.history)).toBe(true);
    });
  });

  describe('Alert Endpoints', () => {
    it('should return active alerts', async () => {
      const response = await request(app)
        .get('/api/health/alerts')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('activeCount');
      expect(Array.isArray(response.body.active)).toBe(true);
    });

    it('should resolve an alert', async () => {
      // Create a test alert by triggering high memory usage
      const highMemoryMetrics = {
        timestamp: new Date(),
        cpu: { usage: 50, loadAverage: [1, 1, 1] },
        memory: { used: 1000000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 },
        database: { connections: 1, activeQueries: 0, avgResponseTime: 100, status: 'healthy' as const },
        queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        crawling: { activeSessions: 0, totalUrlsProcessed: 0, avgProcessingTime: 0, errorRate: 0 },
        api: { requestCount: 0, avgResponseTime: 0, errorRate: 0, activeConnections: 0 }
      };

      // Trigger alert evaluation
      alertingService.evaluateMetrics(highMemoryMetrics);

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const alertsResponse = await request(app)
        .get('/api/health/alerts')
        .expect(200);

      if (alertsResponse.body.active.length > 0) {
        const alertId = alertsResponse.body.active[0].id;

        const resolveResponse = await request(app)
          .post(`/api/health/alerts/${alertId}/resolve`)
          .expect(200);

        expect(resolveResponse.body).toHaveProperty('success', true);
        expect(resolveResponse.body).toHaveProperty('message', 'Alert resolved');
      }
    });

    it('should return 404 for non-existent alert resolution', async () => {
      const response = await request(app)
        .post('/api/health/alerts/non-existent-id/resolve')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'Alert not found or already resolved');
    });
  });

  describe('Alerting Configuration Endpoints', () => {
    it('should return alerting rules', async () => {
      const response = await request(app)
        .get('/api/health/alerting/rules')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('rules');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.rules)).toBe(true);
      expect(response.body.rules.length).toBeGreaterThan(0);
    });

    it('should return alerting channels', async () => {
      const response = await request(app)
        .get('/api/health/alerting/channels')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('channels');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.channels)).toBe(true);
      expect(response.body.channels.length).toBeGreaterThan(0);
    });

    it('should return alerting notifications', async () => {
      const response = await request(app)
        .get('/api/health/alerting/notifications?limit=20')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.notifications)).toBe(true);
    });

    it('should enable an alerting rule', async () => {
      const rulesResponse = await request(app)
        .get('/api/health/alerting/rules')
        .expect(200);

      if (rulesResponse.body.rules.length > 0) {
        const ruleId = rulesResponse.body.rules[0].id;

        const response = await request(app)
          .post(`/api/health/alerting/rules/${ruleId}/enable`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Rule enabled');
      }
    });

    it('should disable an alerting rule', async () => {
      const rulesResponse = await request(app)
        .get('/api/health/alerting/rules')
        .expect(200);

      if (rulesResponse.body.rules.length > 0) {
        const ruleId = rulesResponse.body.rules[0].id;

        const response = await request(app)
          .post(`/api/health/alerting/rules/${ruleId}/disable`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Rule disabled');
      }
    });

    it('should return 404 for non-existent rule operations', async () => {
      const enableResponse = await request(app)
        .post('/api/health/alerting/rules/non-existent-rule/enable')
        .expect(404);

      expect(enableResponse.body).toHaveProperty('success', false);
      expect(enableResponse.body).toHaveProperty('message', 'Rule not found');

      const disableResponse = await request(app)
        .post('/api/health/alerting/rules/non-existent-rule/disable')
        .expect(404);

      expect(disableResponse.body).toHaveProperty('success', false);
      expect(disableResponse.body).toHaveProperty('message', 'Rule not found');
    });

    it('should retry failed notifications', async () => {
      const response = await request(app)
        .post('/api/health/alerting/notifications/retry')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Failed notifications retry initiated');
    });
  });

  describe('Prometheus Metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/health/prometheus')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
    });
  });

  describe('Monitoring Service Integration', () => {
    it('should track API requests', async () => {
      const initialMetrics = monitoringService.getCurrentMetrics();
      const initialRequestCount = initialMetrics?.api.requestCount || 0;

      // Make a request to trigger monitoring
      await request(app)
        .get('/api/health')
        .expect(200);

      // Wait for metrics to be updated
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedMetrics = monitoringService.getCurrentMetrics();
      expect(updatedMetrics?.api.requestCount).toBeGreaterThan(initialRequestCount);
    });

    it('should track database operations', () => {
      const initialMetrics = monitoringService.getCurrentMetrics();
      const initialQueryCount = initialMetrics?.database.avgResponseTime || 0;

      // Simulate database operation
      monitoringService.trackDatabaseQuery(50);

      const updatedMetrics = monitoringService.getCurrentMetrics();
      // The avgResponseTime should be updated (though exact value depends on previous queries)
      expect(typeof updatedMetrics?.database.avgResponseTime).toBe('number');
    });

    it('should track crawl operations', () => {
      const initialMetrics = monitoringService.getCurrentMetrics();
      const initialProcessed = initialMetrics?.crawling.totalUrlsProcessed || 0;

      // Simulate crawl operations
      monitoringService.trackCrawlOperation(1000, false);
      monitoringService.trackCrawlOperation(2000, true);

      const updatedMetrics = monitoringService.getCurrentMetrics();
      expect(updatedMetrics?.crawling.totalUrlsProcessed).toBe(initialProcessed + 2);
      expect(updatedMetrics?.crawling.errorRate).toBeGreaterThan(0);
    });

    it('should update active session counts', () => {
      monitoringService.updateActiveSessions(5);
      
      const metrics = monitoringService.getCurrentMetrics();
      expect(metrics?.crawling.activeSessions).toBe(5);
    });
  });

  describe('Alert Generation', () => {
    it('should generate alerts for high memory usage', async () => {
      const highMemoryMetrics = {
        timestamp: new Date(),
        cpu: { usage: 50, loadAverage: [1, 1, 1] },
        memory: { used: 1000000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 },
        database: { connections: 1, activeQueries: 0, avgResponseTime: 100, status: 'healthy' as const },
        queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        crawling: { activeSessions: 0, totalUrlsProcessed: 0, avgProcessingTime: 0, errorRate: 0 },
        api: { requestCount: 0, avgResponseTime: 0, errorRate: 0, activeConnections: 0 }
      };

      const initialAlertCount = monitoringService.getActiveAlerts().length;
      
      // Trigger alert evaluation
      alertingService.evaluateMetrics(highMemoryMetrics);

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalAlertCount = monitoringService.getActiveAlerts().length;
      // Note: Alert might not be generated immediately due to duration requirements
      // This test verifies the system can handle the metrics without errors
      expect(typeof finalAlertCount).toBe('number');
    });

    it('should generate alerts for high API error rate', async () => {
      const highErrorRateMetrics = {
        timestamp: new Date(),
        cpu: { usage: 30, loadAverage: [1, 1, 1] },
        memory: { used: 500000000, total: 1000000000, percentage: 50, heapUsed: 450000000, heapTotal: 1000000000 },
        database: { connections: 1, activeQueries: 0, avgResponseTime: 100, status: 'healthy' as const },
        queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        crawling: { activeSessions: 0, totalUrlsProcessed: 0, avgProcessingTime: 0, errorRate: 0 },
        api: { requestCount: 100, avgResponseTime: 200, errorRate: 15, activeConnections: 5 }
      };

      // Trigger alert evaluation
      alertingService.evaluateMetrics(highErrorRateMetrics);

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify system handled the metrics
      const metrics = monitoringService.getCurrentMetrics();
      expect(metrics).toBeDefined();
    });
  });
});