import { CrawlSession } from '@enterprise-web-crawler/shared';
import { BaseRepository, QueryOptions, WhereClause } from './base.repository';

export class CrawlSessionRepository extends BaseRepository<CrawlSession> {
  constructor() {
    super('crawl_sessions');
  }

  /**
   * Map database row to CrawlSession entity
   */
  protected mapRowToEntity(row: any): CrawlSession {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      status: row.status,
      config: row.config,
      startTime: row.start_time,
      endTime: row.end_time,
      progress: {
        totalUrls: row.total_urls || 0,
        processedUrls: row.processed_urls || 0,
        failedUrls: row.failed_urls || 0
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Create a new crawl session
   */
  async create(data: Omit<CrawlSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<CrawlSession> {
    const query = `
      INSERT INTO crawl_sessions (
        user_id, name, status, config, start_time, end_time,
        total_urls, processed_urls, failed_urls
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.userId,
      data.name,
      data.status,
      JSON.stringify(data.config),
      data.startTime,
      data.endTime,
      data.progress.totalUrls,
      data.progress.processedUrls,
      data.progress.failedUrls
    ];

    const result = await this.executeQuery(query, values);
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Update crawl session progress
   */
  async updateProgress(
    id: string,
    progress: { totalUrls?: number; processedUrls?: number; failedUrls?: number }
  ): Promise<CrawlSession | null> {
    const setParts: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (progress.totalUrls !== undefined) {
      setParts.push(`total_urls = $${paramIndex++}`);
      values.push(progress.totalUrls);
    }

    if (progress.processedUrls !== undefined) {
      setParts.push(`processed_urls = $${paramIndex++}`);
      values.push(progress.processedUrls);
    }

    if (progress.failedUrls !== undefined) {
      setParts.push(`failed_urls = $${paramIndex++}`);
      values.push(progress.failedUrls);
    }

    if (setParts.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE crawl_sessions
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, values);
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Update crawl session status
   */
  async updateStatus(id: string, status: CrawlSession['status']): Promise<CrawlSession | null> {
    const query = `
      UPDATE crawl_sessions
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, [id, status]);
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find sessions by user ID
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<CrawlSession[]> {
    return this.findAll({ user_id: userId }, options);
  }

  /**
   * Find active sessions (running or paused)
   */
  async findActiveSessions(): Promise<CrawlSession[]> {
    const query = `
      SELECT * FROM crawl_sessions
      WHERE status IN ('running', 'paused')
      ORDER BY created_at DESC
    `;

    const result = await this.executeQuery(query);
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    totalResults: number;
    successfulResults: number;
    failedResults: number;
    totalIssues: number;
    criticalIssues: number;
  }> {
    const query = `
      SELECT 
        COUNT(cr.id) as total_results,
        COUNT(CASE WHEN cr.status = 'success' THEN 1 END) as successful_results,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) as failed_results,
        COUNT(i.id) as total_issues,
        COUNT(CASE WHEN i.severity = 'critical' THEN 1 END) as critical_issues
      FROM crawl_sessions cs
      LEFT JOIN crawl_results cr ON cs.id = cr.session_id
      LEFT JOIN issues i ON cr.id = i.crawl_result_id
      WHERE cs.id = $1
      GROUP BY cs.id
    `;

    const result = await this.executeQuery(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return {
        totalResults: 0,
        successfulResults: 0,
        failedResults: 0,
        totalIssues: 0,
        criticalIssues: 0
      };
    }

    const row = result.rows[0];
    return {
      totalResults: parseInt(row.total_results, 10),
      successfulResults: parseInt(row.successful_results, 10),
      failedResults: parseInt(row.failed_results, 10),
      totalIssues: parseInt(row.total_issues, 10),
      criticalIssues: parseInt(row.critical_issues, 10)
    };
  }

  /**
   * Complete a crawl session
   */
  async completeCrawlSession(id: string): Promise<CrawlSession | null> {
    const query = `
      UPDATE crawl_sessions
      SET status = 'completed', end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, [id]);
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }
}