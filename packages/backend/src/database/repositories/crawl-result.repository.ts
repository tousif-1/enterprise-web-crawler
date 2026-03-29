import { CrawlResult, Issue } from '@enterprise-web-crawler/shared';
import { BaseRepository, QueryOptions } from './base.repository';

export class CrawlResultRepository extends BaseRepository<CrawlResult> {
  constructor() {
    super('crawl_results');
  }

  /**
   * Map database row to CrawlResult entity
   */
  protected mapRowToEntity(row: any): CrawlResult {
    return {
      id: row.id,
      sessionId: row.session_id,
      url: row.url,
      status: row.status,
      httpStatus: row.http_status,
      responseTime: row.response_time,
      contentHash: row.content_hash,
      lastModified: row.last_modified,
      issues: [], // Issues will be loaded separately
      accessibilityScore: row.accessibility_score ? parseFloat(row.accessibility_score) : 0,
      createdAt: row.created_at
    };
  }

  /**
   * Create a new crawl result
   */
  async create(data: Omit<CrawlResult, 'id' | 'createdAt' | 'issues'>): Promise<CrawlResult> {
    const query = `
      INSERT INTO crawl_results (
        session_id, url, status, http_status, response_time,
        content_hash, last_modified, accessibility_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      data.sessionId,
      data.url,
      data.status,
      data.httpStatus,
      data.responseTime,
      data.contentHash,
      data.lastModified,
      data.accessibilityScore
    ];

    const result = await this.executeQuery(query, values);
    return this.mapRowToEntity(result.rows[0]);
  }



  /**
   * Search crawl results by URL
   */
  async searchByUrl(searchTerm: string, sessionId?: string, options?: QueryOptions): Promise<CrawlResult[]> {
    let query = `
      SELECT * FROM crawl_results
      WHERE url ILIKE $1
    `;
    const params: any[] = [`%${searchTerm}%`];
    let paramIndex = 2;

    if (sessionId) {
      query += ` AND session_id = $${paramIndex++}`;
      params.push(sessionId);
    }

    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY ${options.orderBy} ${direction}`;
    }

    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit.toString());
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset.toString());
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Count search results by URL
   */
  async countSearchByUrl(searchTerm: string, sessionId?: string): Promise<number> {
    let query = `
      SELECT COUNT(*) as count FROM crawl_results
      WHERE url ILIKE $1
    `;
    const params: any[] = [`%${searchTerm}%`];

    if (sessionId) {
      query += ` AND session_id = $2`;
      params.push(sessionId);
    }

    const result = await this.executeQuery(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Find results by session ID with pagination
   */
  async findBySessionId(sessionId: string, options?: QueryOptions): Promise<CrawlResult[]> {
    return this.findAll({ session_id: sessionId }, options);
  }

  /**
   * Find results with issues
   */
  async findResultsWithIssues(sessionId: string, options?: QueryOptions): Promise<CrawlResult[]> {
    let query = `
      SELECT DISTINCT cr.*
      FROM crawl_results cr
      INNER JOIN issues i ON cr.id = i.crawl_result_id
      WHERE cr.session_id = $1
    `;

    const params = [sessionId];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY cr.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY cr.created_at DESC`;
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
   * Find results by URL pattern
   */
  async findByUrlPattern(sessionId: string, urlPattern: string): Promise<CrawlResult[]> {
    const query = `
      SELECT * FROM crawl_results
      WHERE session_id = $1 AND url ILIKE $2
      ORDER BY created_at DESC
    `;

    const result = await this.executeQuery(query, [sessionId, `%${urlPattern}%`]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find results by status
   */
  async findByStatus(sessionId: string, status: CrawlResult['status']): Promise<CrawlResult[]> {
    return this.findAll({ session_id: sessionId, status }, { orderBy: 'created_at', orderDirection: 'DESC' });
  }

  /**
   * Get results with full issue details
   */
  async findWithIssues(sessionId: string, options?: QueryOptions): Promise<CrawlResult[]> {
    let query = `
      SELECT 
        cr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', i.id,
              'type', i.type,
              'severity', i.severity,
              'description', i.description,
              'element', i.element,
              'wcagGuideline', i.wcag_guideline,
              'remediation', i.remediation
            )
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) as issues
      FROM crawl_results cr
      LEFT JOIN issues i ON cr.id = i.crawl_result_id
      WHERE cr.session_id = $1
      GROUP BY cr.id
    `;

    const params = [sessionId];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY cr.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY cr.created_at DESC`;
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
    
    return result.rows.map(row => ({
      ...this.mapRowToEntity(row),
      issues: Array.isArray(row.issues) ? row.issues : []
    }));
  }

  /**
   * Update accessibility score
   */
  async updateAccessibilityScore(id: string, score: number): Promise<CrawlResult | null> {
    const query = `
      UPDATE crawl_results
      SET accessibility_score = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, [id, score]);
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find results by content hash (for change detection)
   */
  async findByContentHash(contentHash: string): Promise<CrawlResult[]> {
    return this.findAll({ content_hash: contentHash });
  }

  /**
   * Get session summary statistics
   */
  async getSessionSummary(sessionId: string): Promise<{
    totalResults: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    averageResponseTime: number;
    averageAccessibilityScore: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_results,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_count,
        COALESCE(AVG(response_time), 0) as average_response_time,
        COALESCE(AVG(accessibility_score), 0) as average_accessibility_score
      FROM crawl_results
      WHERE session_id = $1
    `;

    const result = await this.executeQuery(query, [sessionId]);
    const row = result.rows[0];

    return {
      totalResults: parseInt(row.total_results, 10),
      successCount: parseInt(row.success_count, 10),
      failedCount: parseInt(row.failed_count, 10),
      skippedCount: parseInt(row.skipped_count, 10),
      averageResponseTime: parseFloat(row.average_response_time),
      averageAccessibilityScore: parseFloat(row.average_accessibility_score)
    };
  }

  /**
   * Search results by URL or content
   */
  async searchResults(sessionId: string, searchTerm: string, options?: QueryOptions): Promise<CrawlResult[]> {
    let query = `
      SELECT cr.*
      FROM crawl_results cr
      WHERE cr.session_id = $1 
      AND (
        cr.url ILIKE $2
        OR EXISTS (
          SELECT 1 FROM issues i 
          WHERE i.crawl_result_id = cr.id 
          AND i.description ILIKE $2
        )
      )
    `;

    const params = [sessionId, `%${searchTerm}%`];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY cr.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY cr.created_at DESC`;
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
}