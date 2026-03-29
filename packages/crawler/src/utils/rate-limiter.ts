import { URL } from 'url';

interface RateLimitEntry {
  lastRequest: number;
  requestCount: number;
  resetTime: number;
}

export class RateLimiter {
  private domainLimits: Map<string, RateLimitEntry> = new Map();
  private readonly defaultDelay = 1000; // 1 second between requests
  private readonly maxRequestsPerMinute = 60;
  private readonly windowSize = 60000; // 1 minute in milliseconds

  async waitForSlot(url: string): Promise<void> {
    const domain = this.extractDomain(url);
    if (!domain) return;

    const now = Date.now();
    const entry = this.domainLimits.get(domain) || {
      lastRequest: 0,
      requestCount: 0,
      resetTime: now + this.windowSize
    };

    // Reset counter if window has passed
    if (now >= entry.resetTime) {
      entry.requestCount = 0;
      entry.resetTime = now + this.windowSize;
    }

    // Check if we've exceeded the rate limit
    if (entry.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = entry.resetTime - now;
      if (waitTime > 0) {
        await this.sleep(waitTime);
        // Reset after waiting
        entry.requestCount = 0;
        entry.resetTime = Date.now() + this.windowSize;
      }
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - entry.lastRequest;
    if (timeSinceLastRequest < this.defaultDelay) {
      await this.sleep(this.defaultDelay - timeSinceLastRequest);
    }

    // Update entry
    entry.lastRequest = Date.now();
    entry.requestCount++;
    this.domainLimits.set(domain, entry);
  }

  private extractDomain(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch (error) {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current rate limit status for a domain
  getRateLimitStatus(url: string): { requestCount: number; resetTime: number } | null {
    const domain = this.extractDomain(url);
    if (!domain) return null;

    const entry = this.domainLimits.get(domain);
    if (!entry) return { requestCount: 0, resetTime: Date.now() + this.windowSize };

    return {
      requestCount: entry.requestCount,
      resetTime: entry.resetTime
    };
  }

  // Clear rate limit data for a domain (useful for testing)
  clearDomain(url: string): void {
    const domain = this.extractDomain(url);
    if (domain) {
      this.domainLimits.delete(domain);
    }
  }

  // Clear all rate limit data
  clearAll(): void {
    this.domainLimits.clear();
  }
}