import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from './connection';

export class DatabaseSeeder {
  private seedsPath: string;

  constructor() {
    this.seedsPath = path.join(__dirname, 'seeds');
  }

  /**
   * Get all seed files
   */
  private getSeedFiles(): string[] {
    return fs.readdirSync(this.seedsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Execute a seed file
   */
  private async executeSeedFile(filename: string): Promise<void> {
    console.log(`Executing seed file: ${filename}`);
    
    const filePath = path.join(this.seedsPath, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await DatabaseConnection.query(sql);
      console.log(`Seed file completed: ${filename}`);
    } catch (error) {
      console.error(`Error executing seed file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Run all seed files
   */
  async seed(): Promise<void> {
    console.log('Starting database seeding...');
    
    try {
      const seedFiles = this.getSeedFiles();
      
      if (seedFiles.length === 0) {
        console.log('No seed files found.');
        return;
      }
      
      console.log(`Found ${seedFiles.length} seed files.`);
      
      for (const filename of seedFiles) {
        await this.executeSeedFile(filename);
      }
      
      console.log('Database seeding completed successfully.');
      
    } catch (error) {
      console.error('Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all data from tables (for testing)
   */
  async clearData(): Promise<void> {
    console.log('Clearing database data...');
    
    try {
      // Disable foreign key checks temporarily
      await DatabaseConnection.query('SET session_replication_role = replica;');
      
      // Clear data from all tables in reverse dependency order
      const tables = [
        'reports',
        'links',
        'issues',
        'crawl_results',
        'crawl_sessions',
        'users'
      ];
      
      for (const table of tables) {
        await DatabaseConnection.query(`TRUNCATE TABLE ${table} CASCADE;`);
        console.log(`Cleared table: ${table}`);
      }
      
      // Re-enable foreign key checks
      await DatabaseConnection.query('SET session_replication_role = DEFAULT;');
      
      console.log('Database data cleared successfully.');
      
    } catch (error) {
      console.error('Failed to clear database data:', error);
      throw error;
    }
  }

  /**
   * Reset database (clear and seed)
   */
  async reset(): Promise<void> {
    console.log('Resetting database...');
    
    try {
      await this.clearData();
      await this.seed();
      console.log('Database reset completed successfully.');
      
    } catch (error) {
      console.error('Database reset failed:', error);
      throw error;
    }
  }
}

// CLI interface for running seeder
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  const command = process.argv[2];
  
  switch (command) {
    case 'seed':
      seeder.seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'clear':
      seeder.clearData()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'reset':
      seeder.reset()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('Usage: ts-node seeder.ts [seed|clear|reset]');
      process.exit(1);
  }
}