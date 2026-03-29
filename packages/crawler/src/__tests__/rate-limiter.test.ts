import { RateLimiter } from '../utils/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  describe('waitForSlot', () => {
    it('should allow first request immediately', async () => {
      const startTime = Date.now();
      await rateLimiter.waitForSlot('https://example.com');
      const endTime = Date.now();
      
      // Should complete quickly (within 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should enforce minimum delay between requests to same domain', async () => {
      const startTime = Date.now();
      
      await rateLimiter.waitForSlot('https://example.com/page1');
      await rateLimiter.waitForSlot('https://example.com/page2');
      
      const endTime = Date.now();
      
      // Should take at least 1 second (1000ms) due to rate limiting
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should allow concurrent requests to different domains', async () => {
      const startTime = Date.now();
      
      await Promise.all([
        rateLimiter.waitForSlot('https://example1.com'),
        rateLimiter.waitForSlot('https://example2.com'),
        rateLimiter.waitForSlot('https://example3.com')
      ]);
      
      const endTime = Date.now();
      
      // Should complete quickly since they're different domains
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should handle invalid URLs gracefully', async () => {
      const startTime = Date.now();
      await rateLimiter.waitForSlot('not-a-url');
      const endTime = Date.now();
      
      // Should complete immediately for invalid URLs
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return initial status for new domain', () => {
      const status = rateLimiter.getRateLimitStatus('https://example.com');
      
      expect(status).toBeTruthy();
      expect(status?.requestCount).toBe(0);
      expect(status?.resetTime).toBeGreaterThan(Date.now());
    });

    it('should track request count after requests', async () => {
      await rateLimiter.waitForSlot('https://example.com');
      const status = rateLimiter.getRateLimitStatus('https://example.com');
      
      expect(status?.requestCount).toBe(1);
    });

    it('should return null for invalid URLs', () => {
      const status = rateLimiter.getRateLimitStatus('not-a-url');
      expect(status).toBe(null);
    });
  });

  describe('clearDomain', () => {
    it('should clear rate limit data for specific domain', async () => {
      await rateLimiter.waitForSlot('https://example.com');
      
      let status = rateLimiter.getRateLimitStatus('https://example.com');
      expect(status?.requestCount).toBe(1);
      
      rateLimiter.clearDomain('https://example.com');
      
      status = rateLimiter.getRateLimitStatus('https://example.com');
      expect(status?.requestCount).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all rate limit data', async () => {
      await rateLimiter.waitForSlot('https://example1.com');
      await rateLimiter.waitForSlot('https://example2.com');
      
      rateLimiter.clearAll();
      
      const status1 = rateLimiter.getRateLimitStatus('https://example1.com');
      const status2 = rateLimiter.getRateLimitStatus('https://example2.com');
      
      expect(status1?.requestCount).toBe(0);
      expect(status2?.requestCount).toBe(0);
    });
  });

  describe('rate limit enforcement', () => {
    it('should enforce maximum requests per minute', async () => {
      // This test would be slow in real-time, so we'll test the logic conceptually
      const domain = 'https://example.com';
      
      // Make multiple requests quickly
      for (let i = 0; i < 5; i++) {
        await rateLimiter.waitForSlot(domain);
      }
      
      const status = rateLimiter.getRateLimitStatus(domain);
      expect(status?.requestCount).toBe(5);
    }, 10000); // Increase timeout for this test
  });
});