import { URLValidator } from '../utils/url-validator';

describe('URLValidator', () => {
  let validator: URLValidator;

  beforeEach(() => {
    validator = new URLValidator();
  });

  describe('isValid', () => {
    it('should validate correct HTTP URLs', () => {
      expect(validator.isValid('http://example.com')).toBe(true);
      expect(validator.isValid('https://example.com')).toBe(true);
      expect(validator.isValid('https://www.example.com/path')).toBe(true);
      expect(validator.isValid('https://example.com:8080/path?query=value')).toBe(true);
    });

    it('should reject invalid protocols', () => {
      expect(validator.isValid('ftp://example.com')).toBe(false);
      expect(validator.isValid('file:///path/to/file')).toBe(false);
      expect(validator.isValid('javascript:alert(1)')).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(validator.isValid('not-a-url')).toBe(false);
      expect(validator.isValid('http://')).toBe(false);
      expect(validator.isValid('https://.com')).toBe(false);
      expect(validator.isValid('')).toBe(false);
    });

    it('should reject blocked domains', () => {
      expect(validator.isValid('http://localhost')).toBe(false);
      expect(validator.isValid('https://127.0.0.1')).toBe(false);
      expect(validator.isValid('http://0.0.0.0')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should remove fragments', () => {
      const normalized = validator.normalize('https://example.com/path#fragment');
      expect(normalized).toBe('https://example.com/path');
    });

    it('should sort query parameters', () => {
      const normalized = validator.normalize('https://example.com/path?z=1&a=2&m=3');
      expect(normalized).toBe('https://example.com/path?a=2&m=3&z=1');
    });

    it('should handle multiple values for same parameter', () => {
      const normalized = validator.normalize('https://example.com/path?tag=a&tag=b&other=1');
      expect(normalized).toBe('https://example.com/path?other=1&tag=a&tag=b');
    });

    it('should return original URL if normalization fails', () => {
      const invalidUrl = 'not-a-url';
      const normalized = validator.normalize(invalidUrl);
      expect(normalized).toBe(invalidUrl);
    });
  });

  describe('getDomain', () => {
    it('should extract domain from valid URLs', () => {
      expect(validator.getDomain('https://example.com/path')).toBe('example.com');
      expect(validator.getDomain('http://www.example.com:8080')).toBe('www.example.com');
      expect(validator.getDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(validator.getDomain('not-a-url')).toBe(null);
      expect(validator.getDomain('')).toBe(null);
    });
  });

  describe('isSameDomain', () => {
    it('should return true for same domains', () => {
      expect(validator.isSameDomain(
        'https://example.com/path1',
        'https://example.com/path2'
      )).toBe(true);
      
      expect(validator.isSameDomain(
        'http://example.com',
        'https://example.com'
      )).toBe(true);
    });

    it('should return false for different domains', () => {
      expect(validator.isSameDomain(
        'https://example.com',
        'https://other.com'
      )).toBe(false);
      
      expect(validator.isSameDomain(
        'https://subdomain.example.com',
        'https://example.com'
      )).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(validator.isSameDomain(
        'not-a-url',
        'https://example.com'
      )).toBe(false);
      
      expect(validator.isSameDomain(
        'https://example.com',
        'not-a-url'
      )).toBe(false);
    });
  });
});