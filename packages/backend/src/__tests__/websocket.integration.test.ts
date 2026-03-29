import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Client from 'socket.io-client';
import { createApp } from '../app';
import { DatabaseConnection } from '../database/connection';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';

describe('WebSocket Integration Tests', () => {
  let server: any;
  let io: SocketIOServer;
  let clientSocket: any;
  let serverSocket: any;
  let db: DatabaseConnection;
  let crawlSessionRepo: CrawlSessionRepository;
  let port: number;

  beforeAll(async () => {
    // Create test app with WebSocket
    const appInstance = createApp();
    server = appInstance.server;
    io = appInstance.io;

    // Initialize database connection
    db = DatabaseConnection.getInstance();
    await db.connect();
    crawlSessionRepo = new CrawlSessionRepository();

    // Setup test database tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS crawl_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        config JSONB NOT NULL,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        progress JSONB NOT NULL DEFAULT '{"totalUrls": 0, "processedUrls": 0, "failedUrls": 0}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Start server on random port
    await new Promise<void>((resolve) => {
      server.listen(() => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS crawl_sessions CASCADE');
    await db.disconnect();
    server.close();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await db.query('DELETE FROM crawl_sessions');

    // Create client socket
    clientSocket = Client(`http://localhost:${port}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      io.on('connection', (socket) => {
        serverSocket = socket;
        resolve();
      });
      clientSocket.connect();
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Connection and Authentication', () => {
    it('should connect successfully', (done) => {
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should authenticate user', (done) => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      clientSocket.on('authenticated', (data: any) => {
        expect(data.success).toBe(true);
        done();
      });

      clientSocket.emit('authenticate', { userId });
    });

    it('should handle authentication errors', (done) => {
      clientSocket.on('error', (data: any) => {
        expect(data.message).toBeDefined();
        done();
      });

      // Try to subscribe without authentication
      clientSocket.emit('subscribe-session', { sessionId: 'test-session-id' });
    });
  });

  describe('Session Subscription', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    let testSession: any;

    beforeEach(async () => {
      // Authenticate client
      await new Promise<void>((resolve) => {
        clientSocket.on('authenticated', () => resolve());
        clientSocket.emit('authenticate', { userId });
      });

      // Create test session
      testSession = await crawlSessionRepo.create({
        name: 'Test Session',
        userId,
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        }
      });
    });

    it('should subscribe to session updates', (done) => {
      clientSocket.on('session-progress', (data: any) => {
        expect(data.sessionId).toBe(testSession.id);
        expect(data.progress).toBeDefined();
        expect(data.progress.totalUrls).toBeDefined();
        expect(data.progress.processedUrls).toBeDefined();
        expect(data.progress.failedUrls).toBeDefined();
        done();
      });

      clientSocket.emit('subscribe-session', { sessionId: testSession.id });
    });

    it('should handle subscription to non-existent session', (done) => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174999';
      
      clientSocket.on('error', (data: any) => {
        expect(data.message).toBe('Session not found');
        done();
      });

      clientSocket.emit('subscribe-session', { sessionId: nonExistentId });
    });

    it('should unsubscribe from session updates', (done) => {
      // First subscribe
      clientSocket.emit('subscribe-session', { sessionId: testSession.id });
      
      // Then unsubscribe
      clientSocket.emit('unsubscribe-session', { sessionId: testSession.id });
      
      // Verify unsubscription (this is more of a smoke test)
      setTimeout(() => {
        expect(clientSocket.connected).toBe(true);
        done();
      }, 100);
    });

    it('should get session progress on demand', (done) => {
      clientSocket.on('session-progress', (data: any) => {
        expect(data.sessionId).toBe(testSession.id);
        expect(data.progress).toBeDefined();
        done();
      });

      clientSocket.emit('get-session-progress', { sessionId: testSession.id });
    });
  });

  describe('Real-time Updates', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    let testSession: any;

    beforeEach(async () => {
      // Authenticate client
      await new Promise<void>((resolve) => {
        clientSocket.on('authenticated', () => resolve());
        clientSocket.emit('authenticate', { userId });
      });

      // Create test session
      testSession = await crawlSessionRepo.create({
        name: 'Test Session',
        userId,
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        }
      });

      // Subscribe to session
      await new Promise<void>((resolve) => {
        clientSocket.on('session-progress', () => resolve());
        clientSocket.emit('subscribe-session', { sessionId: testSession.id });
      });
    });

    it('should receive crawl session created events', (done) => {
      clientSocket.on('crawl-session-created', (data: any) => {
        expect(data.id).toBeDefined();
        expect(data.name).toBeDefined();
        expect(data.userId).toBe(userId);
        done();
      });

      // Simulate session creation from server side
      io.emit('crawl-session-created', {
        id: 'new-session-id',
        name: 'New Session',
        userId,
        status: 'pending'
      });
    });

    it('should receive crawl session updated events', (done) => {
      clientSocket.on('crawl-session-updated', (data: any) => {
        expect(data.id).toBe(testSession.id);
        expect(data.status).toBe('running');
        done();
      });

      // Simulate session update from server side
      io.emit('crawl-session-updated', {
        ...testSession,
        status: 'running'
      });
    });

    it('should receive crawl session started events', (done) => {
      clientSocket.on('crawl-session-started', (data: any) => {
        expect(data.id).toBe(testSession.id);
        expect(data.status).toBe('running');
        done();
      });

      // Simulate session start from server side
      io.emit('crawl-session-started', {
        ...testSession,
        status: 'running',
        startTime: new Date()
      });
    });

    it('should receive crawl session paused events', (done) => {
      clientSocket.on('crawl-session-paused', (data: any) => {
        expect(data.id).toBe(testSession.id);
        expect(data.status).toBe('paused');
        done();
      });

      // Simulate session pause from server side
      io.emit('crawl-session-paused', {
        ...testSession,
        status: 'paused'
      });
    });

    it('should receive crawl session resumed events', (done) => {
      clientSocket.on('crawl-session-resumed', (data: any) => {
        expect(data.id).toBe(testSession.id);
        expect(data.status).toBe('running');
        done();
      });

      // Simulate session resume from server side
      io.emit('crawl-session-resumed', {
        ...testSession,
        status: 'running'
      });
    });

    it('should receive crawl session deleted events', (done) => {
      clientSocket.on('crawl-session-deleted', (data: any) => {
        expect(data.id).toBe(testSession.id);
        done();
      });

      // Simulate session deletion from server side
      io.emit('crawl-session-deleted', { id: testSession.id });
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket errors gracefully', (done) => {
      clientSocket.on('error', (error: any) => {
        expect(error).toBeDefined();
        done();
      });

      // Trigger an error by emitting invalid data
      clientSocket.emit('invalid-event', { invalid: 'data' });
      
      // Manually trigger error for testing
      setTimeout(() => {
        serverSocket.emit('error', new Error('Test error'));
      }, 50);
    });

    it('should handle disconnect events', (done) => {
      clientSocket.on('disconnect', (reason: string) => {
        expect(reason).toBeDefined();
        done();
      });

      clientSocket.disconnect();
    });
  });

  describe('Utility Functions', () => {
    it('should have utility functions attached to io instance', () => {
      expect(typeof (io as any).emitToSession).toBe('function');
      expect(typeof (io as any).emitToUser).toBe('function');
      expect(typeof (io as any).emitToAll).toBe('function');
    });

    it('should emit to specific session', (done) => {
      const sessionId = 'test-session-id';
      
      // Join session room
      clientSocket.emit('authenticate', { userId: '123e4567-e89b-12d3-a456-426614174000' });
      
      setTimeout(() => {
        serverSocket.join(`session:${sessionId}`);
        
        clientSocket.on('test-event', (data: any) => {
          expect(data.message).toBe('Hello session');
          done();
        });

        // Use utility function to emit to session
        (io as any).emitToSession(sessionId, 'test-event', { message: 'Hello session' });
      }, 100);
    });

    it('should emit to specific user', (done) => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      clientSocket.on('authenticated', () => {
        clientSocket.on('test-user-event', (data: any) => {
          expect(data.message).toBe('Hello user');
          done();
        });

        // Use utility function to emit to user
        (io as any).emitToUser(userId, 'test-user-event', { message: 'Hello user' });
      });

      clientSocket.emit('authenticate', { userId });
    });

    it('should emit to all clients', (done) => {
      clientSocket.on('test-broadcast-event', (data: any) => {
        expect(data.message).toBe('Hello everyone');
        done();
      });

      // Use utility function to emit to all
      (io as any).emitToAll('test-broadcast-event', { message: 'Hello everyone' });
    });
  });
});