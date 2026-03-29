import { AlertingService } from '../services/alerting.service';
import { SystemMetrics } from '../services/monitoring.service';

// Mock fetch for webhook tests
global.fetch = jest.fn();

describe('AlertingService', () => {
  let alertingService: AlertingService;

  beforeEach(() => {
    alertingService = new AlertingService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default channels', () => {
      const channels = alertingService.getAllChannels();
      expect(channels.length).toBeGreaterThan(0);
      
      // Console channel should always be present
      const consoleChannel = channels.find(c => c.name === 'console');
      expect(consoleChannel).toBeDefined();
      expect(consoleChannel?.type).toBe('console');
      expect(consoleChannel?.enabled).toBe(true);
    });

    it('should initialize with default rules', () => {
      const rules = alertingService.getAllRules();
      expect(rules.length).toBeGreaterThan(0);
      
      // Check for some expected default rules
      const memoryRule = rules.find(r => r.id === 'high-memory-usage');
      expect(memoryRule).toBeDefined();
      expect(memoryRule?.enabled).toBe(true);
      expect(memoryRule?.severity).toBe('critical');
    });
  });

  describe('Channel Management', () => {
    it('should add custom channels', () => {
      const initialCount = alertingService.getAllChannels().length;
      
      alertingService.addChannel({
        name: 'test-webhook',
        type: 'webhook',
        config: {
          webhook: {
            url: 'https://example.com/webhook',
            headers: { 'Authorization': 'Bearer token' }
          }
        },
        enabled: true
      });

      const channels = alertingService.getAllChannels();
      expect(channels).toHaveLength(initialCount + 1);
      
      const testChannel = alertingService.getChannel('test-webhook');
      expect(testChannel).toBeDefined();
      expect(testChannel?.type).toBe('webhook');
    });

    it('should remove channels', () => {
      alertingService.addChannel({
        name: 'temp-channel',
        type: 'console',
        config: {},
        enabled: true
      });

      const removed = alertingService.removeChannel('temp-channel');
      expect(removed).toBe(true);
      
      const channel = alertingService.getChannel('temp-channel');
      expect(channel).toBeUndefined();
    });

    it('should return false when removing non-existent channel', () => {
      const removed = alertingService.removeChannel('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Rule Management', () => {
    it('should add custom rules', () => {
      const initialCount = alertingService.getAllRules().length;
      
      alertingService.addRule({
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test alerting rule',
        enabled: true,
        conditions: [
          {
            metric: 'test.metric',
            operator: 'gt',
            value: 50
          }
        ],
        channels: ['console'],
        cooldown: 5,
        severity: 'warning'
      });

      const rules = alertingService.getAllRules();
      expect(rules).toHaveLength(initialCount + 1);
      
      const testRule = alertingService.getRule('test-rule');
      expect(testRule).toBeDefined();
      expect(testRule?.name).toBe('Test Rule');
    });

    it('should remove rules', () => {
      alertingService.addRule({
        id: 'temp-rule',
        name: 'Temporary Rule',
        description: 'A temporary rule',
        enabled: true,
        conditions: [],
        channels: ['console'],
        cooldown: 5,
        severity: 'warning'
      });

      const removed = alertingService.removeRule('temp-rule');
      expect(removed).toBe(true);
      
      const rule = alertingService.getRule('temp-rule');
      expect(rule).toBeUndefined();
    });

    it('should enable and disable rules', () => {
      const rules = alertingService.getAllRules();
      if (rules.length > 0) {
        const ruleId = rules[0].id;
        
        const disabled = alertingService.disableRule(ruleId);
        expect(disabled).toBe(true);
        
        const rule = alertingService.getRule(ruleId);
        expect(rule?.enabled).toBe(false);
        
        const enabled = alertingService.enableRule(ruleId);
        expect(enabled).toBe(true);
        
        const enabledRule = alertingService.getRule(ruleId);
        expect(enabledRule?.enabled).toBe(true);
      }
    });

    it('should return false when enabling/disabling non-existent rules', () => {
      const enabled = alertingService.enableRule('non-existent');
      expect(enabled).toBe(false);
      
      const disabled = alertingService.disableRule('non-existent');
      expect(disabled).toBe(false);
    });
  });

  const createTestMetrics = (overrides: Partial<SystemMetrics> = {}): SystemMetrics => ({
    timestamp: new Date(),
    cpu: { usage: 50, loadAverage: [1, 1, 1] },
    memory: { used: 500000000, total: 1000000000, percentage: 50, heapUsed: 450000000, heapTotal: 1000000000 },
    database: { connections: 1, activeQueries: 0, avgResponseTime: 100, status: 'healthy' },
    queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
    crawling: { activeSessions: 0, totalUrlsProcessed: 0, avgProcessingTime: 0, errorRate: 0 },
    api: { requestCount: 0, avgResponseTime: 0, errorRate: 0, activeConnections: 0 },
    ...overrides
  });

  describe('Metrics Evaluation', () => {


    it('should evaluate metrics without errors', () => {
      const metrics = createTestMetrics();
      
      expect(() => {
        alertingService.evaluateMetrics(metrics);
      }).not.toThrow();
    });

    it('should handle high memory usage metrics', () => {
      const highMemoryMetrics = createTestMetrics({
        memory: { used: 950000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 }
      });

      // This should not throw, even if it triggers alerts
      expect(() => {
        alertingService.evaluateMetrics(highMemoryMetrics);
      }).not.toThrow();
    });

    it('should handle high CPU usage metrics', () => {
      const highCpuMetrics = createTestMetrics({
        cpu: { usage: 90, loadAverage: [3, 3, 3] }
      });

      expect(() => {
        alertingService.evaluateMetrics(highCpuMetrics);
      }).not.toThrow();
    });

    it('should handle high API error rate metrics', () => {
      const highErrorMetrics = createTestMetrics({
        api: { requestCount: 100, avgResponseTime: 200, errorRate: 15, activeConnections: 5 }
      });

      expect(() => {
        alertingService.evaluateMetrics(highErrorMetrics);
      }).not.toThrow();
    });

    it('should handle disabled rules', () => {
      const rules = alertingService.getAllRules();
      if (rules.length > 0) {
        const ruleId = rules[0].id;
        alertingService.disableRule(ruleId);
        
        const metrics = createTestMetrics({
          memory: { used: 950000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 }
        });

        // Should not throw even with disabled rules
        expect(() => {
          alertingService.evaluateMetrics(metrics);
        }).not.toThrow();
        
        // Re-enable for other tests
        alertingService.enableRule(ruleId);
      }
    });
  });

  describe('Notification Management', () => {
    it('should get notifications', () => {
      const notifications = alertingService.getNotifications();
      expect(Array.isArray(notifications)).toBe(true);
    });

    it('should get notifications with limit', () => {
      const notifications = alertingService.getNotifications(5);
      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeLessThanOrEqual(5);
    });

    it('should get failed notifications', () => {
      const failedNotifications = alertingService.getFailedNotifications();
      expect(Array.isArray(failedNotifications)).toBe(true);
    });

    it('should retry failed notifications', async () => {
      await expect(alertingService.retryFailedNotifications()).resolves.not.toThrow();
    });

    it('should clear old notifications', () => {
      const maxAge = 1000; // 1 second
      
      expect(() => {
        alertingService.clearOldNotifications(maxAge);
      }).not.toThrow();
    });
  });

  describe('Webhook Integration', () => {
    beforeEach(() => {
      // Mock successful fetch response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
    });

    it('should handle webhook channel configuration', () => {
      alertingService.addChannel({
        name: 'test-webhook',
        type: 'webhook',
        config: {
          webhook: {
            url: 'https://example.com/webhook',
            headers: { 'Content-Type': 'application/json' }
          }
        },
        enabled: true
      });

      const channel = alertingService.getChannel('test-webhook');
      expect(channel).toBeDefined();
      expect(channel?.config.webhook?.url).toBe('https://example.com/webhook');
    });
  });

  describe('Slack Integration', () => {
    beforeEach(() => {
      // Mock successful fetch response for Slack
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
    });

    it('should handle Slack channel configuration', () => {
      alertingService.addChannel({
        name: 'test-slack',
        type: 'slack',
        config: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/test',
            channel: '#alerts',
            username: 'Test Bot'
          }
        },
        enabled: true
      });

      const channel = alertingService.getChannel('test-slack');
      expect(channel).toBeDefined();
      expect(channel?.config.slack?.channel).toBe('#alerts');
    });
  });

  describe('Console Alerting', () => {
    it('should handle console alerts without errors', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const metrics = createTestMetrics({
        memory: { used: 950000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 }
      });

      // This might trigger console alerts
      alertingService.evaluateMetrics(metrics);
      
      // Restore console.log
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle webhook failures gracefully', async () => {
      // Mock failed fetch response
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      alertingService.addChannel({
        name: 'failing-webhook',
        type: 'webhook',
        config: {
          webhook: {
            url: 'https://example.com/failing-webhook'
          }
        },
        enabled: true
      });

      const metrics = createTestMetrics({
        memory: { used: 950000000, total: 1000000000, percentage: 95, heapUsed: 950000000, heapTotal: 1000000000 }
      });

      // Should not throw even if webhook fails
      expect(() => {
        alertingService.evaluateMetrics(metrics);
      }).not.toThrow();
    });

    it('should handle invalid metric paths gracefully', () => {
      alertingService.addRule({
        id: 'invalid-metric-rule',
        name: 'Invalid Metric Rule',
        description: 'Rule with invalid metric path',
        enabled: true,
        conditions: [
          {
            metric: 'invalid.metric.path',
            operator: 'gt',
            value: 50
          }
        ],
        channels: ['console'],
        cooldown: 5,
        severity: 'warning'
      });

      const metrics = createTestMetrics();

      // Should not throw even with invalid metric paths
      expect(() => {
        alertingService.evaluateMetrics(metrics);
      }).not.toThrow();
    });
  });
});