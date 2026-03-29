import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8000'),
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'webcrawler',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000')
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100')
  },
  elasticsearch: {
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD ? {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    } : undefined,
    tls: {
      rejectUnauthorized: process.env.ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED !== 'false'
    },
    requestTimeout: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000'),
    pingTimeout: parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT || '3000'),
    maxRetries: parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3')
  },
  jobQueue: {
    concurrency: {
      crawl: parseInt(process.env.CRAWL_CONCURRENCY || '5'),
      analysis: parseInt(process.env.ANALYSIS_CONCURRENCY || '3'),
      validation: parseInt(process.env.VALIDATION_CONCURRENCY || '10')
    },
    retries: {
      maxRetries: parseInt(process.env.JOB_MAX_RETRIES || '3'),
      backoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '5000')
    },
    cleanup: {
      maxAge: parseInt(process.env.JOB_MAX_AGE || '86400000'), // 24 hours
      maxCount: parseInt(process.env.JOB_MAX_COUNT || '1000')
    }
  },
  jobScheduler: {
    concurrency: {
      crawl: parseInt(process.env.CRAWL_CONCURRENCY || '5'),
      analysis: parseInt(process.env.ANALYSIS_CONCURRENCY || '3'),
      validation: parseInt(process.env.VALIDATION_CONCURRENCY || '10')
    },
    retries: {
      maxRetries: parseInt(process.env.JOB_MAX_RETRIES || '3'),
      backoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '5000')
    },
    cleanup: {
      maxAge: parseInt(process.env.JOB_MAX_AGE || '86400000'), // 24 hours
      maxCount: parseInt(process.env.JOB_MAX_COUNT || '1000')
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  },
  websocket: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  }
};