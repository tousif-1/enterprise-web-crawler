import { EventEmitter } from 'events';
import { Alert, SystemMetrics } from './monitoring.service';

export interface AlertChannel {
  name: string;
  type: 'console' | 'webhook' | 'email' | 'slack';
  config: AlertChannelConfig;
  enabled: boolean;
}

export interface AlertChannelConfig {
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
  email?: {
    to: string[];
    from: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
  };
  slack?: {
    webhookUrl: string;
    channel: string;
    username?: string;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: AlertCondition[];
  channels: string[]; // Channel names
  cooldown: number; // Minutes between alerts for same rule
  severity: 'warning' | 'critical';
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  duration?: number; // Minutes the condition must be true
}

export interface AlertNotification {
  id: string;
  ruleId: string;
  alert: Alert;
  channels: string[];
  timestamp: Date;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

export class AlertingService extends EventEmitter {
  private channels: Map<string, AlertChannel> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private notifications: AlertNotification[] = [];
  private ruleCooldowns: Map<string, Date> = new Map();
  private conditionHistory: Map<string, { timestamp: Date; value: number }[]> = new Map();

  constructor() {
    super();
    this.initializeDefaultChannels();
    this.initializeDefaultRules();
  }

  private initializeDefaultChannels(): void {
    // Console channel (always available)
    this.addChannel({
      name: 'console',
      type: 'console',
      config: {},
      enabled: true
    });

    // Add webhook channel if configured
    if (process.env.ALERT_WEBHOOK_URL) {
      this.addChannel({
        name: 'webhook',
        type: 'webhook',
        config: {
          webhook: {
            url: process.env.ALERT_WEBHOOK_URL,
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.ALERT_WEBHOOK_TOKEN && { 'Authorization': `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}` })
            }
          }
        },
        enabled: true
      });
    }

    // Add Slack channel if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      this.addChannel({
        name: 'slack',
        type: 'slack',
        config: {
          slack: {
            webhookUrl: process.env.SLACK_WEBHOOK_URL,
            channel: process.env.SLACK_CHANNEL || '#alerts',
            username: 'Web Crawler Monitor'
          }
        },
        enabled: true
      });
    }
  }

  private initializeDefaultRules(): void {
    this.addRule({
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      description: 'Alert when memory usage exceeds 90%',
      enabled: true,
      conditions: [
        {
          metric: 'memory.percentage',
          operator: 'gt',
          value: 90,
          duration: 2 // Must be true for 2 minutes
        }
      ],
      channels: ['console', 'webhook', 'slack'].filter(name => this.channels.has(name)),
      cooldown: 15, // 15 minutes between alerts
      severity: 'critical'
    });

    this.addRule({
      id: 'high-cpu-usage',
      name: 'High CPU Usage',
      description: 'Alert when CPU usage exceeds 85%',
      enabled: true,
      conditions: [
        {
          metric: 'cpu.usage',
          operator: 'gt',
          value: 85,
          duration: 3 // Must be true for 3 minutes
        }
      ],
      channels: ['console', 'webhook', 'slack'].filter(name => this.channels.has(name)),
      cooldown: 10,
      severity: 'warning'
    });

    this.addRule({
      id: 'database-slow-response',
      name: 'Database Slow Response',
      description: 'Alert when database response time exceeds 2 seconds',
      enabled: true,
      conditions: [
        {
          metric: 'database.avgResponseTime',
          operator: 'gt',
          value: 2000,
          duration: 1
        }
      ],
      channels: ['console', 'webhook', 'slack'].filter(name => this.channels.has(name)),
      cooldown: 5,
      severity: 'warning'
    });

    this.addRule({
      id: 'high-api-error-rate',
      name: 'High API Error Rate',
      description: 'Alert when API error rate exceeds 10%',
      enabled: true,
      conditions: [
        {
          metric: 'api.errorRate',
          operator: 'gt',
          value: 10,
          duration: 2
        }
      ],
      channels: ['console', 'webhook', 'slack'].filter(name => this.channels.has(name)),
      cooldown: 10,
      severity: 'critical'
    });

    this.addRule({
      id: 'crawling-high-error-rate',
      name: 'High Crawling Error Rate',
      description: 'Alert when crawling error rate exceeds 20%',
      enabled: true,
      conditions: [
        {
          metric: 'crawling.errorRate',
          operator: 'gt',
          value: 20,
          duration: 5
        }
      ],
      channels: ['console', 'webhook', 'slack'].filter(name => this.channels.has(name)),
      cooldown: 15,
      severity: 'critical'
    });
  }

  public addChannel(channel: AlertChannel): void {
    this.channels.set(channel.name, channel);
  }

  public removeChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  public getChannel(name: string): AlertChannel | undefined {
    return this.channels.get(name);
  }

  public getAllChannels(): AlertChannel[] {
    return Array.from(this.channels.values());
  }

  public addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  public removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  public getRule(id: string): AlertRule | undefined {
    return this.rules.get(id);
  }

  public getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  public enableRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  public disableRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  public evaluateMetrics(metrics: SystemMetrics): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check if rule is in cooldown
      const lastAlert = this.ruleCooldowns.get(rule.id);
      if (lastAlert) {
        const cooldownEnd = new Date(lastAlert.getTime() + rule.cooldown * 60 * 1000);
        if (new Date() < cooldownEnd) {
          continue;
        }
      }

      // Evaluate all conditions
      const conditionResults = rule.conditions.map(condition => 
        this.evaluateCondition(condition, metrics)
      );

      // All conditions must be true
      if (conditionResults.every(result => result)) {
        this.triggerAlert(rule, metrics);
      }
    }
  }

  private evaluateCondition(condition: AlertCondition, metrics: SystemMetrics): boolean {
    const value = this.getMetricValue(metrics, condition.metric);
    if (value === undefined) return false;

    // Store condition history for duration checking
    const historyKey = `${condition.metric}_${condition.operator}_${condition.value}`;
    let history = this.conditionHistory.get(historyKey) || [];
    
    // Add current value
    history.push({ timestamp: metrics.timestamp, value });
    
    // Keep only recent history (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    history = history.filter(entry => entry.timestamp > oneHourAgo);
    this.conditionHistory.set(historyKey, history);

    // Check if condition is met
    const conditionMet = this.evaluateThreshold(value, condition);
    
    // If no duration requirement, return immediate result
    if (!condition.duration) {
      return conditionMet;
    }

    // Check if condition has been true for the required duration
    const durationMs = condition.duration * 60 * 1000;
    const cutoffTime = new Date(metrics.timestamp.getTime() - durationMs);
    
    const recentHistory = history.filter(entry => entry.timestamp >= cutoffTime);
    
    // All recent values must meet the condition
    return recentHistory.length > 0 && 
           recentHistory.every(entry => this.evaluateThreshold(entry.value, condition));
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

  private evaluateThreshold(value: number, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.value;
      case 'gte': return value >= condition.value;
      case 'lt': return value < condition.value;
      case 'lte': return value <= condition.value;
      case 'eq': return value === condition.value;
      default: return false;
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: SystemMetrics): Promise<void> {
    // Create alert object
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'threshold',
      severity: rule.severity,
      message: `${rule.name}: ${rule.description}`,
      timestamp: new Date()
    };

    // Create notification
    const notification: AlertNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      alert,
      channels: rule.channels,
      timestamp: new Date(),
      status: 'pending',
      attempts: 0
    };

    this.notifications.push(notification);

    // Set cooldown
    this.ruleCooldowns.set(rule.id, new Date());

    // Send notifications
    await this.sendNotification(notification, metrics);

    // Emit event
    this.emit('alert', alert, rule);
  }

  private async sendNotification(notification: AlertNotification, metrics: SystemMetrics): Promise<void> {
    notification.attempts++;
    notification.lastAttempt = new Date();

    try {
      const promises = notification.channels.map(channelName => 
        this.sendToChannel(channelName, notification.alert, metrics)
      );

      await Promise.allSettled(promises);
      notification.status = 'sent';
    } catch (error) {
      notification.status = 'failed';
      notification.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to send notification:', error);
    }
  }

  private async sendToChannel(channelName: string, alert: Alert, metrics: SystemMetrics): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel || !channel.enabled) {
      return;
    }

    switch (channel.type) {
      case 'console':
        this.sendConsoleAlert(alert, metrics);
        break;
      case 'webhook':
        await this.sendWebhookAlert(channel, alert, metrics);
        break;
      case 'slack':
        await this.sendSlackAlert(channel, alert, metrics);
        break;
      default:
        console.warn(`Unknown channel type: ${channel.type}`);
    }
  }

  private sendConsoleAlert(alert: Alert, metrics: SystemMetrics): void {
    const timestamp = alert.timestamp.toISOString();
    const severity = alert.severity.toUpperCase();
    console.log(`\n🚨 ALERT [${severity}] - ${timestamp}`);
    console.log(`Message: ${alert.message}`);
    if (alert.metric && alert.value !== undefined) {
      console.log(`Metric: ${alert.metric} = ${alert.value}`);
    }
    console.log(`Current System Status:`);
    console.log(`  Memory: ${metrics.memory.percentage.toFixed(1)}%`);
    console.log(`  CPU: ${metrics.cpu.usage.toFixed(1)}%`);
    console.log(`  Database: ${metrics.database.status}`);
    console.log(`  API Error Rate: ${metrics.api.errorRate.toFixed(1)}%`);
    console.log('');
  }

  private async sendWebhookAlert(channel: AlertChannel, alert: Alert, metrics: SystemMetrics): Promise<void> {
    if (!channel.config.webhook?.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp.toISOString(),
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold
      },
      metrics: {
        memory: metrics.memory,
        cpu: metrics.cpu,
        database: metrics.database,
        api: metrics.api,
        crawling: metrics.crawling
      },
      system: {
        timestamp: metrics.timestamp.toISOString(),
        uptime: process.uptime()
      }
    };

    const response = await fetch(channel.config.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...channel.config.webhook.headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  private async sendSlackAlert(channel: AlertChannel, alert: Alert, metrics: SystemMetrics): Promise<void> {
    if (!channel.config.slack?.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const color = alert.severity === 'critical' ? 'danger' : 'warning';
    const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';

    const payload = {
      channel: channel.config.slack.channel,
      username: channel.config.slack.username || 'Web Crawler Monitor',
      attachments: [
        {
          color,
          title: `${emoji} ${alert.severity.toUpperCase()} Alert`,
          text: alert.message,
          fields: [
            {
              title: 'Timestamp',
              value: alert.timestamp.toISOString(),
              short: true
            },
            {
              title: 'Memory Usage',
              value: `${metrics.memory.percentage.toFixed(1)}%`,
              short: true
            },
            {
              title: 'CPU Usage',
              value: `${metrics.cpu.usage.toFixed(1)}%`,
              short: true
            },
            {
              title: 'Database Status',
              value: metrics.database.status,
              short: true
            },
            {
              title: 'API Error Rate',
              value: `${metrics.api.errorRate.toFixed(1)}%`,
              short: true
            },
            {
              title: 'Crawling Error Rate',
              value: `${metrics.crawling.errorRate.toFixed(1)}%`,
              short: true
            }
          ],
          footer: 'Web Crawler Monitoring System',
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }
      ]
    };

    const response = await fetch(channel.config.slack.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  public getNotifications(limit?: number): AlertNotification[] {
    const notifications = [...this.notifications].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    
    return limit ? notifications.slice(0, limit) : notifications;
  }

  public getFailedNotifications(): AlertNotification[] {
    return this.notifications.filter(n => n.status === 'failed');
  }

  public async retryFailedNotifications(): Promise<void> {
    const failedNotifications = this.getFailedNotifications();
    
    for (const notification of failedNotifications) {
      if (notification.attempts < 3) { // Max 3 attempts
        // We don't have the original metrics, so create a basic one
        const basicMetrics: SystemMetrics = {
          timestamp: new Date(),
          cpu: { usage: 0, loadAverage: [0, 0, 0] },
          memory: { used: 0, total: 0, percentage: 0, heapUsed: 0, heapTotal: 0 },
          database: { connections: 0, activeQueries: 0, avgResponseTime: 0, status: 'healthy' },
          queue: { waiting: 0, active: 0, completed: 0, failed: 0 },
          crawling: { activeSessions: 0, totalUrlsProcessed: 0, avgProcessingTime: 0, errorRate: 0 },
          api: { requestCount: 0, avgResponseTime: 0, errorRate: 0, activeConnections: 0 }
        };
        
        await this.sendNotification(notification, basicMetrics);
      }
    }
  }

  public clearOldNotifications(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    this.notifications = this.notifications.filter(n => n.timestamp > cutoff);
  }
}

// Singleton instance
export const alertingService = new AlertingService();