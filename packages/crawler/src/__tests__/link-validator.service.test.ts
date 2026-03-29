import { LinkValidator, LinkValidationResult } from '../services/link-validator.service';
import { Link, Issue } from '@enterprise-web-crawler/shared';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.isAxiosError
const mockIsAxiosError = jest.fn();
(axios as any).isAxiosError = mockIsAxiosError;

describe('LinkValidator', () => {
  let linkValidator: LinkValidator;

  beforeEach(() => {
    linkValidator = new LinkValidator({
      timeout: 5000,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2
      }
    });
    jest.clearAllMocks();
    mockIsAxiosError.mockReturnValue(false); // Default to false
  });

  describe('validateLink', () => {
    it('should validate a successful link', async () => {
      const link: Link = {
        url: 'https://example.com',
        sourceUrl: 'https://source.com',
        text: 'Example Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: 'OK'
      });

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('valid');
      expect(result.link.httpStatus).toBe(200);
      expect(result.issues).toHaveLength(0);
      expect(result.validationTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle 404 not found errors', async () => {
      const link: Link = {
        url: 'https://example.com/notfound',
        sourceUrl: 'https://source.com',
        text: 'Broken Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        headers: {},
        data: 'Not Found'
      });

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('broken');
      expect(result.link.httpStatus).toBe(404);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].type).toBe('broken_link');
      expect(result.issues[0].description).toContain('404');
    });

    it('should handle redirects', async () => {
      const link: Link = {
        url: 'https://example.com/redirect',
        sourceUrl: 'https://source.com',
        text: 'Redirect Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 301,
        headers: {
          location: 'https://example.com/new-location'
        },
        data: 'Moved Permanently'
      });

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('redirect');
      expect(result.link.httpStatus).toBe(301);
      expect(result.link.redirectUrl).toBe('https://example.com/new-location');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('medium');
      expect(result.issues[0].description).toContain('Permanent redirect');
    });

    it('should handle network errors with retry', async () => {
      const link: Link = {
        url: 'https://unreachable.com',
        sourceUrl: 'https://source.com',
        text: 'Unreachable Link',
        type: 'external',
        status: 'pending'
      };

      const networkError = {
        isAxiosError: true,
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      };
      
      mockIsAxiosError.mockReturnValue(true);
      
      mockedAxios.get
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('broken');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].description).toContain('Connection refused');
      expect(mockedAxios.get).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle DNS resolution failures', async () => {
      const link: Link = {
        url: 'https://nonexistent-domain-12345.com',
        sourceUrl: 'https://source.com',
        text: 'DNS Fail Link',
        type: 'external',
        status: 'pending'
      };

      const dnsError = {
        isAxiosError: true,
        code: 'ENOTFOUND',
        message: 'DNS Error'
      };
      
      mockIsAxiosError.mockReturnValue(true);
      
      mockedAxios.get.mockRejectedValue(dnsError);

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('broken');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].description).toContain('Domain not found');
    });

    it('should handle server errors with retry', async () => {
      const link: Link = {
        url: 'https://example.com/server-error',
        sourceUrl: 'https://source.com',
        text: 'Server Error Link',
        type: 'external',
        status: 'pending'
      };

      const serverError = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Server Error'
      };
      
      mockIsAxiosError.mockReturnValue(true);
      
      mockedAxios.get
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ status: 200, headers: {}, data: 'OK' });

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('valid');
      expect(result.link.httpStatus).toBe(200);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2); // Initial failure + retry success
    });

    it('should not retry on 4xx client errors', async () => {
      const link: Link = {
        url: 'https://example.com/forbidden',
        sourceUrl: 'https://source.com',
        text: 'Forbidden Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 403,
        headers: {},
        data: 'Forbidden'
      });

      const result = await linkValidator.validateLink(link);

      expect(result.link.status).toBe('broken');
      expect(result.link.httpStatus).toBe(403);
      expect(result.issues[0].severity).toBe('high');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // No retry for 4xx
    });
  });

  describe('validateLinks', () => {
    it('should validate multiple links with concurrency control', async () => {
      const links: Link[] = [
        {
          url: 'https://example1.com',
          sourceUrl: 'https://source.com',
          text: 'Link 1',
          type: 'external',
          status: 'pending'
        },
        {
          url: 'https://example2.com',
          sourceUrl: 'https://source.com',
          text: 'Link 2',
          type: 'external',
          status: 'pending'
        },
        {
          url: 'https://example3.com',
          sourceUrl: 'https://source.com',
          text: 'Link 3',
          type: 'external',
          status: 'pending'
        }
      ];

      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, headers: {}, data: 'OK' })
        .mockResolvedValueOnce({ status: 404, headers: {}, data: 'Not Found' })
        .mockResolvedValueOnce({ status: 301, headers: { location: 'https://example3-new.com' }, data: 'Moved' });

      const results = await linkValidator.validateLinks(links);

      expect(results).toHaveLength(3);
      expect(results[0].link.status).toBe('valid');
      expect(results[1].link.status).toBe('broken');
      expect(results[2].link.status).toBe('redirect');
      
      // Check issues
      expect(results[0].issues).toHaveLength(0);
      expect(results[1].issues).toHaveLength(1);
      expect(results[2].issues).toHaveLength(1);
    });

    it('should handle validation failures gracefully', async () => {
      const links: Link[] = [
        {
          url: 'https://example.com',
          sourceUrl: 'https://source.com',
          text: 'Link',
          type: 'external',
          status: 'pending'
        }
      ];

      // Mock a validation failure
      const validationError = new Error('Validation failed');
      jest.spyOn(linkValidator, 'validateLink').mockRejectedValueOnce(validationError);

      const results = await linkValidator.validateLinks(links);

      expect(results).toHaveLength(1);
      expect(results[0].link.status).toBe('broken');
      expect(results[0].issues).toHaveLength(1);
      expect(results[0].issues[0].description).toContain('Validation failed');
    });
  });

  describe('severity categorization', () => {
    it('should categorize 404 as critical', async () => {
      const link: Link = {
        url: 'https://example.com/404',
        sourceUrl: 'https://source.com',
        text: '404 Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        headers: {},
        data: 'Not Found'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].severity).toBe('critical');
    });

    it('should categorize 5xx as high severity', async () => {
      const link: Link = {
        url: 'https://example.com/500',
        sourceUrl: 'https://source.com',
        text: '500 Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 500,
        headers: {},
        data: 'Internal Server Error'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].severity).toBe('high');
    });

    it('should categorize 403 as high severity', async () => {
      const link: Link = {
        url: 'https://example.com/403',
        sourceUrl: 'https://source.com',
        text: '403 Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 403,
        headers: {},
        data: 'Forbidden'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].severity).toBe('high');
    });

    it('should categorize other 4xx as medium severity', async () => {
      const link: Link = {
        url: 'https://example.com/400',
        sourceUrl: 'https://source.com',
        text: '400 Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 400,
        headers: {},
        data: 'Bad Request'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].severity).toBe('medium');
    });
  });

  describe('remediation advice', () => {
    it('should provide appropriate remediation for 404 errors', async () => {
      const link: Link = {
        url: 'https://example.com/404',
        sourceUrl: 'https://source.com',
        text: '404 Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        headers: {},
        data: 'Not Found'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].remediation).toContain('Update or remove the broken link');
    });

    it('should provide appropriate remediation for DNS errors', async () => {
      const link: Link = {
        url: 'https://nonexistent.com',
        sourceUrl: 'https://source.com',
        text: 'DNS Link',
        type: 'external',
        status: 'pending'
      };

      const dnsError = {
        isAxiosError: true,
        code: 'ENOTFOUND',
        message: 'DNS Error'
      };
      
      mockIsAxiosError.mockReturnValue(true);
      
      mockedAxios.get.mockRejectedValue(dnsError);

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].remediation).toContain('Verify the domain name is correct');
    });

    it('should provide appropriate remediation for redirects', async () => {
      const link: Link = {
        url: 'https://example.com/redirect',
        sourceUrl: 'https://source.com',
        text: 'Redirect Link',
        type: 'external',
        status: 'pending'
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 301,
        headers: { location: 'https://example.com/new' },
        data: 'Moved'
      });

      const result = await linkValidator.validateLink(link);
      expect(result.issues[0].remediation).toContain('Update the link to point directly');
    });
  });
});