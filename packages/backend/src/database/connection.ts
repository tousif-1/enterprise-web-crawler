import { Pool, PoolConfig } from 'pg';
import { config } from '../config';

// Database connection pool configuration
const poolConfig: PoolConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.username,
  password: config.database.password,
  // Connection pool settings for high performance
  max: 20, // Maximum number of connections in the pool
  min: 5,  // Minimum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds if connection cannot be established
  maxUses: 7500, // Close connection after 7500 uses to prevent memory leaks
  allowExitOnIdle: true, // Allow the pool to close when all connections are idle
  // SSL configuration for production
  ssl: config.database.ssl ? {
    rejectUnauthorized: false
  } : false
};

// Create the connection pool
export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Handle pool connection events
pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('acquire', (client) => {
  console.log('Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('Client removed from pool');
});

// Database connection helper functions
export class DatabaseConnection {
  /**
   * Execute a query with parameters
   */
  static async query(text: string, params?: (string | number | boolean | Date | null | undefined)[]) {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error', { text, error });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  static async getClient() {
    return await pool.connect();
  }

  /**
   * Execute multiple queries in a transaction
   */
  static async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test database connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('Database connection successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  /**
   * Close all connections in the pool
   */
  static async close(): Promise<void> {
    await pool.end();
    console.log('Database connection pool closed');
  }

  /**
   * Get pool statistics
   */
  static getPoolStats() {
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing database connections...');
  await DatabaseConnection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database connections...');
  await DatabaseConnection.close();
  process.exit(0);
});