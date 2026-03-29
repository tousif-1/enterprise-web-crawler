import { Request, Response, NextFunction } from 'express';
import { monitoringService } from '../services/monitoring.service';

export interface MonitoringRequest extends Request {
  startTime?: number;
}

export const monitoringMiddleware = (req: MonitoringRequest, res: Response, next: NextFunction): void => {
  // Record request start time
  req.startTime = Date.now();

  // Track active connections
  const currentConnections = monitoringService.getCurrentMetrics()?.api.activeConnections || 0;
  monitoringService.updateActiveConnections(currentConnections + 1);

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const responseTime = Date.now() - (req.startTime || Date.now());
    const isError = res.statusCode >= 400;

    // Track the API request
    monitoringService.trackApiRequest(responseTime, isError);

    // Update active connections (decrement)
    const currentConnections = monitoringService.getCurrentMetrics()?.api.activeConnections || 1;
    monitoringService.updateActiveConnections(Math.max(0, currentConnections - 1));

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

export const databaseMonitoringWrapper = <T extends any[], R>(
  fn: (...args: T) => Promise<R>
) => {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    
    // Track active queries
    const currentQueries = monitoringService.getCurrentMetrics()?.database.activeQueries || 0;
    monitoringService.updateActiveQueries(currentQueries + 1);

    try {
      const result = await fn(...args);
      const queryTime = Date.now() - startTime;
      
      // Track successful query
      monitoringService.trackDatabaseQuery(queryTime);
      
      return result;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      
      // Track failed query (still record timing)
      monitoringService.trackDatabaseQuery(queryTime);
      
      throw error;
    } finally {
      // Update active queries (decrement)
      const currentQueries = monitoringService.getCurrentMetrics()?.database.activeQueries || 1;
      monitoringService.updateActiveQueries(Math.max(0, currentQueries - 1));
    }
  };
};

export const crawlMonitoringWrapper = <T extends any[], R>(
  fn: (...args: T) => Promise<R>
) => {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();

    try {
      const result = await fn(...args);
      const processingTime = Date.now() - startTime;
      
      // Track successful crawl operation
      monitoringService.trackCrawlOperation(processingTime, false);
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Track failed crawl operation
      monitoringService.trackCrawlOperation(processingTime, true);
      
      throw error;
    }
  };
};