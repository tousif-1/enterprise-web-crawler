import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { errorHandler, notFoundHandler, requestIdMiddleware, timeoutMiddleware } from './middleware/error.middleware';
import { validationMiddleware } from './middleware/validation.middleware';
import { monitoringMiddleware } from './middleware/monitoring.middleware';
import { crawlSessionRoutes } from './routes/crawl-session.routes';
import { crawlResultRoutes } from './routes/crawl-result.routes';
import { healthRoutes } from './routes/health.routes';
import searchRoutes from './routes/search.routes';
import { reportRoutes } from './routes/report.routes';
import { setupWebSocket } from './websocket/websocket.handler';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  const server = createServer(app);
  
  // CORS configuration - more permissive for development
  const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://172.28.128.1:3000",
    "http://192.168.1.4:3000",
    "http://192.168.89.1:3000",
    "http://192.168.145.1:3000",
    "http://192.168.29.47:3000",
    "http://172.23.128.1:3000"
  ];
  
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  
  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Security middleware
  app.use(helmet());
  
  const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
  
  app.use(cors(corsOptions));

  // Logging middleware
  app.use(morgan(config.logging.format, {
    stream: {
      write: (message: string) => logger.info(message.trim())
    }
  }));

  // Request tracking and timeout middleware
  app.use(requestIdMiddleware);
  app.use(timeoutMiddleware(30000)); // 30 second timeout
  
  // Monitoring middleware
  app.use(monitoringMiddleware);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Add io instance to request for use in routes
  app.use((req, res, next) => {
    (req as any).io = io;
    next();
  });

  // API routes
  app.use('/api/health', healthRoutes);
  app.use('/api/crawl-sessions', crawlSessionRoutes);
  app.use('/api/crawl-results', crawlResultRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/reports', reportRoutes);

  // WebSocket setup
  setupWebSocket(io);

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, server, io };
}