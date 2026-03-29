import { config } from 'dotenv';
import { Pool } from 'pg';
import Redis from 'redis';

// Load test environment variables
config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Increase timeout for integration tests
  jest.setTimeout(30000);
});

afterAll(async () => {
  // Clean up any global resources
  await cleanupTestResources();
});

// Helper function to clean up test resources
async function cleanupTestResources() {
  try {
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

// Mock external services for unit tests
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
  }));
});

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({ body: { _id: 'test-id' } }),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
    delete: jest.fn().mockResolvedValue({ body: { result: 'deleted' } }),
    indices: {
      create: jest.fn().mockResolvedValue({ body: { acknowledged: true } }),
      exists: jest.fn().mockResolvedValue({ body: true }),
    },
  })),
}));

// Global test utilities
declare global {
  var testDbPool: Pool;
  var testRedisClient: any;
}

export {};