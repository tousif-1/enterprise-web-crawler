import { LinkValidationService, ValidationSummary } from '../services/link-validation.service';
import { notificationService } from '../services/notification.service';
import { Link, Issue } from '@enterprise-web-crawler/shared';

// Mock the LinkValidator
jest.mock('@enterprise-web-crawler/crawler', () => ({
  LinkValidator: jest.fn().mockImplementation(() => ({
    validateLinks: jest.fn(),
    validateLink: jest.fn()
  }))
}));

// Mock the notification service
jest.mock('../services/notification.service', () => ({
  notificationService: {
    notifyUrgentIssue: jest.fn(),
    notifyBatchComplete: jest.fn(),
    notifyLinkValidationComplete: jest.fn()
  }
}));

describe('LinkValidationService', () => {
  let linkValidationService: LinkValidationService;
  let mockLinkValidator: any;

  beforeEach(() => {
    // Get the mocked LinkValidator class
    const { LinkValidator } = require('@enterprise-web-crawler/crawler');
    mockLinkValidator = {
      validateLinks: jest.fn(),
      validateLink: jest.fn()
    };
    
    // Mock the constructor to return our mock instance
    LinkValidator.mockImplementation(() => mockLinkValidator);
    
    linkValidationService = new LinkValidationService({
      batchSize: 2, // Small batch size for testing
      notifyOnUrgentIssues: true,
      notifyOnBatchComplete: true
    });
    
    jest.clearAllMocks();
  });

  describe('validateLinksForSession', () => {
    it('should validate links and generate summary', async () => {
      const sessionId = 'test-session-1';
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
        }
      ];

      const mockResults = [
        {
          link: { ...links[0], status: 'valid', httpStatus: 200 },
          issues: [],
          validationTime: 100
        },
        {
          link: { ...links[1], status: 'broken', httpStatus: 404 },
          issues: [{
            id: 'issue-1',
            type: 'broken_link',
            severity: 'critical',
            description: 'HTTP 404: Not Found',
            element: 'https://example2.com'
          }],
          validationTime: 150
        }
      ];

      mockLinkValidator.validateLinks.mockResolvedValue(mockResults);

      const summary = await linkValidationService.validateLinksForSession(sessionId, links);

      expect(summary.totalLinks).toBe(2);
      expect(summary.validLinks).toBe(1);
      expect(summary.brokenLinks).toBe(1);
      expect(summary.criticalIssues).toBe(1);
      expect(summary.totalIssues).toBe(1);
      expect(summary.validationTime).toBeGreaterThan(0);

      // Verify notifications were sent
      expect(notificationService.notifyUrgentIssue).toHaveBeenCalledWith(
        sessionId,
        mockResults[1].issues[0],
        mockResults[1].link
      );
      expect(notificationService.notifyBatchComplete).toHaveBeenCalled();
      expect(notificationService.notifyLinkValidationComplete).toHaveBeenCalled();
    });

    it('should handle batch processing with multiple batches', async () => {
      const sessionId = 'test-session-2';
      const links: Link[] = [
        { url: 'https://example1.com', sourceUrl: 'https://source.com', text: 'Link 1', type: 'external', status: 'pending' },
        { url: 'https://example2.com', sourceUrl: 'https://source.com', text: 'Link 2', type: 'external', status: 'pending' },
        { url: 'https://example3.com', sourceUrl: 'https://source.com', text: 'Link 3', type: 'external', status: 'pending' },
        { url: 'https://example4.com', sourceUrl: 'https://source.com', text: 'Link 4', type: 'external', status: 'pending' }
      ];

      // Mock results for each batch (batch size is 2)
      const batch1Results = [
        { link: { ...links[0], status: 'valid' }, issues: [], validationTime: 100 },
        { link: { ...links[1], status: 'valid' }, issues: [], validationTime: 100 }
      ];
      const batch2Results = [
        { link: { ...links[2], status: 'broken' }, issues: [{ id: 'issue-1', type: 'broken_link', severity: 'high', description: 'Error' }], validationTime: 100 },
        { link: { ...links[3], status: 'valid' }, issues: [], validationTime: 100 }
      ];

      mockLinkValidator.validateLinks
        .mockResolvedValueOnce(batch1Results)
        .mockResolvedValueOnce(batch2Results);

      const summary = await linkValidationService.validateLinksForSession(sessionId, links);

      expect(summary.totalLinks).toBe(4);
      expect(summary.validLinks).toBe(3);
      expect(summary.brokenLinks).toBe(1);
      expect(summary.highSeverityIssues).toBe(1);

      // Verify batch notifications were sent twice
      expect(notificationService.notifyBatchComplete).toHaveBeenCalledTimes(2);
    });

    it('should handle validation errors gracefully', async () => {
      const sessionId = 'test-session-3';
      const links: Link[] = [
        { url: 'https://example.com', sourceUrl: 'https://source.com', text: 'Link', type: 'external', status: 'pending' }
      ];

      mockLinkValidator.validateLinks.mockRejectedValue(new Error('Validation failed'));

      const summary = await linkValidationService.validateLinksForSession(sessionId, links);

      expect(summary.totalLinks).toBe(0); // No successful validations
      expect(summary.totalIssues).toBe(1); // Error creates an issue
    });

    it('should not send urgent notifications when disabled', async () => {
      const serviceWithoutNotifications = new LinkValidationService({
        notifyOnUrgentIssues: false
      });

      const sessionId = 'test-session-4';
      const links: Link[] = [
        { url: 'https://example.com', sourceUrl: 'https://source.com', text: 'Link', type: 'external', status: 'pending' }
      ];

      const mockResults = [
        {
          link: { ...links[0], status: 'broken' },
          issues: [{
            id: 'issue-1',
            type: 'broken_link',
            severity: 'critical',
            description: 'Critical error'
          }],
          validationTime: 100
        }
      ];

      mockLinkValidator.validateLinks.mockResolvedValue(mockResults);

      await serviceWithoutNotifications.validateLinksForSession(sessionId, links);

      expect(notificationService.notifyUrgentIssue).not.toHaveBeenCalled();
    });
  });

  describe('revalidateFailedLinks', () => {
    it('should only revalidate failed and pending links', async () => {
      const sessionId = 'test-session-5';
      const links: Link[] = [
        { url: 'https://valid.com', sourceUrl: 'https://source.com', text: 'Valid Link', type: 'external', status: 'valid' },
        { url: 'https://broken.com', sourceUrl: 'https://source.com', text: 'Broken Link', type: 'external', status: 'broken' },
        { url: 'https://pending.com', sourceUrl: 'https://source.com', text: 'Pending Link', type: 'external', status: 'pending' }
      ];

      const mockResults = [
        { link: { ...links[1], status: 'valid' }, issues: [], validationTime: 100 },
        { link: { ...links[2], status: 'valid' }, issues: [], validationTime: 100 }
      ];

      mockLinkValidator.validateLinks.mockResolvedValue(mockResults);

      const summary = await linkValidationService.revalidateFailedLinks(sessionId, links);

      expect(summary.totalLinks).toBe(2); // Only failed and pending links
      expect(mockLinkValidator.validateLinks).toHaveBeenCalledWith([links[1], links[2]]);
    });

    it('should return empty summary when no failed links exist', async () => {
      const sessionId = 'test-session-6';
      const links: Link[] = [
        { url: 'https://valid.com', sourceUrl: 'https://source.com', text: 'Valid Link', type: 'external', status: 'valid' }
      ];

      const summary = await linkValidationService.revalidateFailedLinks(sessionId, links);

      expect(summary.totalLinks).toBe(0);
      expect(summary.validationTime).toBe(0);
      expect(mockLinkValidator.validateLinks).not.toHaveBeenCalled();
    });
  });

  describe('validateSingleLink', () => {
    it('should validate a single link and send notifications', async () => {
      const sessionId = 'test-session-7';
      const link: Link = {
        url: 'https://example.com',
        sourceUrl: 'https://source.com',
        text: 'Link',
        type: 'external',
        status: 'pending'
      };

      const mockResult = {
        link: { ...link, status: 'broken' },
        issues: [{
          id: 'issue-1',
          type: 'broken_link',
          severity: 'critical',
          description: 'Critical error'
        }],
        validationTime: 100
      };

      mockLinkValidator.validateLink.mockResolvedValue(mockResult);

      const result = await linkValidationService.validateSingleLink(sessionId, link);

      expect(result).toEqual(mockResult);
      expect(notificationService.notifyUrgentIssue).toHaveBeenCalledWith(
        sessionId,
        mockResult.issues[0],
        mockResult.link
      );
    });
  });

  describe('configuration management', () => {
    it('should return validation statistics', () => {
      const stats = linkValidationService.getValidationStats();

      expect(stats.batchSize).toBe(2);
      expect(stats.notificationsEnabled).toBe(true);
    });

    it('should update configuration', () => {
      linkValidationService.updateConfig({
        batchSize: 100,
        notifyOnUrgentIssues: false
      });

      const stats = linkValidationService.getValidationStats();
      expect(stats.batchSize).toBe(100);
      expect(stats.notificationsEnabled).toBe(false);
    });
  });

  describe('issue categorization', () => {
    it('should identify urgent issues correctly', async () => {
      const sessionId = 'test-session-8';
      const links: Link[] = [
        { url: 'https://example.com', sourceUrl: 'https://source.com', text: 'Link', type: 'external', status: 'pending' }
      ];

      const mockResults = [
        {
          link: { ...links[0], status: 'broken' },
          issues: [
            { id: 'issue-1', type: 'broken_link', severity: 'critical', description: 'Critical error' },
            { id: 'issue-2', type: 'broken_link', severity: 'high', description: 'High error' },
            { id: 'issue-3', type: 'broken_link', severity: 'medium', description: 'HTTP 404: Not Found' },
            { id: 'issue-4', type: 'broken_link', severity: 'low', description: 'Low error' }
          ],
          validationTime: 100
        }
      ];

      mockLinkValidator.validateLinks.mockResolvedValue(mockResults);

      await linkValidationService.validateLinksForSession(sessionId, links);

      // Should notify about critical, high, and 404 medium severity issues
      expect(notificationService.notifyUrgentIssue).toHaveBeenCalledTimes(3);
    });
  });

  describe('validation summary generation', () => {
    it('should generate accurate validation summary', async () => {
      const sessionId = 'test-session-9';
      const links: Link[] = [
        { url: 'https://valid1.com', sourceUrl: 'https://source.com', text: 'Valid 1', type: 'external', status: 'pending' },
        { url: 'https://valid2.com', sourceUrl: 'https://source.com', text: 'Valid 2', type: 'external', status: 'pending' },
        { url: 'https://broken1.com', sourceUrl: 'https://source.com', text: 'Broken 1', type: 'external', status: 'pending' },
        { url: 'https://redirect1.com', sourceUrl: 'https://source.com', text: 'Redirect 1', type: 'external', status: 'pending' },
        { url: 'https://pending1.com', sourceUrl: 'https://source.com', text: 'Pending 1', type: 'external', status: 'pending' }
      ];

      // Mock results for each batch (batch size is 2)
      const batch1Results = [
        { link: { ...links[0], status: 'valid' }, issues: [], validationTime: 100 },
        { link: { ...links[1], status: 'valid' }, issues: [], validationTime: 100 }
      ];
      const batch2Results = [
        { 
          link: { ...links[2], status: 'broken' }, 
          issues: [
            { id: 'issue-1', type: 'broken_link', severity: 'critical', description: 'Critical' },
            { id: 'issue-2', type: 'broken_link', severity: 'high', description: 'High' }
          ], 
          validationTime: 100 
        },
        { 
          link: { ...links[3], status: 'redirect' }, 
          issues: [
            { id: 'issue-3', type: 'broken_link', severity: 'medium', description: 'Medium' }
          ], 
          validationTime: 100 
        }
      ];
      const batch3Results = [
        { 
          link: { ...links[4], status: 'pending' }, 
          issues: [
            { id: 'issue-4', type: 'broken_link', severity: 'low', description: 'Low' }
          ], 
          validationTime: 100 
        }
      ];

      mockLinkValidator.validateLinks
        .mockResolvedValueOnce(batch1Results)
        .mockResolvedValueOnce(batch2Results)
        .mockResolvedValueOnce(batch3Results);

      const summary = await linkValidationService.validateLinksForSession(sessionId, links);

      expect(summary.totalLinks).toBe(5);
      expect(summary.validLinks).toBe(2);
      expect(summary.brokenLinks).toBe(1);
      expect(summary.redirectLinks).toBe(1);
      expect(summary.pendingLinks).toBe(1);
      expect(summary.totalIssues).toBe(4);
      expect(summary.criticalIssues).toBe(1);
      expect(summary.highSeverityIssues).toBe(1);
      expect(summary.mediumSeverityIssues).toBe(1);
      expect(summary.lowSeverityIssues).toBe(1);
    });
  });
});