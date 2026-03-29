import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from './connection';

interface Migration {
  id: string;
  filename: string;
  sql: string;
}

export class DatabaseMigrator {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  /**
   * Initialize migrations table
   */
  private async initializeMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await DatabaseConnection.query(createTableQuery);
  }

  /**
   * Get all migration files
   */
  private getMigrationFiles(): Migration[] {
    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const filePath = path.join(this.migrationsPath, filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      const id = filename.replace('.sql', '');
      
      return { id, filename, sql };
    });
  }

  /**
   * Get executed migrations from database
   */
  private async getExecutedMigrations(): Promise<string[]> {
    try {
      const result = await DatabaseConnection.query('SELECT id FROM migrations ORDER BY id');
      return result.rows.map(row => row.id);
    } catch (error) {
      // If migrations table doesn't exist, return empty array
      return [];
    }
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<void> {
    console.log(`Executing migration: ${migration.filename}`);
    
    await DatabaseConnection.transaction(async (client) => {
      // Execute the migration SQL
      await client.query(migration.sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (id, filename) VALUES ($1, $2)',
        [migration.id, migration.filename]
      );
    });
    
    console.log(`Migration completed: ${migration.filename}`);
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<void> {
    console.log('Starting database migration...');
    
    try {
      // Initialize migrations table
      await this.initializeMigrationsTable();
      
      // Get all migrations and executed migrations
      const allMigrations = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      // Find pending migrations
      const pendingMigrations = allMigrations.filter(
        migration => !executedMigrations.includes(migration.id)
      );
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations found.');
        return;
      }
      
      console.log(`Found ${pendingMigrations.length} pending migrations.`);
      
      // Execute pending migrations
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      console.log('All migrations completed successfully.');
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback the last migration (basic implementation)
   */
  async rollback(): Promise<void> {
    console.log('Rolling back last migration...');
    
    try {
      const result = await DatabaseConnection.query(
        'SELECT id, filename FROM migrations ORDER BY executed_at DESC LIMIT 1'
      );
      
      if (result.rows.length === 0) {
        console.log('No migrations to rollback.');
        return;
      }
      
      const lastMigration = result.rows[0];
      console.log(`Rolling back migration: ${lastMigration.filename}`);
      
      // Remove migration record
      await DatabaseConnection.query(
        'DELETE FROM migrations WHERE id = $1',
        [lastMigration.id]
      );
      
      console.log('Rollback completed. Note: Schema changes were not automatically reverted.');
      console.log('Manual schema cleanup may be required.');
      
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async status(): Promise<void> {
    try {
      await this.initializeMigrationsTable();
      
      const allMigrations = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      console.log('\nMigration Status:');
      console.log('================');
      
      allMigrations.forEach(migration => {
        const status = executedMigrations.includes(migration.id) ? '✓ Executed' : '✗ Pending';
        console.log(`${status} - ${migration.filename}`);
      });
      
      console.log(`\nTotal: ${allMigrations.length} migrations`);
      console.log(`Executed: ${executedMigrations.length}`);
      console.log(`Pending: ${allMigrations.length - executedMigrations.length}`);
      
    } catch (error) {
      console.error('Failed to get migration status:', error);
      throw error;
    }
  }
}

// CLI interface for running migrations
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      migrator.migrate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'rollback':
      migrator.rollback()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'status':
      migrator.status()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('Usage: ts-node migrator.ts [migrate|rollback|status]');
      process.exit(1);
  }
}