import { Issue } from '@enterprise-web-crawler/shared';
import { BaseRepository, QueryOptions } from './base.repository';

export class IssueRepository extends BaseRepository<Issue> {
  constructor() {
    super('issues');
  }

  /**
   * Map database row to Issue entity
   */
  protected mapRowToEntity(row: any): Issue {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      description: row.description,
      element: row.element,
      wcagGuideline: row.wcag_guideline,
      remediation: row.remediation
    };
  }

  /**
   * Create a new issue
   */
  async createIssue(crawlResultId: string, data: Omit<Issue, 'id'>): Promise<Issue> {
    const query = `
      INSERT INTO issues (
        crawl_result_id, type, severity, description,
        element, wcag_guideline, remediation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      crawlResultId,
      data.type,
      data.severity,
      data.description,
      data.element,
      data.wcagGuideline,
      data.remediation
    ];

    const result = await this.executeQuery(query, values);
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Create multiple issues for a crawl result
   */
  async createMany(crawlResultId: string, issues: Omit<Issue, 'id'>[]): Promise<Issue[]> {
    if (issues.length === 0) {
      return [];
    }

    return this.transaction(async (client) => {
      const createdIssues: Issue[] = [];

      for (const issue of issues) {
        const createdIssue = await this.createIssue(crawlResultId, issue);
        createdIssues.push(createdIssue);
      }

      return createdIssues;
    });
  }

  /**
   * Find issues by crawl result ID
   */
  async findByCrawlResultId(crawlResultId: string): Promise<Issue[]> {
    const query = `
      SELECT * FROM issues
      WHERE crawl_result_id = $1
      ORDER BY severity DESC, type ASC
    `;

    const result = await this.executeQuery(query, [crawlResultId]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find issues by session ID
   */
  async findBySessionId(sessionId: string, options?: QueryOptions): Promise<Issue[]> {
    let query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;

    const params = [sessionId];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY i.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY i.severity DESC, i.type ASC`;
    }

    // Add pagination
    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find issues by type
   */
  async findByType(sessionId: string, type: Issue['type']): Promise<Issue[]> {
    const query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND i.type = $2
      ORDER BY i.severity DESC
    `;

    const result = await this.executeQuery(query, [sessionId, type]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find issues by severity
   */
  async findBySeverity(sessionId: string, severity: Issue['severity']): Promise<Issue[]> {
    const query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND i.severity = $2
      ORDER BY i.type ASC
    `;

    const result = await this.executeQuery(query, [sessionId, severity]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find accessibility issues by WCAG guideline
   */
  async findByWcagGuideline(sessionId: string, guideline: string): Promise<Issue[]> {
    const query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND i.wcag_guideline = $2
      ORDER BY i.severity DESC
    `;

    const result = await this.executeQuery(query, [sessionId, guideline]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Get issue statistics for a session
   */
  async getSessionIssueStats(sessionId: string): Promise<{
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    brokenLinkIssues: number;
    accessibilityIssues: number;
    missingImageIssues: number;
    performanceIssues: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_issues,
        COUNT(CASE WHEN i.severity = 'critical' THEN 1 END) as critical_issues,
        COUNT(CASE WHEN i.severity = 'high' THEN 1 END) as high_issues,
        COUNT(CASE WHEN i.severity = 'medium' THEN 1 END) as medium_issues,
        COUNT(CASE WHEN i.severity = 'low' THEN 1 END) as low_issues,
        COUNT(CASE WHEN i.type = 'broken_link' THEN 1 END) as broken_link_issues,
        COUNT(CASE WHEN i.type = 'accessibility' THEN 1 END) as accessibility_issues,
        COUNT(CASE WHEN i.type = 'missing_image' THEN 1 END) as missing_image_issues,
        COUNT(CASE WHEN i.type = 'performance' THEN 1 END) as performance_issues
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;

    const result = await this.executeQuery(query, [sessionId]);
    const row = result.rows[0];

    return {
      totalIssues: parseInt(row.total_issues, 10),
      criticalIssues: parseInt(row.critical_issues, 10),
      highIssues: parseInt(row.high_issues, 10),
      mediumIssues: parseInt(row.medium_issues, 10),
      lowIssues: parseInt(row.low_issues, 10),
      brokenLinkIssues: parseInt(row.broken_link_issues, 10),
      accessibilityIssues: parseInt(row.accessibility_issues, 10),
      missingImageIssues: parseInt(row.missing_image_issues, 10),
      performanceIssues: parseInt(row.performance_issues, 10)
    };
  }

  /**
   * Search issues by description
   */
  async searchIssues(sessionId: string, searchTerm: string, options?: QueryOptions): Promise<Issue[]> {
    let query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1 
      AND (
        i.description ILIKE $2
        OR i.element ILIKE $2
        OR i.remediation ILIKE $2
      )
    `;

    const params = [sessionId, `%${searchTerm}%`];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY i.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY i.severity DESC, i.type ASC`;
    }

    // Add pagination
    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Get top WCAG violations
   */
  async getTopWcagViolations(sessionId: string, limit: number = 10): Promise<{
    guideline: string;
    count: number;
    severity: string;
  }[]> {
    const query = `
      SELECT 
        i.wcag_guideline as guideline,
        COUNT(*) as count,
        i.severity
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1 
      AND i.type = 'accessibility'
      AND i.wcag_guideline IS NOT NULL
      GROUP BY i.wcag_guideline, i.severity
      ORDER BY count DESC, i.severity DESC
      LIMIT $2
    `;

    const result = await this.executeQuery(query, [sessionId, limit]);
    
    return result.rows.map(row => ({
      guideline: row.guideline,
      count: parseInt(row.count, 10),
      severity: row.severity
    }));
  }

  /**
   * Find issues by result ID with pagination
   */
  async findByResultId(resultId: string, options?: QueryOptions): Promise<Issue[]> {
    let query = `
      SELECT * FROM issues
      WHERE crawl_result_id = $1
    `;

    const params = [resultId];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY ${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY severity DESC, type ASC`;
    }

    // Add pagination
    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Count issues by result ID
   */
  async countByResultId(resultId: string): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM issues WHERE crawl_result_id = $1`;
    const result = await this.executeQuery(query, [resultId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Count issues by session ID
   */
  async countBySessionId(sessionId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;
    const result = await this.executeQuery(query, [sessionId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Search issues by description
   */
  async searchByDescription(searchTerm: string, sessionId?: string, options?: QueryOptions): Promise<Issue[]> {
    let query = `
      SELECT i.*
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE (
        i.description ILIKE $1
        OR i.element ILIKE $1
        OR i.remediation ILIKE $1
      )
    `;

    const params = [`%${searchTerm}%`];
    let paramIndex = 2;

    if (sessionId) {
      query += ` AND cr.session_id = $${paramIndex++}`;
      params.push(sessionId);
    }

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY i.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY i.severity DESC, i.type ASC`;
    }

    // Add pagination
    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Count search results by description
   */
  async countSearchByDescription(searchTerm: string, sessionId?: string): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM issues i
      INNER JOIN crawl_results cr ON i.crawl_result_id = cr.id
      WHERE (
        i.description ILIKE $1
        OR i.element ILIKE $1
        OR i.remediation ILIKE $1
      )
    `;

    const params = [`%${searchTerm}%`];

    if (sessionId) {
      query += ` AND cr.session_id = $2`;
      params.push(sessionId);
    }

    const result = await this.executeQuery(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Delete issues by crawl result ID
   */
  async deleteByCrawlResultId(crawlResultId: string): Promise<number> {
    const query = `DELETE FROM issues WHERE crawl_result_id = $1`;
    const result = await this.executeQuery(query, [crawlResultId]);
    return result.rowCount;
  }
}