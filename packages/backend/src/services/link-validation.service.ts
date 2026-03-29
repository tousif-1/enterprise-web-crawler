import { Link, Issue } from '@enterprise-web-crawler/shared';
import { LinkValidator, LinkValidationResult } from '@enterprise-web-crawler/crawler';
import { notificationService } from './notification.service';
import { Logger } from '../utils/logger';

export interface LinkValidationServiceConfig {
  batchSize: number;
  notifyOnUrgentIssues: boolean;
  notifyOnBatchComplete: boolean;
}

export interface ValidationSummary {
  totalLinks: number;
  validLinks: number;
  brokenLinks: number;
  redirectLinks: number;
  pendingLinks: number;
  totalIssues: number;
  criticalIssues: number;
  highSeverityIssues: number;
  mediumSeverityIssues: number;
  lowSeverityIssues: number;
  validationTime: number;
}

export class LinkValidationService {
  private linkValidator: LinkValidator;
  private logger: Logger;
  private config: LinkValidationServiceConfig;

  constructor(config: Partial<LinkValidationServiceConfig> = {}) {
    this.linkValidator = new LinkValidator();
    this.logger = new Logger('LinkValidationService');
    this.config = {
      batchSize: 50,
      notifyOnUrgentIssues: true,
      notifyOnBatchComplete: true,
      ...config
    };
  }

  /**
   * Validate links for a crawl session with real-time notifications
   */
  async validateLinksForSession(sessionId: string, links: Link[]): Promise<ValidationSummary> {
    const startTime = Date.now();
    this.logger.info(`Starting link validation for session ${sessionId} with ${links.length} links`);

    const allResults: LinkValidationResult[] = [];
    const allIssues: Issue[] = [];
    const batches = this.createBatches(links, this.config.batchSize);

    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.debug(`Processing batch ${i + 1}/${batches.length} with ${batch.length} links`);

      try {
        const batchResults = await this.linkValidator.validateLinks(batch);
        allResults.push(...batchResults);

        // Process results and collect issues
        let batchIssuesCount = 0;
        for (const result of batchResults) {
          allIssues.push(...result.issues);
          batchIssuesCount += result.issues.length;

          // Notify about urgent issues
          if (this.config.notifyOnUrgentIssues) {
            for (const issue of result.issues) {
              if (this.isUrgentIssue(issue)) {
                notificationService.notifyUrgentIssue(sessionId, issue, result.link);
              }
            }
          }
        }

        processedCount += batch.length;

        // Notify about batch completion
        if (this.config.notifyOnBatchComplete) {
          notificationService.notifyBatchComplete(
            sessionId,
            batch.length,
            processedCount,
            batchIssuesCount
          );
        }

      } catch (error) {
        this.logger.error(`Error processing batch ${i + 1}:`, error as Error);
        
        // Mark all links in failed batch as broken
        for (const link of batch) {
          link.status = 'broken';
          const issue: Issue = {
            id: this.generateIssueId(),
            type: 'broken_link',
            severity: 'high',
            description: `Batch validation failed: ${(error as Error).message}`,
            element: link.url,
            remediation: 'Retry validation or check network connectivity.'
          };
          allIssues.push(issue);
        }
      }
    }

    const validationTime = Date.now() - startTime;
    const summary = this.generateValidationSummary(allResults, allIssues, validationTime);

    // Notify about overall completion
    notificationService.notifyLinkValidationComplete(
      sessionId,
      summary.totalLinks,
      summary.validLinks,
      summary.brokenLinks,
      allIssues
    );

    this.logger.info(`Link validation completed for session ${sessionId} in ${validationTime}ms`);
    return summary;
  }

  /**
   * Re-validate only failed links from a previous session
   */
  async revalidateFailedLinks(sessionId: string, links: Link[]): Promise<ValidationSummary> {
    const failedLinks = links.filter(link => 
      link.status === 'broken' || link.status === 'pending'
    );

    this.logger.info(`Re-validating ${failedLinks.length} failed links for session ${sessionId}`);
    
    if (failedLinks.length === 0) {
      this.logger.info('No failed links to re-validate');
      return this.generateValidationSummary([], [], 0);
    }

    return this.validateLinksForSession(sessionId, failedLinks);
  }

  /**
   * Validate a single link with immediate notification
   */
  async validateSingleLink(sessionId: string, link: Link): Promise<LinkValidationResult> {
    this.logger.debug(`Validating single link: ${link.url}`);

    const result = await this.linkValidator.validateLink(link);

    // Notify about urgent issues
    if (this.config.notifyOnUrgentIssues) {
      for (const issue of result.issues) {
        if (this.isUrgentIssue(issue)) {
          notificationService.notifyUrgentIssue(sessionId, issue, result.link);
        }
      }
    }

    return result;
  }

  /**
   * Get validation statistics for monitoring
   */
  getValidationStats(): {
    batchSize: number;
    notificationsEnabled: boolean;
  } {
    return {
      batchSize: this.config.batchSize,
      notificationsEnabled: this.config.notifyOnUrgentIssues
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LinkValidationServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Configuration updated', this.config);
  }

  /**
   * Generate validation summary from results
   */
  private generateValidationSummary(
    results: LinkValidationResult[],
    allIssues: Issue[],
    validationTime: number
  ): ValidationSummary {
    const totalLinks = results.length;
    const validLinks = results.filter(r => r.link.status === 'valid').length;
    const brokenLinks = results.filter(r => r.link.status === 'broken').length;
    const redirectLinks = results.filter(r => r.link.status === 'redirect').length;
    const pendingLinks = results.filter(r => r.link.status === 'pending').length;

    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
    const highSeverityIssues = allIssues.filter(i => i.severity === 'high').length;
    const mediumSeverityIssues = allIssues.filter(i => i.severity === 'medium').length;
    const lowSeverityIssues = allIssues.filter(i => i.severity === 'low').length;

    return {
      totalLinks,
      validLinks,
      brokenLinks,
      redirectLinks,
      pendingLinks,
      totalIssues: allIssues.length,
      criticalIssues,
      highSeverityIssues,
      mediumSeverityIssues,
      lowSeverityIssues,
      validationTime
    };
  }

  /**
   * Check if an issue is considered urgent
   */
  private isUrgentIssue(issue: Issue): boolean {
    return issue.severity === 'critical' || 
           issue.severity === 'high' ||
           (issue.type === 'broken_link' && issue.description.includes('404'));
  }

  /**
   * Create batches for processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Generate unique issue ID
   */
  private generateIssueId(): string {
    return `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}