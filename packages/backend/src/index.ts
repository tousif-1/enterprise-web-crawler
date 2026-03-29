import { createApp } from './app';
import { config } from './config';
import { DatabaseConnection } from './database/connection';
import { logger } from './utils/logger';
import { monitoringService } from './services/monitoring.service';
import { alertingService } from './services/alerting.service';
import { prometheusService } from './services/prometheus.service';

async function startServer() {
  try {
    // Test database connection
    const isConnected = await DatabaseConnection.testConnection();
    if (!isConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connected successfully');

    // Create Express app with WebSocket support
    const { app, server, io } = createApp();

    // Start monitoring services
    monitoringService.startMonitoring();
    logger.info('Monitoring service started');

    // Set up alerting integration
    monitoringService.on('metrics', (metrics) => {
      alertingService.evaluateMetrics(metrics);
      prometheusService.updateSystemMetrics(metrics);
    });

    alertingService.on('alert', (alert, rule) => {
      logger.warn(`Alert triggered: ${alert.message} (Rule: ${rule?.name})`);
      
      // Emit alert to WebSocket clients
      io.emit('alert', {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp
      });
    });

    logger.info('Alerting service configured');

    // Start server
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
      logger.info(`Environment: ${config.server.env}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      // Stop monitoring services
      monitoringService.stopMonitoring();
      logger.info('Monitoring service stopped');
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await DatabaseConnection.close();
          logger.info('Database disconnected');
          
          io.close();
          logger.info('WebSocket server closed');
          
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();