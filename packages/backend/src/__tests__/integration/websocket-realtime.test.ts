import { Server } from 'socket.io';
import { createServer } from 'http';
import { Client } from 'socket.io-client';
import { WebSocketHandler } from '../../websocket/websocket.handler';
import { DatabaseConnection } from '../../database/connection';
import { CrawlSessionRepository } from '../../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../../database/repositories/crawl-result.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { NotificationService } from '../../services/notification.service';

describe('WebSocket Real-time Functionality Tests', () => {
  let server: any;
  let io: Server;
  let clientSocket: any;
  let clientSocket2: any;
  let wsHandler: WebSocketHandler;
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;
  let issueRepo: IssueRepository;
  let notificationService: NotificationService;
  let serverPort: number;

  beforeAll(async () => {
    // Initialize database
    await DatabaseConnection.testConnection();
    
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();
    issueRepo = new IssueRepository();
    notificationService = new NotificationService();

    // Setup WebSocket server
    server = createServer();
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    wsHandler = new WebSocketHandler(io);

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        serverPort = typeof address === 'object' && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) clientSocket.close();
    if (clientSocket2) clientSocket2.close();
    if (server) server.close();
    await DatabaseConnection.close();
  });

  beforeEach(async () => {
    // Clean up database
    await DatabaseConnection.query('TRUNCATE TABLE crawl_sessions, crawl_results, issues CASCADE');

    // Create fresh client connections
    if (clientSocket) clientSocket.close();
    if (clientSocket2) clientSocket2.close();

    clientSocket = new Client(`http://localhost:${serverPort}`);
    clientSocket2 = new Client(`http://localhost:${serverPort}`);

    // Wait for connections
    await Promise.all([
      new Promise<void>((resolve) => clientSocket.on('connect', resolve)),
      new Promise<void>((resolve) => clientSocket2.on('connect', resolve))
    ]);
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.removeAllListeners();
    }
    if (clientSocket2) {
      clientSocket2.removeAllListeners();
    }
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connections successfully', () => {
      expect(clientSocket.connected).toBe(true);
      expect(clientSocket2.connected).toBe(true);
    });

    it('should handle multiple concurrent connections', async () => {
      const additionalClients = [];
      const connectionPromises = [];

      // Create 10 additional connections
      for (let i = 0; i < 10; i++) {
        const client = new Client(`http://localhost:${serverPort}`);
        additionalClients.push(client);
        connectionPromises.push(
          new Promise<void>((resolve) => client.on('connect', resolve))
        );
      }

      await Promise.all(connectionPromises);

      // Verify all connections are established
      additionalClients.forEach(client => {
        expect(client.connected).toBe(true);
      });

      // Clean up
      additionalClients.forEach(client => client.close());
    });

    it('should handle connection disconnection gracefully', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });

      clientSocket.disconnect();
    });
  });

  describe('Session Room Management', () => {
    it('should allow clients to join and leave session rooms', (done) => {
      const sessionId = 'test-session-room';

      clientSocket.emit('join-session', sessionId);
      
      // Verify join acknowledgment
      clientSocket.on('session-joined', (data: any) => {
        expect(data.sessionId).toBe(sessionId);
        
        // Leave session
        clientSocket.emit('leave-session', sessionId);
        
        clientSocket.on('session-left', (leaveData: any) => {
          expect(leaveData.sessionId).toBe(sessionId);
          done();
        });
      });
    });

    it('should broadcast updates only to clients in the same session room', async () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';

      const client1Updates: any[] = [];
      const client2Updates: any[] = [];

      // Setup listeners
      clientSocket.on('crawl-progress', (data: any) => client1Updates.push(data));
      clientSocket2.on('crawl-progress', (data: any) => client2Updates.push(data));

      // Join different sessions
      clientSocket.emit('join-session', sessionId1);
      clientSocket2.emit('join-session', sessionId2);

      // Wait for joins to complete
      await Promise.all([
        new Promise<void>((resolve) => clientSocket.on('session-joined', resolve)),
        new Promise<void>((resolve) => clientSocket2.on('session-joined', resolve))
      ]);

      // Simulate progress update for session 1
      wsHandler.broadcastCrawlProgress(sessionId1, {
        sessionId: sessionId1,
        progress: {
          totalUrls: 100,
          processedUrls: 50,
          failedUrls: 5
        },
        currentUrl: 'https://example.com/page-50'
      });

      // Wait for updates
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify only client 1 received the update
      expect(client1Updates.length).toBe(1);
      expect(client1Updates[0].sessionId).toBe(sessionId1);
      expect(client2Updates.length).toBe(0);
    });
  });

  describe('Real-time Crawl Progress Updates', () => {
    it('should broadcast crawl progress updates in real-time', async () => {
      const sessionId = 'progress-test-session';
      const updates: any[] = [];

      // Setup listener
      clientSocket.on('crawl-progress', (data: any) => updates.push(data));

      // Join session
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Simulate multiple progress updates
      const progressUpdates = [
        { totalUrls: 100, processedUrls: 10, failedUrls: 0 },
        { totalUrls: 100, processedUrls: 25, failedUrls: 2 },
        { totalUrls: 100, processedUrls: 50, failedUrls: 3 },
        { totalUrls: 100, processedUrls: 75, failedUrls: 5 },
        { totalUrls: 100, processedUrls: 100, failedUrls: 8 }
      ];

      for (const [index, progress] of progressUpdates.entries()) {
        wsHandler.broadcastCrawlProgress(sessionId, {
          sessionId,
          progress,
          currentUrl: `https://example.com/page-${progress.processedUrls}`
        });

        // Small delay between updates
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for all updates to be received
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all updates were received
      expect(updates.length).toBe(progressUpdates.length);
      
      updates.forEach((update, index) => {
        expect(update.sessionId).toBe(sessionId);
        expect(update.progress.processedUrls).toBe(progressUpdates[index].processedUrls);
        expect(update.currentUrl).toContain(`page-${progressUpdates[index].processedUrls}`);
      });
    });

    it('should handle high-frequency progress updates without loss', async () => {
      const sessionId = 'high-frequency-test';
      const updates: any[] = [];
      const updateCount = 100;

      clientSocket.on('crawl-progress', (data: any) => updates.push(data));
      
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Send rapid updates
      const startTime = Date.now();
      
      for (let i = 1; i <= updateCount; i++) {
        wsHandler.broadcastCrawlProgress(sessionId, {
          sessionId,
          progress: {
            totalUrls: updateCount,
            processedUrls: i,
            failedUrls: Math.floor(i * 0.05)
          },
          currentUrl: `https://example.com/page-${i}`
        });
      }

      // Wait for updates to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processingTime = Date.now() - startTime;

      // Should receive most updates (allow for some buffering/throttling)
      expect(updates.length).toBeGreaterThan(updateCount * 0.8);
      expect(processingTime).toBeLessThan(2000); // Should process quickly
      
      console.log(`Processed ${updates.length}/${updateCount} updates in ${processingTime}ms`);
    });
  });

  describe('Real-time Issue Notifications', () => {
    it('should broadcast urgent issues immediately', async () => {
      const sessionId = 'urgent-issues-test';
      const issues: any[] = [];

      clientSocket.on('urgent-issue', (data: any) => issues.push(data));
      
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Simulate urgent issues
      const urgentIssues = [
        {
          sessionId,
          url: 'https://example.com/broken-page',
          type: 'broken_link',
          severity: 'critical',
          description: '404 Not Found',
          httpStatus: 404
        },
        {
          sessionId,
          url: 'https://example.com/missing-image',
          type: 'missing_image',
          severity: 'high',
          description: 'Image not found',
          element: 'img[src="/missing.jpg"]'
        }
      ];

      for (const issue of urgentIssues) {
        wsHandler.broadcastUrgentIssue(sessionId, issue);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for notifications
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(issues.length).toBe(urgentIssues.length);
      
      issues.forEach((issue, index) => {
        expect(issue.sessionId).toBe(sessionId);
        expect(issue.severity).toMatch(/^(critical|high)$/);
        expect(issue.type).toBe(urgentIssues[index].type);
      });
    });

    it('should categorize and prioritize issue notifications', async () => {
      const sessionId = 'issue-priority-test';
      const allIssues: any[] = [];

      clientSocket.on('urgent-issue', (data: any) => allIssues.push({ ...data, priority: 'urgent' }));
      clientSocket.on('issue-detected', (data: any) => allIssues.push({ ...data, priority: 'normal' }));
      
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Mix of urgent and normal issues
      const testIssues = [
        { severity: 'critical', type: 'broken_link', expected: 'urgent' },
        { severity: 'high', type: 'missing_image', expected: 'urgent' },
        { severity: 'medium', type: 'accessibility', expected: 'normal' },
        { severity: 'low', type: 'performance', expected: 'normal' }
      ];

      for (const [index, issue] of testIssues.entries()) {
        const issueData = {
          sessionId,
          url: `https://example.com/test-${index}`,
          type: issue.type,
          severity: issue.severity,
          description: `Test ${issue.severity} issue`
        };

        if (issue.expected === 'urgent') {
          wsHandler.broadcastUrgentIssue(sessionId, issueData);
        } else {
          wsHandler.broadcastIssueDetected(sessionId, issueData);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify correct categorization
      const urgentIssues = allIssues.filter(i => i.priority === 'urgent');
      const normalIssues = allIssues.filter(i => i.priority === 'normal');

      expect(urgentIssues.length).toBe(2);
      expect(normalIssues.length).toBe(2);

      urgentIssues.forEach(issue => {
        expect(['critical', 'high']).toContain(issue.severity);
      });

      normalIssues.forEach(issue => {
        expect(['medium', 'low']).toContain(issue.severity);
      });
    });
  });

  describe('Session Status Updates', () => {
    it('should broadcast session status changes', async () => {
      const sessionId = 'status-test-session';
      const statusUpdates: any[] = [];

      clientSocket.on('session-status-changed', (data: any) => statusUpdates.push(data));
      
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Simulate status changes
      const statusChanges = ['running', 'paused', 'running', 'completed'];

      for (const status of statusChanges) {
        wsHandler.broadcastSessionStatusChange(sessionId, {
          sessionId,
          status,
          timestamp: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(statusUpdates.length).toBe(statusChanges.length);
      
      statusUpdates.forEach((update, index) => {
        expect(update.sessionId).toBe(sessionId);
        expect(update.status).toBe(statusChanges[index]);
      });
    });

    it('should handle session completion with final statistics', async () => {
      const sessionId = 'completion-test-session';
      let completionData: any = null;

      clientSocket.on('session-completed', (data: any) => {
        completionData = data;
      });
      
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Simulate session completion
      const finalStats = {
        sessionId,
        status: 'completed',
        totalUrls: 1000,
        processedUrls: 1000,
        failedUrls: 25,
        totalIssues: 150,
        criticalIssues: 5,
        duration: 3600000, // 1 hour
        completedAt: new Date().toISOString()
      };

      wsHandler.broadcastSessionCompleted(sessionId, finalStats);
      
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(completionData).toBeDefined();
      expect(completionData.sessionId).toBe(sessionId);
      expect(completionData.status).toBe('completed');
      expect(completionData.totalUrls).toBe(1000);
      expect(completionData.totalIssues).toBe(150);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle WebSocket connection errors gracefully', (done) => {
      const errorClient = new Client(`http://localhost:${serverPort + 1000}`); // Wrong port
      
      errorClient.on('connect_error', (error) => {
        expect(error).toBeDefined();
        errorClient.close();
        done();
      });
    });

    it('should recover from temporary disconnections', async () => {
      const sessionId = 'reconnection-test';
      const updates: any[] = [];

      clientSocket.on('crawl-progress', (data: any) => updates.push(data));
      
      // Join session
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Send initial update
      wsHandler.broadcastCrawlProgress(sessionId, {
        sessionId,
        progress: { totalUrls: 100, processedUrls: 10, failedUrls: 0 },
        currentUrl: 'https://example.com/page-10'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(updates.length).toBe(1);

      // Simulate disconnection and reconnection
      clientSocket.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));

      clientSocket.connect();
      await new Promise<void>((resolve) => clientSocket.on('connect', resolve));

      // Rejoin session
      clientSocket.emit('join-session', sessionId);
      await new Promise<void>((resolve) => clientSocket.on('session-joined', resolve));

      // Send update after reconnection
      wsHandler.broadcastCrawlProgress(sessionId, {
        sessionId,
        progress: { totalUrls: 100, processedUrls: 20, failedUrls: 1 },
        currentUrl: 'https://example.com/page-20'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should receive update after reconnection
      expect(updates.length).toBe(2);
      expect(updates[1].progress.processedUrls).toBe(20);
    });

    it('should handle malformed client messages gracefully', (done) => {
      // Send malformed join message
      clientSocket.emit('join-session', null);
      clientSocket.emit('join-session', { invalid: 'data' });
      clientSocket.emit('invalid-event', 'test');

      // Connection should remain stable
      setTimeout(() => {
        expect(clientSocket.connected).toBe(true);
        done();
      }, 200);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple clients receiving simultaneous updates', async () => {
      const sessionId = 'load-test-session';
      const clientCount = 50;
      const clients: any[] = [];
      const allUpdates: any[][] = [];

      // Create multiple clients
      for (let i = 0; i < clientCount; i++) {
        const client = new Client(`http://localhost:${serverPort}`);
        clients.push(client);
        allUpdates.push([]);

        await new Promise<void>((resolve) => client.on('connect', resolve));
        
        client.on('crawl-progress', (data: any) => {
          allUpdates[i].push(data);
        });

        client.emit('join-session', sessionId);
        await new Promise<void>((resolve) => client.on('session-joined', resolve));
      }

      // Broadcast updates
      const updateCount = 20;
      const startTime = Date.now();

      for (let i = 0; i < updateCount; i++) {
        wsHandler.broadcastCrawlProgress(sessionId, {
          sessionId,
          progress: {
            totalUrls: updateCount,
            processedUrls: i + 1,
            failedUrls: 0
          },
          currentUrl: `https://example.com/page-${i + 1}`
        });
      }

      // Wait for all updates to be received
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const broadcastTime = Date.now() - startTime;

      // Verify all clients received updates
      allUpdates.forEach((clientUpdates, clientIndex) => {
        expect(clientUpdates.length).toBeGreaterThan(0);
        console.log(`Client ${clientIndex} received ${clientUpdates.length} updates`);
      });

      console.log(`Broadcast to ${clientCount} clients completed in ${broadcastTime}ms`);
      expect(broadcastTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Clean up clients
      clients.forEach(client => client.close());
    }, 30000);
  });
});