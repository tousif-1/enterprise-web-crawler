import { CrawlerHealthService } from '../services/health.service';
import puppeteer from 'puppeteer';

// Mock puppeteer
jest.mock('puppeteer', () => ({
  default: {
    launch: jest.fn()
  }
}));

describe('CrawlerHealthService', () => {
  let healthService: CrawlerHealthService;
  let mockBrowser: any;

  beforeEach(() => {
    healthService = new CrawlerHealthService();
    
    // Create mock browser
    mockBrowser = {
      isConnected: jest.fn(() => true),
      close: jest.fn(),
      version: jest.fn(() => Promise.resolve('Chrome/91.0.4472.124')),
      on: jest.fn(),
      removeListener: jest.fn()
    };
  });

  afterEach(async () => {
    await healthService.cleanup();
    jest.clearAllMocks();
  });

  describe('Browser Management', () => {
    it('should register browsers', () => {
      expect(healthService.getActiveBrowserCount()).toBe(0);
      
      healthService.registerBrowser(mockBrowser);
      expect(healthService.getActiveBrowserCount()).toBe(1);
      
      healthService.registerBrowser(mockBrowser);
      expect(healthService.getActiveBrowserCount()).toBe(1); // Same browser, should not duplicate
    });

    it('should unregister browsers', () => {
      healthService.registerBrowser(mockBrowser);
      expect(healthService.getActiveBrowserCount()).toBe(1);
      
      healthService.unregisterBrowser(mockBrowser);
      expect(healthService.getActiveBrowserCount()).toBe(0);
    });

    it('should handle browser disconnection events', () => {
      let disconnectCallback: Function | undefined;
      
      mockBrowser.on = jest.fn((event: string, callback: Function) => {
        if (event === 'disconnected') {
          disconnectCallback = callback;
        }
      });
      
      healthService.registerBrowser(mockBrowser);
      expect(healthService.getActiveBrowserCount()).toBe(1);
      
      // Simulate browser disconnection
      if (disconnectCallback) {
        disconnectCallback();
      }
      
      expect(healthService.getActiveBrowserCount()).toBe(0);
    });

    it('should track multiple browsers', () => {
      const mockBrowser2 = { ...mockBrowser };
      const mockBrowser3 = { ...mockBrowser };
      
      healthService.registerBrowser(mockBrowser);
      healthService.registerBrowser(mockBrowser2);
      healthService.registerBrowser(mockBrowser3);
      
      expect(healthService.getActiveBrowserCount()).toBe(3);
    });
  });

  describe('Health Status', () => {
    beforeEach(() => {
      // Mock successful Puppeteer launch
      (puppeteer.launch as any).mockResolvedValue({
        version: () => Promise.resolve('Chrome/91.0.4472.124'),
        close: () => Promise.resolve(),
        isConnected: () => true
      });
    });

    it('should return healthy status with normal conditions', async () => {
      const status = await healthService.getHealthStatus();
      
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('checks');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('version');
      
      expect(status.checks).toHaveProperty('puppeteer');
      expect(status.checks).toHaveProperty('memory');
      expect(status.checks).toHaveProperty('activeBrowsers');
      
      expect(['healthy', 'degraded', 'unhealthy']).toContain(status.status);
    });

    it('should detect Puppeteer issues', async () => {
      // Mock Puppeteer failure
      (puppeteer.launch as any).mockRejectedValue(new Error('Puppeteer launch failed'));
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.puppeteer.status).toBe('error');
      expect(status.checks.puppeteer.error).toContain('Puppeteer launch failed');
      expect(status.status).toBe('unhealthy');
    });

    it('should detect high memory usage', async () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 1000000000,
        heapTotal: 1000000000,
        heapUsed: 950000000, // 95% usage
        external: 0,
        arrayBuffers: 0
      }));
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.memory.status).toBe('critical');
      expect(status.checks.memory.percentage).toBeGreaterThan(90);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should detect too many active browsers', async () => {
      // Register many browsers to exceed threshold
      for (let i = 0; i < 12; i++) {
        const browser = { ...mockBrowser, id: i };
        healthService.registerBrowser(browser);
      }
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.activeBrowsers.status).toBe('critical');
      expect(status.checks.activeBrowsers.count).toBeGreaterThan(10);
      expect(status.status).toBe('unhealthy');
    });

    it('should show warning status for moderate issues', async () => {
      // Mock moderate memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        rss: 1000000000,
        heapTotal: 1000000000,
        heapUsed: 750000000, // 75% usage
        external: 0,
        arrayBuffers: 0
      }));
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.memory.status).toBe('warning');
      expect(['healthy', 'degraded']).toContain(status.status);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Metrics', () => {
    it('should return current metrics', () => {
      healthService.registerBrowser(mockBrowser);
      
      const metrics = healthService.getMetrics();
      
      expect(metrics).toHaveProperty('activeBrowsers');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('uptime');
      
      expect(metrics.activeBrowsers).toBe(1);
      expect(typeof metrics.memoryUsage).toBe('object');
      expect(typeof metrics.uptime).toBe('number');
    });

    it('should track browser count changes', () => {
      let metrics = healthService.getMetrics();
      expect(metrics.activeBrowsers).toBe(0);
      
      healthService.registerBrowser(mockBrowser);
      metrics = healthService.getMetrics();
      expect(metrics.activeBrowsers).toBe(1);
      
      healthService.unregisterBrowser(mockBrowser);
      metrics = healthService.getMetrics();
      expect(metrics.activeBrowsers).toBe(0);
    });
  });

  describe('Cleanup', () => {
    it('should close all active browsers during cleanup', async () => {
      const mockBrowser1 = { ...mockBrowser, close: jest.fn() };
      const mockBrowser2 = { ...mockBrowser, close: jest.fn() };
      
      healthService.registerBrowser(mockBrowser1);
      healthService.registerBrowser(mockBrowser2);
      
      expect(healthService.getActiveBrowserCount()).toBe(2);
      
      await healthService.cleanup();
      
      expect(mockBrowser1.close).toHaveBeenCalled();
      expect(mockBrowser2.close).toHaveBeenCalled();
      expect(healthService.getActiveBrowserCount()).toBe(0);
    });

    it('should handle browser close errors gracefully', async () => {
      const mockBrowser1 = { 
        ...mockBrowser, 
        close: jest.fn().mockRejectedValue(new Error('Close failed'))
      };
      const mockBrowser2 = { 
        ...mockBrowser, 
        close: jest.fn().mockResolvedValue(undefined)
      };
      
      healthService.registerBrowser(mockBrowser1);
      healthService.registerBrowser(mockBrowser2);
      
      // Should not throw even if some browsers fail to close
      await expect(healthService.cleanup()).resolves.not.toThrow();
      
      expect(mockBrowser1.close).toHaveBeenCalled();
      expect(mockBrowser2.close).toHaveBeenCalled();
      expect(healthService.getActiveBrowserCount()).toBe(0);
    });

    it('should handle disconnected browsers during cleanup', async () => {
      const mockBrowser1 = { 
        ...mockBrowser, 
        isConnected: jest.fn(() => false),
        close: jest.fn()
      };
      const mockBrowser2 = { 
        ...mockBrowser, 
        isConnected: jest.fn(() => true),
        close: jest.fn()
      };
      
      healthService.registerBrowser(mockBrowser1);
      healthService.registerBrowser(mockBrowser2);
      
      await healthService.cleanup();
      
      // Should not try to close disconnected browsers
      expect(mockBrowser1.close).not.toHaveBeenCalled();
      expect(mockBrowser2.close).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Puppeteer launch timeout', async () => {
      // Mock Puppeteer timeout
      (puppeteer.launch as any).mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Launch timeout')), 100)
        )
      );
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.puppeteer.status).toBe('error');
      expect(status.checks.puppeteer.error).toContain('Launch timeout');
    });

    it('should handle browser version check failure', async () => {
      (puppeteer.launch as any).mockResolvedValue({
        version: () => Promise.reject(new Error('Version check failed')),
        close: () => Promise.resolve(),
        isConnected: () => true
      });
      
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.puppeteer.status).toBe('error');
    });

    it('should handle browser close failure during health check', async () => {
      (puppeteer.launch as any).mockResolvedValue({
        version: () => Promise.resolve('Chrome/91.0.4472.124'),
        close: () => Promise.reject(new Error('Close failed')),
        isConnected: () => true
      });
      
      // Should still complete health check even if browser close fails
      const status = await healthService.getHealthStatus();
      
      expect(status.checks.puppeteer.status).toBe('ok');
      expect(status.checks.puppeteer.version).toBe('Chrome/91.0.4472.124');
    });
  });

  describe('Memory Thresholds', () => {
    it('should correctly categorize memory usage levels', async () => {
      const testCases = [
        { heapUsed: 500000000, heapTotal: 1000000000, expected: 'ok' }, // 50%
        { heapUsed: 750000000, heapTotal: 1000000000, expected: 'warning' }, // 75%
        { heapUsed: 950000000, heapTotal: 1000000000, expected: 'critical' } // 95%
      ];
      
      const originalMemoryUsage = process.memoryUsage;
      
      for (const testCase of testCases) {
        process.memoryUsage = jest.fn(() => ({
          rss: testCase.heapTotal,
          heapTotal: testCase.heapTotal,
          heapUsed: testCase.heapUsed,
          external: 0,
          arrayBuffers: 0
        }));
        
        const status = await healthService.getHealthStatus();
        expect(status.checks.memory.status).toBe(testCase.expected);
      }
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Browser Count Thresholds', () => {
    it('should correctly categorize browser count levels', async () => {
      const testCases = [
        { count: 5, expected: 'ok' },
        { count: 9, expected: 'warning' }, // 80% of 10
        { count: 12, expected: 'critical' } // Above 10
      ];
      
      for (const testCase of testCases) {
        // Clear browsers
        await healthService.cleanup();
        
        // Add browsers
        for (let i = 0; i < testCase.count; i++) {
          const browser = { ...mockBrowser, id: i };
          healthService.registerBrowser(browser);
        }
        
        const status = await healthService.getHealthStatus();
        expect(status.checks.activeBrowsers.status).toBe(testCase.expected);
        expect(status.checks.activeBrowsers.count).toBe(testCase.count);
      }
    });
  });
});