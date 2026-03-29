// Database connection and utilities
export { DatabaseConnection, pool } from './connection';

// Migration system
export { DatabaseMigrator } from './migrator';

// Seeding system
export { DatabaseSeeder } from './seeder';

// Repositories
export * from './repositories';

// Import classes for the manager
import { DatabaseMigrator } from './migrator';
import { DatabaseSeeder } from './seeder';
import { DatabaseConnection } from './connection';

// Database initialization utility
export class DatabaseManager {
  private migrator: DatabaseMigrator;
  private seeder: DatabaseSeeder;

  constructor() {
    this.migrator = new DatabaseMigrator();
    this.seeder = new DatabaseSeeder();
  }

  /**
   * Initialize database with migrations and optional seeding
   */
  async initialize(seedData: boolean = false): Promise<void> {
    console.log('Initializing database...');
    
    try {
      // Test connection
      const isConnected = await DatabaseConnection.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to database');
      }

      // Run migrations
      await this.migrator.migrate();

      // Seed data if requested
      if (seedData) {
        await this.seeder.seed();
      }

      console.log('Database initialization completed successfully.');
      
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    poolStats: any;
    timestamp: Date;
  }> {
    try {
      const connected = await DatabaseConnection.testConnection();
      const poolStats = DatabaseConnection.getPoolStats();
      
      return {
        connected,
        poolStats,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        connected: false,
        poolStats: null,
        timestamp: new Date()
      };
    }
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    await DatabaseConnection.close();
  }
}