#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { DatabaseConnection } from '../packages/backend/src/database/connection.js';

interface ValidationCheck {
  name: string;
  category: string;
  check: () => Promise<boolean>;
  fix?: string;
  critical: boolean;
}

interface ValidationResult {
  check: string;
  category: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class SystemIntegrationValidator {
  private results: ValidationResult[] = [];
  private currentPlatform = platform();
  private projectRoot = process.cwd();

  private checks: ValidationCheck[] = [
    // Environment and Dependencies
    {
      name: 'Node.js Version Compatibility',
      category: 'Environment',
      check: async () => {
        const version = process.version;
        const majorVersion = parseInt(version.slice(1).split('.')[0]);
        return majorVersion >= 14 && majorVersion <= 20;
      },
      fix: 'Install Node.js version 14-20',
      critical: true
    },
    {
      name: 'Package Dependencies Installed',
      category: 'Environment',
      check: async () => {
        return existsSync(join(this.projectRoot, 'node_modules')) &&
               existsSync(join(this.projectRoot, 'packages/backend/node_modules')) &&
               existsSync(join(this.projectRoot, 'packages/frontend/node_modules'));
      },
      fix: 'Run: npm install && npm run install:all',
      critical: true
    },
    {
      name: 'TypeScript Compilation',
      category: 'Build',
      check: async () => {
        try {
          execSync('npx tsc --noEmit', {
            cwd: join(this.projectRoot, 'packages/backend'),
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Fix TypeScript compilation errors',
      critical: true
    },
    {
      name: 'Environment Configuration Files',
      category: 'Configuration',
      check: async () => {
        const requiredFiles = ['.env.development', '.env.test', '.env.production'];
        return requiredFiles.every(file => existsSync(join(this.projectRoot, file)));
      },
      fix: 'Create missing environment files from .env.example',
      critical: true
    },

    // Database Connectivity
    {
      name: 'PostgreSQL Connection',
      category: 'Database',
      check: async () => {
        try {
          const db = new DatabaseConnection();
          await db.connect();
          const result = await db.query('SELECT version()');
          await db.disconnect();
          return result.rows.length > 0;
        } catch {
          return false;
        }
      },
      fix: 'Start PostgreSQL service and verify connection settings',
      critical: true
    },
    {
      name: 'Database Schema Validation',
      category: 'Database',
      check: async () => {
        try {
          const db = new DatabaseConnection();
          await db.connect();
          
          const tables = ['crawl_sessions', 'crawl_results', 'issues', 'links'];
          const results = await Promise.all(
            tables.map(table => 
              db.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`, [table])
            )
          );
          
          await db.disconnect();
          return results.every(result => result.rows[0].exists);
        } catch {
          return false;
        }
      },
      fix: 'Run database migrations: npm run db:migrate',
      critical: true
    },

    // Redis Connectivity
    {
      name: 'Redis Connection',
      category: 'Cache',
      check: async () => {
        try {
          const Redis = require('ioredis');
          const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 1
          });
          
          await redis.ping();
          await redis.disconnect();
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Start Redis service and verify connection settings',
      critical: true
    },

    // Elasticsearch/OpenSearch
    {
      name: 'Search Service Connection',
      category: 'Search',
      check: async () => {
        try {
          const { Client } = require('@elastic/elasticsearch');
          const client = new Client({
            node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
          });
          
          await client.ping();
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Start Elasticsearch/OpenSearch service',
      critical: false
    },

    // Docker Compatibility
    {
      name: 'Docker Configuration Validation',
      category: 'Docker',
      check: async () => {
        try {
          execSync('docker-compose config', {
            cwd: this.projectRoot,
            stdio: 'pipe',
            timeout: 10000
          });
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Fix docker-compose.yml configuration',
      critical: false
    },
    {
      name: 'Docker Services Health',
      category: 'Docker',
      check: async () => {
        try {
          const output = execSync('docker-compose ps', {
            cwd: this.projectRoot,
            encoding: 'utf8',
            timeout: 10000
          });
          
          // Check if core services are running
          const coreServices = ['postgres', 'redis'];
          return coreServices.every(service => 
            output.includes(service) && output.includes('Up')
          );
        } catch {
          return false;
        }
      },
      fix: 'Start Docker services: docker-compose up -d',
      critical: false
    },

    // API Endpoints
    {
      name: 'Backend API Health Check',
      category: 'API',
      check: async () => {
        try {
          const { app } = await import('../packages/backend/src/app');
          const request = require('supertest');
          
          const response = await request(app).get('/api/health');
          return response.status === 200;
        } catch {
          return false;
        }
      },
      fix: 'Check backend service configuration and dependencies',
      critical: true
    },

    // Frontend Build
    {
      name: 'Frontend Build Validation',
      category: 'Frontend',
      check: async () => {
        try {
          execSync('npm run build', {
            cwd: join(this.projectRoot, 'packages/frontend'),
            stdio: 'pipe',
            timeout: 60000
          });
          return existsSync(join(this.projectRoot, 'packages/frontend/build'));
        } catch {
          return false;
        }
      },
      fix: 'Fix frontend build errors and dependencies',
      critical: true
    },

    // Cross-Platform Compatibility
    {
      name: 'Platform-Specific Scripts',
      category: 'Platform',
      check: async () => {
        if (this.currentPlatform === 'win32') {
          return existsSync(join(this.projectRoot, 'scripts/deploy.ps1'));
        } else {
          return existsSync(join(this.projectRoot, 'scripts/deploy.sh'));
        }
      },
      fix: 'Ensure platform-specific deployment scripts exist',
      critical: false
    },
    {
      name: 'File Path Compatibility',
      category: 'Platform',
      check: async () => {
        const testPaths = [
          'packages/backend/src',
          'packages/frontend/src',
          'packages/crawler/src',
          'packages/shared/src'
        ];
        
        return testPaths.every(path => 
          existsSync(join(this.projectRoot, path))
        );
      },
      fix: 'Verify all package directories exist',
      critical: true
    },

    // Performance and Scalability
    {
      name: 'Memory Usage Baseline',
      category: 'Performance',
      check: async () => {
        const memoryUsage = process.memoryUsage();
        // Should use less than 512MB for basic operations
        return memoryUsage.heapUsed < 512 * 1024 * 1024;
      },
      fix: 'Optimize memory usage or increase available memory',
      critical: false
    },
    {
      name: 'Database Connection Pool',
      category: 'Performance',
      check: async () => {
        try {
          const db = new DatabaseConnection();
          await db.connect();
          
          // Test multiple concurrent connections
          const promises = Array.from({ length: 10 }, () => 
            db.query('SELECT 1')
          );
          
          await Promise.all(promises);
          await db.disconnect();
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Configure database connection pooling properly',
      critical: false
    },

    // Security Validation
    {
      name: 'Environment Variables Security',
      category: 'Security',
      check: async () => {
        const envFile = join(this.projectRoot, '.env.production');
        if (!existsSync(envFile)) return true; // Skip if no prod env
        
        const content = readFileSync(envFile, 'utf8');
        // Check for placeholder values that should be changed
        const insecurePatterns = [
          'password123',
          'secret123',
          'changeme',
          'default'
        ];
        
        return !insecurePatterns.some(pattern => 
          content.toLowerCase().includes(pattern)
        );
      },
      fix: 'Update default passwords and secrets in production environment',
      critical: true
    },

    // Monitoring and Logging
    {
      name: 'Logging Configuration',
      category: 'Monitoring',
      check: async () => {
        try {
          // Check if logging is properly configured
          const logDir = join(this.projectRoot, 'logs');
          return existsSync(logDir) || process.env.NODE_ENV === 'test';
        } catch {
          return false;
        }
      },
      fix: 'Configure logging directory and permissions',
      critical: false
    }
  ];

  async runValidation(): Promise<void> {
    console.log('🔍 Enterprise Web Crawler - System Integration Validation');
    console.log(`Platform: ${this.currentPlatform}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`Working Directory: ${this.projectRoot}`);
    console.log('=' .repeat(80));

    const categories = [...new Set(this.checks.map(c => c.category))];
    
    for (const category of categories) {
      console.log(`\n📂 ${category} Checks:`);
      
      const categoryChecks = this.checks.filter(c => c.category === category);
      
      for (const check of categoryChecks) {
        await this.runCheck(check);
      }
    }

    this.generateReport();
  }

  private async runCheck(check: ValidationCheck): Promise<void> {
    const startTime = Date.now();
    
    try {
      const passed = await check.check();
      const duration = Date.now() - startTime;
      
      const status = passed ? '✅' : (check.critical ? '❌' : '⚠️');
      const criticalFlag = check.critical ? ' (CRITICAL)' : '';
      
      console.log(`  ${status} ${check.name}${criticalFlag} (${duration}ms)`);
      
      if (!passed && check.fix) {
        console.log(`    💡 Fix: ${check.fix}`);
      }
      
      this.results.push({
        check: check.name,
        category: check.category,
        passed,
        duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = check.critical ? '❌' : '⚠️';
      
      console.log(`  ${status} ${check.name} (${duration}ms)`);
      console.log(`    ❗ Error: ${error}`);
      
      if (check.fix) {
        console.log(`    💡 Fix: ${check.fix}`);
      }
      
      this.results.push({
        check: check.name,
        category: check.category,
        passed: false,
        duration,
        error: String(error)
      });
    }
  }

  private generateReport(): void {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 VALIDATION SUMMARY');
    console.log('=' .repeat(80));

    const totalChecks = this.results.length;
    const passedChecks = this.results.filter(r => r.passed).length;
    const failedChecks = totalChecks - passedChecks;
    
    const criticalChecks = this.checks.filter(c => c.critical).length;
    const criticalPassed = this.results.filter(r => {
      const check = this.checks.find(c => c.name === r.check);
      return r.passed && check?.critical;
    }).length;
    const criticalFailed = criticalChecks - criticalPassed;

    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks}`);
    console.log(`Failed: ${failedChecks}`);
    console.log(`Critical Checks: ${criticalChecks}`);
    console.log(`Critical Passed: ${criticalPassed}`);
    console.log(`Critical Failed: ${criticalFailed}`);

    // Category breakdown
    console.log('\n📋 By Category:');
    const categories = [...new Set(this.results.map(r => r.category))];
    
    categories.forEach(category => {
      const categoryResults = this.results.filter(r => r.category === category);
      const categoryPassed = categoryResults.filter(r => r.passed).length;
      const categoryTotal = categoryResults.length;
      
      console.log(`  ${category}: ${categoryPassed}/${categoryTotal} passed`);
    });

    // Failed checks details
    const failedResults = this.results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      console.log('\n❌ Failed Checks:');
      failedResults.forEach((result, index) => {
        const check = this.checks.find(c => c.name === result.check);
        const criticalFlag = check?.critical ? ' (CRITICAL)' : '';
        
        console.log(`  ${index + 1}. ${result.check}${criticalFlag}`);
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
        if (check?.fix) {
          console.log(`     Fix: ${check.fix}`);
        }
      });
    }

    // Platform-specific notes
    console.log(`\n🖥️  Platform-Specific Notes (${this.currentPlatform}):`);
    if (this.currentPlatform === 'win32') {
      console.log('  - Use PowerShell scripts for deployment');
      console.log('  - Ensure Windows Subsystem for Linux (WSL) if needed');
      console.log('  - Check file path length limitations');
    } else if (this.currentPlatform === 'darwin') {
      console.log('  - Ensure Xcode Command Line Tools are installed');
      console.log('  - Check Homebrew package versions');
    } else {
      console.log('  - Verify system package dependencies');
      console.log('  - Check service management (systemd/init)');
    }

    // Final assessment
    console.log('\n🎯 FINAL ASSESSMENT:');
    
    if (criticalFailed === 0) {
      if (failedChecks === 0) {
        console.log('🎉 ALL CHECKS PASSED! System is fully ready for deployment.');
        console.log('✅ You can proceed with confidence to run integration tests.');
      } else {
        console.log('✅ CRITICAL CHECKS PASSED! System is ready for deployment.');
        console.log('⚠️  Some non-critical issues detected - consider fixing for optimal performance.');
      }
      
      console.log('\n🚀 Next Steps:');
      console.log('  1. Run integration tests: npm run test:integration');
      console.log('  2. Deploy to target environment');
      console.log('  3. Monitor system performance');
      
      process.exit(0);
    } else {
      console.log('❌ CRITICAL ISSUES DETECTED! System is NOT ready for deployment.');
      console.log('🔧 Please fix all critical issues before proceeding.');
      
      console.log('\n🛠️  Required Actions:');
      const criticalFailures = failedResults.filter(r => {
        const check = this.checks.find(c => c.name === r.check);
        return check?.critical;
      });
      
      criticalFailures.forEach((result, index) => {
        const check = this.checks.find(c => c.name === result.check);
        console.log(`  ${index + 1}. ${check?.fix || 'Fix ' + result.check}`);
      });
      
      process.exit(1);
    }
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new SystemIntegrationValidator();
  validator.runValidation().catch((error) => {
    console.error('Fatal error during validation:', error);
    process.exit(1);
  });
}

export { SystemIntegrationValidator };