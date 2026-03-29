import puppeteer from 'puppeteer';

export interface CrawlerHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    puppeteer: {
      status: 'ok' | 'error';
      version?: string;
      error?: string;
    };
    memory: {
      status: 'ok' | 'warning' | 'critical';
      heapUsed: number;
      heapTotal: number;
      percentage: number;
    };
    activeBrowsers: {
      count: number;
      status: 'ok' | 'warning' | 'critical';
    };
  };
  uptime: number;
  version: string;
}

export class CrawlerHealthService {
  private activeBrowsers: Set<puppeteer.Browser> = new Set();
  private readonly maxBrowsers = 10;
  private readonly memoryWarningThreshold = 70; // 70%
  private readonly memoryCriticalThreshold = 90; // 90%

  public registerBrowser(browser: puppeteer.Browser): void {
    this.activeBrowsers.add(browser);
    
    // Clean up closed browsers
    browser.on('disconnected', () => {
      this.activeBrowsers.delete(browser);
    });
  }

  public unregisterBrowser(browser: puppeteer.Browser): void {
    this.activeBrowsers.delete(browser);
  }

  public getActiveBrowserCount(): number {
    return this.activeBrowsers.size;
  }

  public async getHealthStatus(): Promise<CrawlerHealthStatus> {
    const timestamp = new Date();
    const memoryUsage = process.memoryUsage();
    const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    // Check Puppeteer
    const puppeteerCheck = await this.checkPuppeteer();
    
    // Check memory usage
    const memoryStatus = memoryPercentage > this.memoryCriticalThreshold ? 'critical' :
                        memoryPercentage > this.memoryWarningThreshold ? 'warning' : 'ok';
    
    // Check active browsers
    const browserCount = this.activeBrowsers.size;
    const browserStatus = browserCount > this.maxBrowsers ? 'critical' :
                         browserCount > this.maxBrowsers * 0.8 ? 'warning' : 'ok';
    
    // Determine overall status
    const overallStatus = puppeteerCheck.status === 'error' || 
                         memoryStatus === 'critical' || 
                         browserStatus === 'critical' ? 'unhealthy' :
                         memoryStatus === 'warning' || 
                         browserStatus === 'warning' ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      timestamp,
      checks: {
        puppeteer: puppeteerCheck,
        memory: {
          status: memoryStatus,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          percentage: memoryPercentage
        },
        activeBrowsers: {
          count: browserCount,
          status: browserStatus
        }
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  private async checkPuppeteer(): Promise<{ status: 'ok' | 'error'; version?: string; error?: string }> {
    try {
      // Try to launch a browser briefly to test Puppeteer
      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const version = await browser.version();
      await browser.close();
      
      return {
        status: 'ok',
        version
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async cleanup(): Promise<void> {
    // Close all active browsers
    const closePromises = Array.from(this.activeBrowsers).map(async (browser) => {
      try {
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch (error) {
        console.error('Error closing browser:', error);
      }
    });

    await Promise.allSettled(closePromises);
    this.activeBrowsers.clear();
  }

  public getMetrics(): {
    activeBrowsers: number;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  } {
    return {
      activeBrowsers: this.activeBrowsers.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}

// Singleton instance
export const crawlerHealthService = new CrawlerHealthService();