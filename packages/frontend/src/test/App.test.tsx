import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App';

// Mock the API service
vi.mock('../services/api', () => ({
  apiService: {
    getCrawlSessions: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue({ status: 'ok', timestamp: new Date().toISOString() }),
  },
}));

// Mock the WebSocket service
vi.mock('../services/websocket', () => ({
  websocketService: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    subscribeToSession: vi.fn(),
    unsubscribeFromSession: vi.fn(),
  },
}));

describe('App', () => {
  it('renders the main application', () => {
    render(<App />);
    
    // Check if the app bar is rendered
    expect(screen.getByText('Enterprise Web Crawler')).toBeInTheDocument();
    
    // Check if the main content area is rendered
    expect(screen.getByText('Web Crawler Dashboard')).toBeInTheDocument();
  });

  it('renders the navigation elements', () => {
    render(<App />);
    
    // Check for navigation icons
    expect(screen.getByRole('button', { name: /connected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });
});