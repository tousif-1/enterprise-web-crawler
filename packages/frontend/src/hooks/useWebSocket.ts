import { useEffect, useRef, useState } from 'react';
import { websocketService, WebSocketEvents } from '../services/websocket';

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const connect = async () => {
      try {
        await websocketService.connect();
        setIsConnected(true);
        setConnectionError(null);
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
        setIsConnected(false);
        
        // Retry connection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      websocketService.disconnect();
      setIsConnected(false);
    };
  }, []);

  const subscribe = <K extends keyof WebSocketEvents>(
    event: K,
    callback: WebSocketEvents[K]
  ) => {
    websocketService.on(event, callback);
    
    return () => {
      websocketService.off(event, callback);
    };
  };

  return {
    isConnected,
    connectionError,
    subscribe,
    subscribeToSession: websocketService.subscribeToSession.bind(websocketService),
    unsubscribeFromSession: websocketService.unsubscribeFromSession.bind(websocketService),
  };
}

export function useSessionWebSocket(sessionId: string | null) {
  const { isConnected, subscribe, subscribeToSession, unsubscribeFromSession } = useWebSocket();

  useEffect(() => {
    if (isConnected && sessionId) {
      subscribeToSession(sessionId);
      
      return () => {
        unsubscribeFromSession(sessionId);
      };
    }
  }, [isConnected, sessionId, subscribeToSession, unsubscribeFromSession]);

  return {
    isConnected,
    subscribe,
  };
}