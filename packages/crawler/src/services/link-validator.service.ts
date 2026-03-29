import axios, { AxiosResponse, AxiosError } from 'axios';
import { Link, Issue } from '@enterprise-web-crawler/shared';
import { Logger } from '../utils/logger';

export interface LinkValidationResult {
  link: Link;
  issues: Issue[];
  validationTime: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface LinkValidatorConfig {
  timeout: number;
  userAgent: string;
  retryConfig: RetryConfig;
  concurrency: number;
}

export class LinkValidator {
  private logger: Logger;
  private config: LinkValidatorConfig;

  constructor(config: Partial<LinkValidatorConfig> = {}) {
    this.logger = new Logger('LinkValidator');
    this.config = {
      timeout: 10000,
      userAgent: 'Enterprise-Web-Crawler/1.0',
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      },
      concurrency: 10,
      ...config
    };
  }

  /**
   * Validate a single link and return validation result
   */
  async validateLink(link: Link): Promise<LinkValidationResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const response = await this.makeRequestWithRetry(link.url);
      
      // Update link status based on response
      link.httpStatus = response.status;
      
      if (response.status >= 200 && response.status < 300) {
        link.status = 'valid';
      } else if (response.status >= 300 && response.status < 400) {
        link.status = 'redirect';
        link.redirectUrl = response.headers.location;
        
        // Add redirect issue if it's a permanent redirect
        if (response.status === 301 || response.status === 308) {
          issues.push(this.createIssue(
            'broken_link',
            'medium',
            `Permanent redirect detected (${response.status})`,
            link.url
          ));
        }
      } else {
        link.status = 'broken';
        issues.push(this.createIssue(
          'broken_link',
          this.categorizeSeverity(response.status),
          `HTTP ${response.status}: ${this.getStatusMessage(response.status)}`,
          link.url
        ));
      }
    } catch (error) {
      link.status = 'broken';
      link.httpStatus = this.extractHttpStatus(error);
      
      const issue = this.createIssueFromError(error, link.url);
      issues.push(issue);
    }

    const validationTime = Date.now() - startTime;
    
    return {
      link,
      issues,
      validationTime
    };
  }

  /**
   * Validate multiple links with concurrency control
   */
  async validateLinks(links: Link[]): Promise<LinkValidationResult[]> {
    const results: LinkValidationResult[] = [];
    const batches = this.createBatches(links, this.config.concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(link => this.validateLink(link));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Handle validation failure
          const link = batch[index];
          link.status = 'broken';
          results.push({
            link,
            issues: [this.createIssue(
              'broken_link',
              'high',
              `Validation failed: ${result.reason.message}`,
              link.url
            )],
            validationTime: 0
          });
        }
      });
    }

    return results;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequestWithRetry(url: string): Promise<AxiosResponse> {
    const { maxRetries, baseDelay, maxDelay, backoffMultiplier } = this.config.retryConfig;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: this.config.timeout,
          headers: {
            'User-Agent': this.config.userAgent
          },
          validateStatus: () => true, // Don't throw on HTTP error status
          maxRedirects: 5
        });

        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (!this.shouldRetry(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(
            baseDelay * Math.pow(backoffMultiplier, attempt),
            maxDelay
          );
          
          this.logger.warn(`Request failed for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Retry on network errors
      if (axiosError.code === 'ECONNRESET' || 
          axiosError.code === 'ECONNREFUSED' ||
          axiosError.code === 'ETIMEDOUT' ||
          axiosError.code === 'ENOTFOUND') {
        return true;
      }

      // Retry on 5xx server errors
      if (axiosError.response && axiosError.response.status >= 500) {
        return true;
      }

      // Retry on 429 (Too Many Requests)
      if (axiosError.response && axiosError.response.status === 429) {
        return true;
      }
    }

    return false;
  }

  /**
   * Categorize issue severity based on HTTP status code
   */
  private categorizeSeverity(httpStatus: number): Issue['severity'] {
    if (httpStatus === 404) {
      return 'critical'; // Not found - critical for user experience
    } else if (httpStatus === 403 || httpStatus === 401) {
      return 'high'; // Access denied
    } else if (httpStatus >= 500) {
      return 'high'; // Server errors
    } else if (httpStatus >= 400) {
      return 'medium'; // Other client errors
    }
    
    return 'low';
  }

  /**
   * Create an issue from an error
   */
  private createIssueFromError(error: any, url: string): Issue {
    let severity: Issue['severity'] = 'high';
    let description = 'Unknown error occurred';

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.code === 'ENOTFOUND') {
        severity = 'critical';
        description = 'Domain not found (DNS resolution failed)';
      } else if (axiosError.code === 'ECONNREFUSED') {
        severity = 'critical';
        description = 'Connection refused';
      } else if (axiosError.code === 'ETIMEDOUT') {
        severity = 'high';
        description = 'Request timeout';
      } else if (axiosError.message) {
        description = axiosError.message;
      }
    } else if (error.message) {
      description = error.message;
    }

    return this.createIssue('broken_link', severity, description, url);
  }

  /**
   * Create an issue object
   */
  private createIssue(
    type: Issue['type'],
    severity: Issue['severity'],
    description: string,
    url: string
  ): Issue {
    return {
      id: this.generateIssueId(),
      type,
      severity,
      description,
      element: url,
      remediation: this.getRemediation(type, severity, description)
    };
  }

  /**
   * Get remediation advice for an issue
   */
  private getRemediation(type: Issue['type'], severity: Issue['severity'], description: string): string {
    if (type === 'broken_link') {
      if (description.includes('404') || description.includes('Not Found')) {
        return 'Update or remove the broken link. Check if the target page has moved to a new URL.';
      } else if (description.includes('Domain not found') || description.includes('DNS')) {
        return 'Verify the domain name is correct and the website is accessible.';
      } else if (description.includes('timeout')) {
        return 'Check if the target server is responding slowly. Consider increasing timeout or contacting the site owner.';
      } else if (description.includes('Permanent redirect')) {
        return 'Update the link to point directly to the final destination to improve performance.';
      }
    }
    
    return 'Review the link and fix the underlying issue.';
  }

  /**
   * Extract HTTP status from error
   */
  private extractHttpStatus(error: any): number | undefined {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.status;
    }
    return undefined;
  }

  /**
   * Get human-readable status message
   */
  private getStatusMessage(status: number): string {
    const statusMessages: { [key: number]: string } = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      408: 'Request Timeout',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };

    return statusMessages[status] || 'Unknown Status';
  }

  /**
   * Create batches for concurrent processing
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

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}