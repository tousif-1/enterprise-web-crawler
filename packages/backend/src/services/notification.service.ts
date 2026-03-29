import { EventEmitter } from 'events';
import { Issue, Link } from '@enterprise-web-crawler/shared';
import { Logger } from '../utils/logger';

export interface NotificationPayload {
  type: 'urgent_issue' | 'link_validation_complete' | 'batch_complete';
  sessionId: string;
  timestamp: Date;
  data: any;
}

export interface UrgentIssueNotification extends NotificationPayload {
  type: 'urgent_issue';
  data: {
    issue: Issue;
    link: Link;
    affectedUrl: string;
  };
}

export interface LinkValidationCompleteNotification extends NotificationPayload {
  type: 'link_validation_complete';
  data: {
    totalLinks: number;
    validLinks: number;
    brokenLinks: number;
    criticalIssues: number;
    highSeverityIssues: number;
  };
}

export interface BatchCompleteNotification extends NotificationPayload {
  type: 'batch_complete';
  data: {
    batchSize: number;
    processedCount: number;
    issuesFound: number;
  };
}

export type NotificationTypes = 
  | UrgentIssueNotification 
  | LinkValidationCompleteNotification 
  | BatchCompleteNotification;

export class NotificationService extends EventEmitter {
  private logger: Logger;
  private urgentSeverities: Issue['severity'][] = ['critical', 'high'];

  constructor() {
    super();
    this.logger = new Logger('NotificationService');
    this.setMaxListeners(100); // Allow many listeners for real-time updates
  }

  /**
   * Notify about an urgent issue that requires immediate attention
   */
  notifyUrgentIssue(sessionId: string, issue: Issue, link: Link): void {
    if (!this.isUrgentIssue(issue)) {
      return;
    }

    const notification: UrgentIssueNotification = {
      type: 'urgent_issue',
      sessionId,
      timestamp: new Date(),
      data: {
        issue,
        link,
        affectedUrl: link.url
      }
    };

    this.logger.warn(`Urgent issue detected: ${issue.description} on ${link.url}`);
    this.emit('urgent_issue', notification);
    this.emit(`session:${sessionId}:urgent_issue`, notification);
  }

  /**
   * Notify about link validation completion
   */
  notifyLinkValidationComplete(
    sessionId: string,
    totalLinks: number,
    validLinks: number,
    brokenLinks: number,
    issues: Issue[]
  ): void {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highSeverityIssues = issues.filter(i => i.severity === 'high').length;

    const notification: LinkValidationCompleteNotification = {
      type: 'link_validation_complete',
      sessionId,
      timestamp: new Date(),
      data: {
        totalLinks,
        validLinks,
        brokenLinks,
        criticalIssues,
        highSeverityIssues
      }
    };

    this.logger.info(`Link validation complete for session ${sessionId}: ${validLinks}/${totalLinks} valid`);
    this.emit('link_validation_complete', notification);
    this.emit(`session:${sessionId}:link_validation_complete`, notification);
  }

  /**
   * Notify about batch processing completion
   */
  notifyBatchComplete(sessionId: string, batchSize: number, processedCount: number, issuesFound: number): void {
    const notification: BatchCompleteNotification = {
      type: 'batch_complete',
      sessionId,
      timestamp: new Date(),
      data: {
        batchSize,
        processedCount,
        issuesFound
      }
    };

    this.logger.debug(`Batch complete for session ${sessionId}: ${processedCount}/${batchSize} processed`);
    this.emit('batch_complete', notification);
    this.emit(`session:${sessionId}:batch_complete`, notification);
  }

  /**
   * Subscribe to urgent issues for a specific session
   */
  onUrgentIssue(sessionId: string, callback: (notification: UrgentIssueNotification) => void): void {
    this.on(`session:${sessionId}:urgent_issue`, callback);
  }

  /**
   * Subscribe to link validation completion for a specific session
   */
  onLinkValidationComplete(sessionId: string, callback: (notification: LinkValidationCompleteNotification) => void): void {
    this.on(`session:${sessionId}:link_validation_complete`, callback);
  }

  /**
   * Subscribe to batch completion for a specific session
   */
  onBatchComplete(sessionId: string, callback: (notification: BatchCompleteNotification) => void): void {
    this.on(`session:${sessionId}:batch_complete`, callback);
  }

  /**
   * Subscribe to all notifications for a specific session
   */
  onSessionNotification(sessionId: string, callback: (notification: NotificationTypes) => void): void {
    this.onUrgentIssue(sessionId, callback);
    this.onLinkValidationComplete(sessionId, callback);
    this.onBatchComplete(sessionId, callback);
  }

  /**
   * Unsubscribe from all notifications for a specific session
   */
  offSessionNotification(sessionId: string): void {
    this.removeAllListeners(`session:${sessionId}:urgent_issue`);
    this.removeAllListeners(`session:${sessionId}:link_validation_complete`);
    this.removeAllListeners(`session:${sessionId}:batch_complete`);
  }

  /**
   * Get notification statistics for monitoring
   */
  getNotificationStats(): {
    totalListeners: number;
    eventNames: string[];
    maxListeners: number;
  } {
    const eventNames = this.eventNames() as string[];
    let totalListeners = 0;
    
    // Count all listeners across all events
    eventNames.forEach(eventName => {
      totalListeners += this.listenerCount(eventName);
    });

    return {
      totalListeners,
      eventNames,
      maxListeners: this.getMaxListeners()
    };
  }

  /**
   * Check if an issue is considered urgent
   */
  private isUrgentIssue(issue: Issue): boolean {
    return this.urgentSeverities.includes(issue.severity) || 
           (issue.type === 'broken_link' && issue.severity === 'medium' && 
            issue.description.includes('404'));
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.removeAllListeners();
    this.logger.info('NotificationService destroyed');
  }
}

// Singleton instance for global use
export const notificationService = new NotificationService();