import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { config } from '../config';
import { DatabaseConnection } from '../database/connection';
import { circuitBreakerManager } from '../services/circuit-breaker.service';
import { resilienceManager } from '../services/resilience.service';
import { ErrorMonitoringService } from '../services/error-monitoring.service';
import { monitoringService } from '../services/monitoring.service';
import { alertingService } from '../services/alerting.service';
import { prometheusService } from '../services/prometheus.service';

const router = Router();
const errorMonitoring = new ErrorMonitoringService();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const circuitBreakerStatus = circuitBreakerManager.getHealthStatus();
  const resilienceStatus = resilienceManager.getHealthStatus();
  const errorStatus = errorMonitoring.getHealthStatus();

  const overallHealthy = errorStatus.healthy && 
    Object.values(circuitBreakerStatus).every((status: any) => status.healthy);

  const health = {
    status: overallHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
    version: process.env.npm_package_version || '1.0.0',
    resilience: {
      circuitBreakers: circuitBreakerStatus,
      services: resilienceStatus,
      errorMonitoring: errorStatus
    }
  };

  res.json(health);
}));

router.get('/detailed', asyncHandler(async (_req: Request, res: Response) => {
  // Check database connection
  let dbStatus = 'ok';
  let dbLatency = 0;
  
  try {
    const start = Date.now();
    await DatabaseConnection.query('SELECT 1');
    dbLatency = Date.now() - start;
  } catch (error) {
    dbStatus = 'error';
  }

  const circuitBreakerStatus = circuitBreakerManager.getHealthStatus();
  const allCircuitBreakersHealthy = Object.values(circuitBreakerStatus)
    .every((status: any) => status.healthy);

  const health = {
    status: dbStatus === 'ok' && allCircuitBreakersHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      circuitBreakers: circuitBreakerStatus
    }
  };

  res.json(health);
}));

router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  // Add readiness checks here (database, external services, etc.)
  const circuitBreakerStatus = circuitBreakerManager.getHealthStatus();
  const allCircuitBreakersHealthy = Object.values(circuitBreakerStatus)
    .every((status: any) => status.healthy);

  let dbReady = true;
  try {
    await DatabaseConnection.query('SELECT 1');
  } catch (error) {
    dbReady = false;
  }

  const ready = dbReady && allCircuitBreakersHealthy;

  res.json({
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbReady,
      circuitBreakers: allCircuitBreakersHealthy
    }
  });
}));

router.get('/metrics', asyncHandler(async (_req: Request, res: Response) => {
  const currentMetrics = monitoringService.getCurrentMetrics();
  
  res.json({
    timestamp: new Date().toISOString(),
    system: currentMetrics || null,
    circuitBreakers: circuitBreakerManager.getAllMetrics(),
    resilience: resilienceManager.getAllMetrics(),
    errors: errorMonitoring.getMetrics(),
    monitoring: monitoringService.getHealthStatus()
  });
}));

// New monitoring endpoints
router.get('/metrics/history', asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const history = monitoringService.getMetricsHistory(limit);
  
  res.json({
    timestamp: new Date().toISOString(),
    history,
    count: history.length
  });
}));

router.get('/alerts', asyncHandler(async (_req: Request, res: Response) => {
  const activeAlerts = monitoringService.getActiveAlerts();
  const allAlerts = monitoringService.getAllAlerts();
  
  res.json({
    timestamp: new Date().toISOString(),
    active: activeAlerts,
    total: allAlerts.length,
    activeCount: activeAlerts.length
  });
}));

router.post('/alerts/:alertId/resolve', asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const resolved = monitoringService.resolveAlert(alertId);
  
  if (resolved) {
    res.json({ success: true, message: 'Alert resolved' });
  } else {
    res.status(404).json({ success: false, message: 'Alert not found or already resolved' });
  }
}));

router.get('/alerting/rules', asyncHandler(async (_req: Request, res: Response) => {
  const rules = alertingService.getAllRules();
  
  res.json({
    timestamp: new Date().toISOString(),
    rules,
    count: rules.length
  });
}));

router.get('/alerting/channels', asyncHandler(async (_req: Request, res: Response) => {
  const channels = alertingService.getAllChannels();
  
  res.json({
    timestamp: new Date().toISOString(),
    channels,
    count: channels.length
  });
}));

router.get('/alerting/notifications', asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const notifications = alertingService.getNotifications(limit);
  
  res.json({
    timestamp: new Date().toISOString(),
    notifications,
    count: notifications.length
  });
}));

router.post('/alerting/rules/:ruleId/enable', asyncHandler(async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const enabled = alertingService.enableRule(ruleId);
  
  if (enabled) {
    res.json({ success: true, message: 'Rule enabled' });
  } else {
    res.status(404).json({ success: false, message: 'Rule not found' });
  }
}));

router.post('/alerting/rules/:ruleId/disable', asyncHandler(async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const disabled = alertingService.disableRule(ruleId);
  
  if (disabled) {
    res.json({ success: true, message: 'Rule disabled' });
  } else {
    res.status(404).json({ success: false, message: 'Rule not found' });
  }
}));

router.post('/alerting/notifications/retry', asyncHandler(async (_req: Request, res: Response) => {
  await alertingService.retryFailedNotifications();
  res.json({ success: true, message: 'Failed notifications retry initiated' });
}));

// Prometheus metrics endpoint
router.get('/prometheus', asyncHandler(async (_req: Request, res: Response) => {
  const metrics = await prometheusService.getMetrics();
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
}));

export { router as healthRoutes };