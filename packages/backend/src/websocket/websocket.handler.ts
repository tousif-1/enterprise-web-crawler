import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { JobManagerService } from '../services/job-manager.service';
import { JobSchedulerService } from '../services/job-scheduler.service';
import { config } from '../config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupWebSocket(io: SocketIOServer) {
  const crawlSessionRepo = new CrawlSessionRepository();
  const jobScheduler = new JobSchedulerService(config.jobScheduler);
  const jobManager = new JobManagerService(jobScheduler);

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    // Handle authentication (simplified for now)
    socket.on('authenticate', (data: { userId: string }) => {
      socket.userId = data.userId;
      socket.join(`user:${data.userId}`);
      logger.info(`User ${data.userId} authenticated on socket ${socket.id}`);
      
      socket.emit('authenticated', { success: true });
    });

    // Subscribe to crawl session updates
    socket.on('subscribe-session', async (data: { sessionId: string }) => {
      const { sessionId } = data;
      
      try {
        // Verify session exists and user has access
        const session = await crawlSessionRepo.findById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // For now, allow all authenticated users to subscribe
        // In production, you'd check if socket.userId has access to this session
        if (!socket.userId) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        socket.join(`session:${sessionId}`);
        logger.info(`Socket ${socket.id} subscribed to session ${sessionId}`);
        
        // Send current session status
        const sessionStatus = await jobManager.getSessionStatus(sessionId);
        socket.emit('session-progress', {
          sessionId,
          progress: {
            ...session.progress,
            jobs: sessionStatus.queueStats,
            resources: sessionStatus.resourceAllocation
          }
        });

      } catch (error) {
        logger.error('Error subscribing to session:', error);
        socket.emit('error', { message: 'Failed to subscribe to session' });
      }
    });

    // Unsubscribe from crawl session updates
    socket.on('unsubscribe-session', (data: { sessionId: string }) => {
      const { sessionId } = data;
      socket.leave(`session:${sessionId}`);
      logger.info(`Socket ${socket.id} unsubscribed from session ${sessionId}`);
    });

    // Handle real-time progress requests
    socket.on('get-session-progress', async (data: { sessionId: string }) => {
      const { sessionId } = data;
      
      try {
        const session = await crawlSessionRepo.findById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        const sessionStatus = await jobManager.getSessionStatus(sessionId);
        socket.emit('session-progress', {
          sessionId,
          progress: {
            ...session.progress,
            jobs: sessionStatus.queueStats,
            resources: sessionStatus.resourceAllocation
          }
        });

      } catch (error) {
        logger.error('Error getting session progress:', error);
        socket.emit('error', { message: 'Failed to get session progress' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error on ${socket.id}:`, error);
    });
  });

  // Utility functions for emitting updates from other parts of the application
  const emitToSession = (sessionId: string, event: string, data: any) => {
    io.to(`session:${sessionId}`).emit(event, data);
  };

  const emitToUser = (userId: string, event: string, data: any) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  const emitToAll = (event: string, data: any) => {
    io.emit(event, data);
  };

  // Attach utility functions to io instance for use in other modules
  (io as any).emitToSession = emitToSession;
  (io as any).emitToUser = emitToUser;
  (io as any).emitToAll = emitToAll;

  return io;
}