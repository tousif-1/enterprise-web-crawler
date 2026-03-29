import { Link } from '@enterprise-web-crawler/shared';
import { BaseRepository, QueryOptions } from './base.repository';

export class LinkRepository extends BaseRepository<Link> {
  constructor() {
    super('links');
  }

  /**
   * Map database row to Link entity
   */
  protected mapRowToEntity(row: any): Link {
    return {
      url: row.url,
      sourceUrl: row.source_url,
      text: row.text,
      type: row.type,
      status: row.status,
      httpStatus: row.http_status,
      redirectUrl: row.redirect_url
    };
  }

  /**
   * Create a new link
   */
  async createLink(crawlResultId: string, data: Link): Promise<Link> {
    const query = `
      INSERT INTO links (
        crawl_result_id, url, source_url, text, type,
        status, http_status, redirect_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      crawlResultId,
      data.url,
      data.sourceUrl,
      data.text,
      data.type,
      data.status,
      data.httpStatus,
      data.redirectUrl
    ];

    const result = await this.executeQuery(query, values);
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Create multiple links for a crawl result
   */
  async createMany(crawlResultId: string, links: Link[]): Promise<Link[]> {
    if (links.length === 0) {
      return [];
    }

    return this.transaction(async (client) => {
      const createdLinks: Link[] = [];

      for (const link of links) {
        const createdLink = await this.createLink(crawlResultId, link);
        createdLinks.push(createdLink);
      }

      return createdLinks;
    });
  }

  /**
   * Find links by crawl result ID
   */
  async findByCrawlResultId(crawlResultId: string): Promise<Link[]> {
    const query = `
      SELECT * FROM links
      WHERE crawl_result_id = $1
      ORDER BY type ASC, status DESC
    `;

    const result = await this.executeQuery(query, [crawlResultId]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find links by session ID
   */
  async findBySessionId(sessionId: string, options?: QueryOptions): Promise<Link[]> {
    let query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;

    const params = [sessionId];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY l.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY l.type ASC, l.status DESC`;
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
   * Find broken links
   */
  async findBrokenLinks(sessionId: string): Promise<Link[]> {
    const query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND l.status = 'broken'
      ORDER BY l.source_url ASC
    `;

    const result = await this.executeQuery(query, [sessionId]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find links by type
   */
  async findByType(sessionId: string, type: Link['type']): Promise<Link[]> {
    const query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND l.type = $2
      ORDER BY l.status DESC, l.url ASC
    `;

    const result = await this.executeQuery(query, [sessionId, type]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find links by status
   */
  async findByStatus(sessionId: string, status: Link['status']): Promise<Link[]> {
    const query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND l.status = $2
      ORDER BY l.type ASC, l.url ASC
    `;

    const result = await this.executeQuery(query, [sessionId, status]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Update link status
   */
  async updateStatus(
    crawlResultId: string,
    url: string,
    status: Link['status'],
    httpStatus?: number,
    redirectUrl?: string
  ): Promise<Link | null> {
    const query = `
      UPDATE links
      SET status = $3, http_status = $4, redirect_url = $5
      WHERE crawl_result_id = $1 AND url = $2
      RETURNING *
    `;

    const result = await this.executeQuery(query, [
      crawlResultId,
      url,
      status,
      httpStatus,
      redirectUrl
    ]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Get link statistics for a session
   */
  async getSessionLinkStats(sessionId: string): Promise<{
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    validLinks: number;
    brokenLinks: number;
    redirectLinks: number;
    pendingLinks: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN l.type = 'internal' THEN 1 END) as internal_links,
        COUNT(CASE WHEN l.type = 'external' THEN 1 END) as external_links,
        COUNT(CASE WHEN l.status = 'valid' THEN 1 END) as valid_links,
        COUNT(CASE WHEN l.status = 'broken' THEN 1 END) as broken_links,
        COUNT(CASE WHEN l.status = 'redirect' THEN 1 END) as redirect_links,
        COUNT(CASE WHEN l.status = 'pending' THEN 1 END) as pending_links
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;

    const result = await this.executeQuery(query, [sessionId]);
    const row = result.rows[0];

    return {
      totalLinks: parseInt(row.total_links, 10),
      internalLinks: parseInt(row.internal_links, 10),
      externalLinks: parseInt(row.external_links, 10),
      validLinks: parseInt(row.valid_links, 10),
      brokenLinks: parseInt(row.broken_links, 10),
      redirectLinks: parseInt(row.redirect_links, 10),
      pendingLinks: parseInt(row.pending_links, 10)
    };
  }

  /**
   * Find duplicate links across the session
   */
  async findDuplicateLinks(sessionId: string): Promise<{
    url: string;
    count: number;
    sources: string[];
  }[]> {
    const query = `
      SELECT 
        l.url,
        COUNT(*) as count,
        array_agg(DISTINCT l.source_url) as sources
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1
      GROUP BY l.url
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    const result = await this.executeQuery(query, [sessionId]);
    
    return result.rows.map(row => ({
      url: row.url,
      count: parseInt(row.count, 10),
      sources: row.sources
    }));
  }

  /**
   * Search links by URL or text
   */
  async searchLinks(sessionId: string, searchTerm: string, options?: QueryOptions): Promise<Link[]> {
    let query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1 
      AND (
        l.url ILIKE $2
        OR l.text ILIKE $2
        OR l.source_url ILIKE $2
      )
    `;

    const params = [sessionId, `%${searchTerm}%`];

    // Add ordering
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY l.${options.orderBy} ${direction}`;
    } else {
      query += ` ORDER BY l.type ASC, l.status DESC`;
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
   * Get links that need validation (pending status)
   */
  async getPendingValidationLinks(sessionId: string, limit?: number): Promise<Link[]> {
    let query = `
      SELECT l.*
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1 AND l.status = 'pending'
      ORDER BY l.created_at ASC
    `;

    const params = [sessionId];

    if (limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    const result = await this.executeQuery(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Count links by session ID
   */
  async countBySessionId(sessionId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM links l
      INNER JOIN crawl_results cr ON l.crawl_result_id = cr.id
      WHERE cr.session_id = $1
    `;
    const result = await this.executeQuery(query, [sessionId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Delete links by crawl result ID
   */
  async deleteByCrawlResultId(crawlResultId: string): Promise<number> {
    const query = `DELETE FROM links WHERE crawl_result_id = $1`;
    const result = await this.executeQuery(query, [crawlResultId]);
    return result.rowCount;
  }
}