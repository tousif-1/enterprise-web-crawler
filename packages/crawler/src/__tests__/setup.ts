import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Increase timeout for crawler tests (they can be slow)
  jest.setTimeout(60000);
});

afterAll(async () => {
  // Clean up any global resources
  await cleanupTestResources();
});

// Helper function to clean up test resources
async function cleanupTestResources() {
  try {
    // Close any open browser instances
    if (global.testBrowser) {
      await global.testBrowser.close();
    }
    
    // Close database connections
    if (global.testDbPool) {
      await global.testDbPool.end();
    }
    
    // Close Redis connections
    if (global.testRedisClient) {
      await global.testRedisClient.quit();
    }
  } catch (error) {
    console.warn('Error cleaning up test resources:', error);
  }
}

// Mock Puppeteer for unit tests
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue({}),
      content: jest.fn().mockResolvedValue('<html><body>Test content</body></html>'),
      evaluate: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue({}),
      setUserAgent: jest.fn().mockResolvedValue({}),
      setViewport: jest.fn().mockResolvedValue({}),
    }),
    close: jest.fn().mockResolvedValue({}),
  }),
}));

// Mock Axe-core for unit tests
jest.mock('@axe-core/puppeteer', () => ({
  injectAxe: jest.fn().mockResolvedValue({}),
  getViolations: jest.fn().mockResolvedValue([]),
}));

// Global test utilities
declare global {
  var testBrowser: any;
  var testDbPool: any;
  var testRedisClient: any;
}

export {};