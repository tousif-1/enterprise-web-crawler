import { CrawlSession, CrawlResult, Issue } from '@enterprise-web-crawler/shared';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../database/repositories/crawl-result.repository';
import { IssueRepository } from '../database/repositories/issue.repository';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ReportData {
  session: CrawlSession;
  summary: SessionSummary;
  results: CrawlResult[];
  issues: Issue[];
  trends?: TrendData;
}

export interface SessionSummary {
  totalResults: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  averageResponseTime: number;
  averageAccessibilityScore: number;
  issueStats: IssueStats;
}

export interface IssueStats {
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  brokenLinkIssues: number;
  accessibilityIssues: number;
  missingImageIssues: number;
  performanceIssues: number;
}

export interface TrendData {
  previousSession?: CrawlSession;
  comparison: {
    totalResultsChange: number;
    successRateChange: number;
    averageScoreChange: number;
    issueCountChange: number;
  };
}

export interface ReportOptions {
  includeDetails?: boolean;
  includeTrends?: boolean;
  format?: 'summary' | 'detailed';
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export class ReportService {
  private crawlSessionRepo: CrawlSessionRepository;
  private crawlResultRepo: CrawlResultRepository;
  private issueRepo: IssueRepository;

  constructor() {
    this.crawlSessionRepo = new CrawlSessionRepository();
    this.crawlResultRepo = new CrawlResultRepository();
    this.issueRepo = new IssueRepository();
  }

  /**
   * Generate comprehensive report data for a session
   */
  async generateReportData(sessionId: string, options: ReportOptions = {}): Promise<ReportData> {
    try {
      logger.info(`Generating report data for session ${sessionId}`);

      // Get session details
      const session = await this.crawlSessionRepo.findById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Get session summary
      const summary = await this.getSessionSummary(sessionId);

      // Get results based on options
      const results = options.includeDetails 
        ? await this.crawlResultRepo.findWithIssues(sessionId)
        : await this.crawlResultRepo.findBySessionId(sessionId, { limit: 100 });

      // Get issues
      const issues = await this.issueRepo.findBySessionId(sessionId, { 
        orderBy: 'severity',
        orderDirection: 'DESC'
      });

      // Get trend data if requested
      let trends: TrendData | undefined;
      if (options.includeTrends) {
        trends = await this.getTrendData(sessionId, session.userId);
      }

      const reportData: ReportData = {
        session,
        summary,
        results,
        issues,
        trends
      };

      logger.info(`Report data generated successfully for session ${sessionId}`);
      return reportData;

    } catch (error) {
      logger.error(`Error generating report data for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session summary statistics
   */
  private async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const [resultSummary, issueStats] = await Promise.all([
      this.crawlResultRepo.getSessionSummary(sessionId),
      this.issueRepo.getSessionIssueStats(sessionId)
    ]);

    // Handle case where no results exist for the session
    const defaultSummary = {
      totalResults: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      averageResponseTime: 0,
      averageAccessibilityScore: 0
    };

    const summary = resultSummary || defaultSummary;

    return {
      totalResults: summary.totalResults,
      successCount: summary.successCount,
      failedCount: summary.failedCount,
      skippedCount: summary.skippedCount,
      averageResponseTime: summary.averageResponseTime,
      averageAccessibilityScore: summary.averageAccessibilityScore,
      issueStats
    };
  }

  /**
   * Get trend data by comparing with previous session
   */
  private async getTrendData(sessionId: string, userId: string): Promise<TrendData | undefined> {
    try {
      // Find previous completed session for the same user
      const userSessions = await this.crawlSessionRepo.findByUserId(userId, {
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit: 10
      });

      const currentSessionIndex = userSessions.findIndex(s => s.id === sessionId);
      const previousSession = userSessions[currentSessionIndex + 1];

      if (!previousSession) {
        return undefined;
      }

      // Get summaries for comparison
      const [currentSummary, previousSummary] = await Promise.all([
        this.getSessionSummary(sessionId),
        this.getSessionSummary(previousSession.id)
      ]);

      const comparison = {
        totalResultsChange: currentSummary.totalResults - previousSummary.totalResults,
        successRateChange: (currentSummary.successCount / currentSummary.totalResults) - 
                          (previousSummary.successCount / previousSummary.totalResults),
        averageScoreChange: currentSummary.averageAccessibilityScore - previousSummary.averageAccessibilityScore,
        issueCountChange: currentSummary.issueStats.totalIssues - previousSummary.issueStats.totalIssues
      };

      return {
        previousSession,
        comparison
      };

    } catch (error) {
      logger.warn(`Could not generate trend data for session ${sessionId}:`, error);
      return undefined;
    }
  }

  /**
   * Generate CSV report
   */
  async generateCSVReport(sessionId: string, options: ReportOptions = {}): Promise<string> {
    try {
      logger.info(`Generating CSV report for session ${sessionId}`);

      const reportData = await this.generateReportData(sessionId, options);
      
      // Create CSV content
      let csvContent = '';

      // Session summary
      csvContent += 'Session Summary\n';
      csvContent += `Session ID,${reportData.session.id}\n`;
      csvContent += `Session Name,${reportData.session.name}\n`;
      csvContent += `Status,${reportData.session.status}\n`;
      csvContent += `Start Time,${reportData.session.startTime.toISOString()}\n`;
      csvContent += `End Time,${reportData.session.endTime?.toISOString() || 'N/A'}\n`;
      csvContent += `Total URLs,${reportData.summary.totalResults}\n`;
      csvContent += `Successful,${reportData.summary.successCount}\n`;
      csvContent += `Failed,${reportData.summary.failedCount}\n`;
      csvContent += `Skipped,${reportData.summary.skippedCount}\n`;
      csvContent += `Average Response Time,${reportData.summary.averageResponseTime.toFixed(2)}ms\n`;
      csvContent += `Average Accessibility Score,${reportData.summary.averageAccessibilityScore.toFixed(2)}\n`;
      csvContent += '\n';

      // Issue summary
      csvContent += 'Issue Summary\n';
      csvContent += `Total Issues,${reportData.summary.issueStats.totalIssues}\n`;
      csvContent += `Critical Issues,${reportData.summary.issueStats.criticalIssues}\n`;
      csvContent += `High Issues,${reportData.summary.issueStats.highIssues}\n`;
      csvContent += `Medium Issues,${reportData.summary.issueStats.mediumIssues}\n`;
      csvContent += `Low Issues,${reportData.summary.issueStats.lowIssues}\n`;
      csvContent += `Broken Link Issues,${reportData.summary.issueStats.brokenLinkIssues}\n`;
      csvContent += `Accessibility Issues,${reportData.summary.issueStats.accessibilityIssues}\n`;
      csvContent += `Missing Image Issues,${reportData.summary.issueStats.missingImageIssues}\n`;
      csvContent += `Performance Issues,${reportData.summary.issueStats.performanceIssues}\n`;
      csvContent += '\n';

      // Crawl results
      if (options.includeDetails) {
        csvContent += 'Crawl Results\n';
        csvContent += 'URL,Status,HTTP Status,Response Time (ms),Accessibility Score,Issues Count\n';
        
        for (const result of reportData.results) {
          csvContent += `"${result.url}",${result.status},${result.httpStatus},${result.responseTime},${result.accessibilityScore},${result.issues.length}\n`;
        }
        csvContent += '\n';

        // Issues details
        csvContent += 'Issues Details\n';
        csvContent += 'URL,Type,Severity,Description,Element,WCAG Guideline,Remediation\n';
        
        for (const result of reportData.results) {
          for (const issue of result.issues) {
            csvContent += `"${result.url}","${issue.type}","${issue.severity}","${issue.description}","${issue.element || ''}","${issue.wcagGuideline || ''}","${issue.remediation || ''}"\n`;
          }
        }
      }

      // Trend data
      if (reportData.trends) {
        csvContent += '\nTrend Analysis\n';
        csvContent += `Previous Session,${reportData.trends.previousSession?.name || 'N/A'}\n`;
        csvContent += `Total Results Change,${reportData.trends.comparison.totalResultsChange}\n`;
        csvContent += `Success Rate Change,${(reportData.trends.comparison.successRateChange * 100).toFixed(2)}%\n`;
        csvContent += `Average Score Change,${reportData.trends.comparison.averageScoreChange.toFixed(2)}\n`;
        csvContent += `Issue Count Change,${reportData.trends.comparison.issueCountChange}\n`;
      }

      logger.info(`CSV report generated successfully for session ${sessionId}`);
      return csvContent;

    } catch (error) {
      logger.error(`Error generating CSV report for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(sessionId: string, options: ReportOptions = {}): Promise<string> {
    try {
      logger.info(`Generating HTML report for session ${sessionId}`);

      const reportData = await this.generateReportData(sessionId, options);
      
      // Create HTML content
      let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crawl Report - ${reportData.session.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; border: 1px solid #ddd; border-radius: 5px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #333; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-value { font-weight: bold; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .table th { background-color: #f2f2f2; }
        .severity-critical { background-color: #f8d7da; }
        .severity-high { background-color: #fff3cd; }
        .severity-medium { background-color: #d1ecf1; }
        .severity-low { background-color: #d4edda; }
        .trend-positive { color: #28a745; }
        .trend-negative { color: #dc3545; }
        .trend-neutral { color: #6c757d; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Web Crawl Report</h1>
        <h2>${reportData.session.name}</h2>
        <p><strong>Session ID:</strong> ${reportData.session.id}</p>
        <p><strong>Status:</strong> ${reportData.session.status}</p>
        <p><strong>Start Time:</strong> ${reportData.session.startTime.toLocaleString()}</p>
        <p><strong>End Time:</strong> ${reportData.session.endTime?.toLocaleString() || 'N/A'}</p>
    </div>

    <div class="summary">
        <div class="card">
            <h3>Crawl Results</h3>
            <div class="metric">
                <span>Total URLs:</span>
                <span class="metric-value">${reportData.summary.totalResults}</span>
            </div>
            <div class="metric">
                <span>Successful:</span>
                <span class="metric-value success">${reportData.summary.successCount}</span>
            </div>
            <div class="metric">
                <span>Failed:</span>
                <span class="metric-value danger">${reportData.summary.failedCount}</span>
            </div>
            <div class="metric">
                <span>Skipped:</span>
                <span class="metric-value warning">${reportData.summary.skippedCount}</span>
            </div>
        </div>

        <div class="card">
            <h3>Performance</h3>
            <div class="metric">
                <span>Avg Response Time:</span>
                <span class="metric-value">${reportData.summary.averageResponseTime.toFixed(2)}ms</span>
            </div>
            <div class="metric">
                <span>Avg Accessibility Score:</span>
                <span class="metric-value">${reportData.summary.averageAccessibilityScore.toFixed(2)}</span>
            </div>
        </div>

        <div class="card">
            <h3>Issues Summary</h3>
            <div class="metric">
                <span>Total Issues:</span>
                <span class="metric-value">${reportData.summary.issueStats.totalIssues}</span>
            </div>
            <div class="metric">
                <span>Critical:</span>
                <span class="metric-value danger">${reportData.summary.issueStats.criticalIssues}</span>
            </div>
            <div class="metric">
                <span>High:</span>
                <span class="metric-value warning">${reportData.summary.issueStats.highIssues}</span>
            </div>
            <div class="metric">
                <span>Medium:</span>
                <span class="metric-value">${reportData.summary.issueStats.mediumIssues}</span>
            </div>
            <div class="metric">
                <span>Low:</span>
                <span class="metric-value success">${reportData.summary.issueStats.lowIssues}</span>
            </div>
        </div>

        <div class="card">
            <h3>Issue Types</h3>
            <div class="metric">
                <span>Broken Links:</span>
                <span class="metric-value">${reportData.summary.issueStats.brokenLinkIssues}</span>
            </div>
            <div class="metric">
                <span>Accessibility:</span>
                <span class="metric-value">${reportData.summary.issueStats.accessibilityIssues}</span>
            </div>
            <div class="metric">
                <span>Missing Images:</span>
                <span class="metric-value">${reportData.summary.issueStats.missingImageIssues}</span>
            </div>
            <div class="metric">
                <span>Performance:</span>
                <span class="metric-value">${reportData.summary.issueStats.performanceIssues}</span>
            </div>
        </div>
    </div>
`;

      // Add trend analysis if available
      if (reportData.trends) {
        htmlContent += `
    <div class="card">
        <h3>Trend Analysis</h3>
        <p><strong>Compared to:</strong> ${reportData.trends.previousSession?.name || 'Previous session'}</p>
        <div class="metric">
            <span>Total Results Change:</span>
            <span class="metric-value ${reportData.trends.comparison.totalResultsChange >= 0 ? 'trend-positive' : 'trend-negative'}">
                ${reportData.trends.comparison.totalResultsChange >= 0 ? '+' : ''}${reportData.trends.comparison.totalResultsChange}
            </span>
        </div>
        <div class="metric">
            <span>Success Rate Change:</span>
            <span class="metric-value ${reportData.trends.comparison.successRateChange >= 0 ? 'trend-positive' : 'trend-negative'}">
                ${reportData.trends.comparison.successRateChange >= 0 ? '+' : ''}${(reportData.trends.comparison.successRateChange * 100).toFixed(2)}%
            </span>
        </div>
        <div class="metric">
            <span>Accessibility Score Change:</span>
            <span class="metric-value ${reportData.trends.comparison.averageScoreChange >= 0 ? 'trend-positive' : 'trend-negative'}">
                ${reportData.trends.comparison.averageScoreChange >= 0 ? '+' : ''}${reportData.trends.comparison.averageScoreChange.toFixed(2)}
            </span>
        </div>
        <div class="metric">
            <span>Issue Count Change:</span>
            <span class="metric-value ${reportData.trends.comparison.issueCountChange <= 0 ? 'trend-positive' : 'trend-negative'}">
                ${reportData.trends.comparison.issueCountChange >= 0 ? '+' : ''}${reportData.trends.comparison.issueCountChange}
            </span>
        </div>
    </div>
`;
      }

      // Add detailed results if requested
      if (options.includeDetails && reportData.results.length > 0) {
        htmlContent += `
    <h3>Detailed Results</h3>
    <table class="table">
        <thead>
            <tr>
                <th>URL</th>
                <th>Status</th>
                <th>HTTP Status</th>
                <th>Response Time</th>
                <th>Accessibility Score</th>
                <th>Issues</th>
            </tr>
        </thead>
        <tbody>
`;

        for (const result of reportData.results.slice(0, 100)) { // Limit for performance
          htmlContent += `
            <tr>
                <td><a href="${result.url}" target="_blank">${result.url}</a></td>
                <td class="${result.status === 'success' ? 'success' : result.status === 'failed' ? 'danger' : 'warning'}">${result.status}</td>
                <td>${result.httpStatus}</td>
                <td>${result.responseTime.toFixed(2)}ms</td>
                <td>${result.accessibilityScore.toFixed(2)}</td>
                <td>${result.issues.length}</td>
            </tr>
`;
        }

        htmlContent += `
        </tbody>
    </table>
`;

        // Add top issues
        const topIssues = reportData.issues.slice(0, 50);
        if (topIssues.length > 0) {
          htmlContent += `
    <h3>Top Issues</h3>
    <table class="table">
        <thead>
            <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>WCAG Guideline</th>
                <th>Remediation</th>
            </tr>
        </thead>
        <tbody>
`;

          for (const issue of topIssues) {
            htmlContent += `
            <tr class="severity-${issue.severity}">
                <td>${issue.type}</td>
                <td>${issue.severity}</td>
                <td>${issue.description}</td>
                <td>${issue.wcagGuideline || 'N/A'}</td>
                <td>${issue.remediation || 'N/A'}</td>
            </tr>
`;
          }

          htmlContent += `
        </tbody>
    </table>
`;
        }
      }

      htmlContent += `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
        <p>Report generated on ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
`;

      logger.info(`HTML report generated successfully for session ${sessionId}`);
      return htmlContent;

    } catch (error) {
      logger.error(`Error generating HTML report for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save report to file
   */
  async saveReportToFile(content: string, filename: string, format: 'csv' | 'html'): Promise<string> {
    try {
      const reportsDir = path.join(process.cwd(), 'reports');
      
      // Ensure reports directory exists
      try {
        await fs.access(reportsDir);
      } catch {
        await fs.mkdir(reportsDir, { recursive: true });
      }

      const extension = format === 'csv' ? '.csv' : '.html';
      const filepath = path.join(reportsDir, `${filename}${extension}`);
      
      await fs.writeFile(filepath, content, 'utf8');
      
      logger.info(`Report saved to file: ${filepath}`);
      return filepath;

    } catch (error) {
      logger.error(`Error saving report to file:`, error);
      throw error;
    }
  }

  /**
   * Get historical data for trend analysis
   */
  async getHistoricalData(userId: string, limit: number = 10): Promise<{
    sessions: CrawlSession[];
    summaries: SessionSummary[];
  }> {
    try {
      const sessions = await this.crawlSessionRepo.findByUserId(userId, {
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit
      });

      const summaries = await Promise.all(
        sessions.map(session => this.getSessionSummary(session.id))
      );

      return { sessions, summaries };

    } catch (error) {
      logger.error(`Error getting historical data for user ${userId}:`, error);
      throw error;
    }
  }
}