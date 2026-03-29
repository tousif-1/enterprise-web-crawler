import { io, Socket } from 'socket.io-client';
import { CrawlSession, CrawlResult, Issue } from '@enterprise-web-crawler/shared';

const WEBSOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8000';

export interface WebSocketEvents {
  // Session events
  'session:created': (session: CrawlSession) => void;
  'session:updated': (session: CrawlSession) => void;
  'session:progress': (data: { sessionId: string; progress: CrawlSession['progress'] }) => void;
  'session:completed': (session: CrawlSession) => void;
  'session:failed': (data: { sessionId: string; error: string }) => void;

  // Result events
  'result:new': (result: CrawlResult) => void;
  'result:updated': (result: CrawlResult) => void;

  // Issue events
  'issue:urgent': (issue: Issue & { sessionId: string; url: string }) => void;
  'issue:new': (issue: Issue & { sessionId: string; url: string }) => void;

  // System events
  'system:status': (status: { healthy: boolean; message?: string }) => void;
  'error': (error: { message: string; code?: string }) => void;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(WEBSOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, try to reconnect
          this.handleReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.handleReconnect();
        reject(error);
      });

      // Set up error handling
      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(() => {
        this.connect().catch(console.error);
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Event subscription methods
  on<K extends keyof WebSocketEvents>(event: K, callback: WebSocketEvents[K]): void {
    if (!this.socket) {
      throw new Error('WebSocket not connected. Call connect() first.');
    }
    this.socket.on(event, callback);
  }

  off<K extends keyof WebSocketEvents>(event: K, callback?: WebSocketEvents[K]): void {
    if (!this.socket) return;
    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  // Session-specific subscriptions
  subscribeToSession(sessionId: string): void {
    if (!this.socket) {
      throw new Error('WebSocket not connected');
    }
    this.socket.emit('subscribe:session', sessionId);
  }

  unsubscribeFromSession(sessionId: string): void {
    if (!this.socket) return;
    this.socket.emit('unsubscribe:session', sessionId);
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected';
    return this.socket.connected ? 'connected' : 'disconnected';
  }
}

export const websocketService = new WebSocketService();
export default websocketService;