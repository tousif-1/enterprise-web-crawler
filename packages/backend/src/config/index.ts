import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '8000', 10),
    host: process.env.HOST || 'localhost',
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'webcrawler',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true'
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // Crawler configuration
  crawler: {
    maxConcurrency: parseInt(process.env.CRAWLER_MAX_CONCURRENCY || '10', 10),
    requestTimeout: parseInt(process.env.CRAWLER_REQUEST_TIMEOUT || '30000', 10),
    userAgent: process.env.CRAWLER_USER_AGENT || 'Enterprise-Web-Crawler/1.0'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  },

  // Job Scheduler configuration
  jobScheduler: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_JOB_DB || '1', 10) // Use different DB for jobs
    },
    concurrency: {
      crawl: parseInt(process.env.JOB_CRAWL_CONCURRENCY || '5', 10),
      analysis: parseInt(process.env.JOB_ANALYSIS_CONCURRENCY || '3', 10),
      validation: parseInt(process.env.JOB_VALIDATION_CONCURRENCY || '10', 10)
    },
    retries: {
      maxRetries: parseInt(process.env.JOB_MAX_RETRIES || '3', 10),
      backoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '2000', 10)
    },
    cleanup: {
      maxAge: parseInt(process.env.JOB_MAX_AGE || '86400000', 10), // 24 hours
      maxCount: parseInt(process.env.JOB_MAX_COUNT || '100', 10)
    }
  }
};