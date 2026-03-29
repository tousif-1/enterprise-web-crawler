import { NotificationService, UrgentIssueNotification, LinkValidationCompleteNotification } from '../services/notification.service';
import { Issue, Link } from '@enterprise-web-crawler/shared';

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService();
  });

  afterEach(() => {
    notificationService.destroy();
  });

  describe('urgent issue notifications', () => {
    it('should notify about critical issues', (done) => {
      const sessionId = 'test-session-1';
      const issue: Issue = {
        id: 'issue-1',
        type: 'broken_link',
        severity: 'critical',
        description: 'Page not found (404)',
        element: 'https://example.com/missing'
      };
      const link: Link = {
        url: 'https://example.com/missing',
        sourceUrl: 'https://source.com',
        text: 'Missing Page',
        type: 'external',
        status: 'broken'
      };

      notificationService.onUrgentIssue(sessionId, (notification: UrgentIssueNotification) => {
        expect(notification.type).toBe('urgent_issue');
        expect(notification.sessionId).toBe(sessionId);
        expect(notification.data.issue).toEqual(issue);
        expect(notification.data.link).toEqual(link);
        expect(notification.data.affectedUrl).toBe(link.url);
        expect(notification.timestamp).toBeInstanceOf(Date);
        done();
      });

      notificationService.notifyUrgentIssue(sessionId, issue, link);
    });

    it('should notify about high severity issues', (done) => {
      const sessionId = 'test-session-2';
      const issue: Issue = {
        id: 'issue-2',
        type: 'broken_link',
        severity: 'high',
        description: 'Server error (500)',
        element: 'https://example.com/error'
      };
      const link: Link = {
        url: 'https://example.com/error',
        sourceUrl: 'https://source.com',
        text: 'Error Page',
        type: 'external',
        status: 'broken'
      };

      notificationService.onUrgentIssue(sessionId, (notification: UrgentIssueNotification) => {
        expect(notification.data.issue.severity).toBe('high');
        done();
      });

      notificationService.notifyUrgentIssue(sessionId, issue, link);
    });

    it('should not notify about low severity issues', () => {
      const sessionId = 'test-session-3';
      const issue: Issue = {
        id: 'issue-3',
        type: 'broken_link',
        severity: 'low',
        description: 'Minor issue',
        element: 'https://example.com/minor'
      };
      const link: Link = {
        url: 'https://example.com/minor',
        sourceUrl: 'https://source.com',
        text: 'Minor Issue',
        type: 'external',
        status: 'valid'
      };

      let notificationReceived = false;
      notificationService.onUrgentIssue(sessionId, () => {
        notificationReceived = true;
      });

      notificationService.notifyUrgentIssue(sessionId, issue, link);

      // Wait a bit to ensure no notification is sent
      setTimeout(() => {
        expect(notificationReceived).toBe(false);
      }, 100);
    });

    it('should notify about 404 medium severity issues', (done) => {
      const sessionId = 'test-session-4';
      const issue: Issue = {
        id: 'issue-4',
        type: 'broken_link',
        severity: 'medium',
        description: 'HTTP 404: Not Found',
        element: 'https://example.com/404'
      };
      const link: Link = {
        url: 'https://example.com/404',
        sourceUrl: 'https://source.com',
        text: '404 Page',
        type: 'external',
        status: 'broken'
      };

      notificationService.onUrgentIssue(sessionId, (notification: UrgentIssueNotification) => {
        expect(notification.data.issue.severity).toBe('medium');
        expect(notification.data.issue.description).toContain('404');
        done();
      });

      notificationService.notifyUrgentIssue(sessionId, issue, link);
    });
  });

  describe('link validation completion notifications', () => {
    it('should notify about validation completion', (done) => {
      const sessionId = 'test-session-5';
      const issues: Issue[] = [
        {
          id: 'issue-1',
          type: 'broken_link',
          severity: 'critical',
          description: 'Critical issue'
        },
        {
          id: 'issue-2',
          type: 'broken_link',
          severity: 'high',
          description: 'High severity issue'
        },
        {
          id: 'issue-3',
          type: 'broken_link',
          severity: 'medium',
          description: 'Medium severity issue'
        }
      ];

      notificationService.onLinkValidationComplete(sessionId, (notification: LinkValidationCompleteNotification) => {
        expect(notification.type).toBe('link_validation_complete');
        expect(notification.sessionId).toBe(sessionId);
        expect(notification.data.totalLinks).toBe(100);
        expect(notification.data.validLinks).toBe(85);
        expect(notification.data.brokenLinks).toBe(15);
        expect(notification.data.criticalIssues).toBe(1);
        expect(notification.data.highSeverityIssues).toBe(1);
        done();
      });

      notificationService.notifyLinkValidationComplete(sessionId, 100, 85, 15, issues);
    });
  });

  describe('batch completion notifications', () => {
    it('should notify about batch completion', (done) => {
      const sessionId = 'test-session-6';

      notificationService.onBatchComplete(sessionId, (notification) => {
        expect(notification.type).toBe('batch_complete');
        expect(notification.sessionId).toBe(sessionId);
        expect(notification.data.batchSize).toBe(50);
        expect(notification.data.processedCount).toBe(50);
        expect(notification.data.issuesFound).toBe(5);
        done();
      });

      notificationService.notifyBatchComplete(sessionId, 50, 50, 5);
    });
  });

  describe('session-specific subscriptions', () => {
    it('should only notify subscribers of specific sessions', (done) => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      
      let session1Notifications = 0;
      let session2Notifications = 0;

      notificationService.onUrgentIssue(sessionId1, () => {
        session1Notifications++;
      });

      notificationService.onUrgentIssue(sessionId2, () => {
        session2Notifications++;
      });

      const issue: Issue = {
        id: 'issue-1',
        type: 'broken_link',
        severity: 'critical',
        description: 'Critical issue'
      };
      const link: Link = {
        url: 'https://example.com',
        sourceUrl: 'https://source.com',
        text: 'Link',
        type: 'external',
        status: 'broken'
      };

      // Notify only session 1
      notificationService.notifyUrgentIssue(sessionId1, issue, link);

      setTimeout(() => {
        expect(session1Notifications).toBe(1);
        expect(session2Notifications).toBe(0);
        done();
      }, 100);
    });

    it('should unsubscribe from all session notifications', () => {
      const sessionId = 'test-session-unsubscribe';
      
      let notificationCount = 0;
      notificationService.onUrgentIssue(sessionId, () => notificationCount++);
      notificationService.onBatchComplete(sessionId, () => notificationCount++);

      // Unsubscribe from all notifications for this session
      notificationService.offSessionNotification(sessionId);

      const issue: Issue = {
        id: 'issue-1',
        type: 'broken_link',
        severity: 'critical',
        description: 'Critical issue'
      };
      const link: Link = {
        url: 'https://example.com',
        sourceUrl: 'https://source.com',
        text: 'Link',
        type: 'external',
        status: 'broken'
      };

      notificationService.notifyUrgentIssue(sessionId, issue, link);
      notificationService.notifyBatchComplete(sessionId, 10, 10, 1);

      setTimeout(() => {
        expect(notificationCount).toBe(0);
      }, 100);
    });
  });

  describe('notification statistics', () => {
    it('should provide notification statistics', () => {
      const sessionId = 'stats-session';
      const testService = new NotificationService(); // Use a separate instance
      
      testService.onUrgentIssue(sessionId, () => {});
      testService.onBatchComplete(sessionId, () => {});

      const stats = testService.getNotificationStats();
      
      expect(stats.totalListeners).toBeGreaterThan(0);
      expect(stats.eventNames).toContain(`session:${sessionId}:urgent_issue`);
      expect(stats.eventNames).toContain(`session:${sessionId}:batch_complete`);
      expect(stats.maxListeners).toBe(100);
      
      testService.destroy(); // Clean up
    });
  });

  describe('multiple session notifications', () => {
    it('should handle notifications for multiple sessions simultaneously', (done) => {
      const sessions = ['session-1', 'session-2', 'session-3'];
      let completedSessions = 0;

      sessions.forEach(sessionId => {
        notificationService.onUrgentIssue(sessionId, (notification) => {
          expect(notification.sessionId).toBe(sessionId);
          completedSessions++;
          
          if (completedSessions === sessions.length) {
            done();
          }
        });
      });

      const issue: Issue = {
        id: 'issue-1',
        type: 'broken_link',
        severity: 'critical',
        description: 'Critical issue'
      };
      const link: Link = {
        url: 'https://example.com',
        sourceUrl: 'https://source.com',
        text: 'Link',
        type: 'external',
        status: 'broken'
      };

      // Notify all sessions
      sessions.forEach(sessionId => {
        notificationService.notifyUrgentIssue(sessionId, issue, link);
      });
    });
  });
});