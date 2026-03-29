#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

interface TestSuite {
  name: string;
  file: string;
  timeout: number;
  description: string;
  requirements: string[];
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class IntegrationTestRunner {
  private results: TestResult[] = [];
  private currentPlatform = platform();
  private projectRoot = join(__dirname, '../../../../..');

  private testSuites: TestSuite[] = [
    {
      name: 'Cross-Platform Compatibility',
      file: 'cross-platform.test.ts',
      timeout: 60000,
      description: 'Verify system works across Mac, Windows, and Docker environments',
      requirements: ['6.1', '6.2', '6.3']
    },
    {
      name: 'Complete Workflow Integration',
      file: 'complete-workflow.test.ts',
      timeout: 120000,
      description: 'Test end-to-end crawl workflows from creation to reporting',
      requirements: ['1.7', '2.3', '4.4', '5.1']
    },
    {
      name: 'Large-Scale Performance',
      file: 'large-scale.test.ts',
      timeout: 300000,
      description: 'Validate performance with 75,000+ links across 150 countries',
      requirements: ['5.1', '5.2', '5.3', '5.4']
    },
    {
      name: 'WebSocket Real-time Updates',
      file: 'websocket-realtime.test.ts',
      timeout: 180000,
      description: 'Verify real-time updates and WebSocket functionality',
      requirements: ['1.7', '2.3', '7.1']
    },
    {
      name: 'Accessibility Compliance E2E',
      file: 'accessibility-e2e.test.ts',
      timeout: 240000,
      description: 'End-to-end accessibility compliance testing (WCAG 2.2 AA)',
      requirements: ['3.1', '3.2', '3.3', '3.4']
    }
  ];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Enterprise Web Crawler Integration Tests');
    console.log(`Platform: ${this.currentPlatform}`);
    console.log(`Node.js: ${process.version}`);
    console.log('=' .repeat(80));

    // Pre-flight checks
    await this.performPreflightChecks();

    // Run each test suite
    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }

    // Generate final report
    this.generateFinalReport();
  }

  private async performPreflightChecks(): Promise<void> {
    console.log('🔍 Performing pre-flight checks...');

    const checks = [
      {
        name: 'Node.js Version',
        check: () => {
          const version = process.version;
          const majorVersion = parseInt(version.slice(1).split('.')[0]);
          return majorVersion >= 14;
        },
        message: 'Node.js 14+ required'
      },
      {
        name: 'Package Dependencies',
        check: () => existsSync(join(this.projectRoot, 'node_modules')),
        message: 'Run npm install first'
      },
      {
        name: 'TypeScript Configuration',
        check: () => existsSync(join(this.projectRoot, 'packages/backend/tsconfig.json')),
        message: 'TypeScript configuration missing'
      },
      {
        name: 'Environment Files',
        check: () => existsSync(join(this.projectRoot, '.env.test')),
        message: 'Test environment configuration missing'
      },
      {
        name: 'Database Schema',
        check: () => existsSync(join(this.projectRoot, 'packages/backend/src/database/schema.sql')),
        message: 'Database schema file missing'
      }
    ];

    for (const check of checks) {
      try {
        const passed = check.check();
        console.log(`  ${passed ? '✅' : '❌'} ${check.name}`);
        
        if (!passed) {
          console.error(`    Error: ${check.message}`);
          process.exit(1);
        }
      } catch (error) {
        console.log(`  ❌ ${check.name}`);
        console.error(`    Error: ${check.message}`);
        process.exit(1);
      }
    }

    console.log('✅ Pre-flight checks completed successfully\n');
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`🧪 Running ${suite.name}...`);
    console.log(`   Description: ${suite.description}`);
    console.log(`   Requirements: ${suite.requirements.join(', ')}`);
    console.log(`   Timeout: ${suite.timeout / 1000}s`);

    const startTime = Date.now();

    try {
      // Run the test suite
      await this.executeTest(suite);
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${suite.name} completed in ${duration}ms\n`);
      
      this.results.push({
        suite: suite.name,
        passed: true,
        duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${suite.name} failed after ${duration}ms`);
      console.error(`   Error: ${error}\n`);
      
      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        error: String(error)
      });
    }
  }

  private async executeTest(suite: TestSuite): Promise<void> {
    return new Promise((resolve, reject) => {
      const testFile = join(__dirname, suite.file);
      
      if (!existsSync(testFile)) {
        reject(new Error(`Test file not found: ${suite.file}`));
        return;
      }

      // Determine the appropriate test command based on platform
      const isWindows = this.currentPlatform === 'win32';
      const jestCommand = isWindows ? 'npx.cmd' : 'npx';
      
      const args = [
        'jest',
        testFile,
        '--verbose',
        '--detectOpenHandles',
        '--forceExit',
        `--testTimeout=${suite.timeout}`,
        '--runInBand' // Run tests serially to avoid resource conflicts
      ];

      const testProcess = spawn(jestCommand, args, {
        cwd: join(this.projectRoot, 'packages/backend'),
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CI: 'true'
        }
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Show real-time output for long-running tests
        if (suite.timeout > 60000) {
          process.stdout.write(text);
        }
      });

      testProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Show errors in real-time
        process.stderr.write(text);
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Test suite exited with code ${code}\n${errorOutput}`));
        }
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Failed to start test process: ${error.message}`));
      });

      // Handle timeout
      setTimeout(() => {
        testProcess.kill('SIGTERM');
        reject(new Error(`Test suite timed out after ${suite.timeout}ms`));
      }, suite.timeout + 5000); // Add 5s buffer
    });
  }

  private generateFinalReport(): void {
    console.log('=' .repeat(80));
    console.log('📊 INTEGRATION TEST RESULTS');
    console.log('=' .repeat(80));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Platform: ${this.currentPlatform}`);
    console.log(`Total Test Suites: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log('');

    // Detailed results
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const duration = Math.round(result.duration / 1000);
      console.log(`${index + 1}. ${status} ${result.suite} (${duration}s)`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error.split('\n')[0]}`);
      }
    });

    console.log('');

    // Requirements coverage
    console.log('📋 REQUIREMENTS COVERAGE:');
    const allRequirements = new Set<string>();
    this.testSuites.forEach(suite => {
      suite.requirements.forEach(req => allRequirements.add(req));
    });

    const coveredRequirements = new Set<string>();
    this.results.forEach(result => {
      if (result.passed) {
        const suite = this.testSuites.find(s => s.name === result.suite);
        if (suite) {
          suite.requirements.forEach(req => coveredRequirements.add(req));
        }
      }
    });

    Array.from(allRequirements).sort().forEach(req => {
      const covered = coveredRequirements.has(req);
      console.log(`   ${covered ? '✅' : '❌'} Requirement ${req}`);
    });

    console.log('');

    // Final status
    if (failedTests === 0) {
      console.log('🎉 ALL INTEGRATION TESTS PASSED!');
      console.log('✅ System is ready for deployment across all platforms');
      process.exit(0);
    } else {
      console.log('❌ SOME INTEGRATION TESTS FAILED');
      console.log('🔧 Please review and fix the failing tests before deployment');
      process.exit(1);
    }
  }
}

// Run the integration tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new IntegrationTestRunner();
  runner.runAllTests().catch((error) => {
    console.error('Fatal error running integration tests:', error);
    process.exit(1);
  });
}

export { IntegrationTestRunner };