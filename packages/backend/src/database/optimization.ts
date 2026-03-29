import { Pool } from 'pg';
import { DatabaseConnection } from './connection';

/**
 * Database optimization utilities for large-scale operations
 */
export class DatabaseOptimization {
  /**
   * Create optimized indexes for large-scale operations
   */
  static async createOptimizedIndexes(): Promise<void> {
    const queries = [
      // Partial indexes for active sessions only
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawl_sessions_active 
       ON crawl_sessions(id, status, updated_at) 
       WHERE status IN ('running', 'pending')`,

      // Covering index for crawl results with most accessed columns
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawl_results_covering 
       ON crawl_results(session_id, status, url, http_status, accessibility_score, created_at)`,

      // Partial index for failed results only
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawl_results_failed 
       ON crawl_results(session_id, url, http_status, created_at) 
       WHERE status = 'failed'`,

      // Partial index for critical issues only
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_critical 
       ON issues(crawl_result_id, type, description, created_at) 
       WHERE severity = 'critical'`,

      // Composite index for link validation queries
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_links_validation 
       ON links(url, status, http_status, type) 
       WHERE status IN ('pending', 'broken')`,

      // Time-based partitioning support index
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawl_results_time_partition 
       ON crawl_results(created_at, session_id) 
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,

      // Hash index for exact content hash lookups
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawl_results_content_hash_exact 
       ON crawl_results USING hash(content_hash) 
       WHERE content_hash IS NOT NULL`
    ];

    for (const query of queries) {
      try {
        console.log('Creating optimized index...');
        await DatabaseConnection.query(query);
        console.log('Index created successfully');
      } catch (error) {
        console.error('Failed to create index:', error);
        // Continue with other indexes even if one fails
      }
    }
  }

  /**
   * Analyze table statistics for query optimization
   */
  static async analyzeTableStatistics(): Promise<void> {
    const tables = [
      'crawl_sessions',
      'crawl_results', 
      'issues',
      'links',
      'reports'
    ];

    for (const table of tables) {
      try {
        await DatabaseConnection.query(`ANALYZE ${table}`);
        console.log(`Analyzed statistics for table: ${table}`);
      } catch (error) {
        console.error(`Failed to analyze table ${table}:`, error);
      }
    }
  }

  /**
   * Get table size and index usage statistics
   */
  static async getTableStatistics(): Promise<any[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation,
        most_common_vals,
        most_common_freqs,
        histogram_bounds
      FROM pg_stats 
      WHERE schemaname = 'public' 
      AND tablename IN ('crawl_sessions', 'crawl_results', 'issues', 'links')
      ORDER BY tablename, attname
    `;

    const result = await DatabaseConnection.query(query);
    return result.rows;
  }

  /**
   * Get index usage statistics
   */
  static async getIndexStatistics(): Promise<any[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read,
        idx_tup_fetch,
        idx_scan,
        idx_blks_read,
        idx_blks_hit
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
    `;

    const result = await DatabaseConnection.query(query);
    return result.rows;
  }

  /**
   * Optimize database configuration for large-scale operations
   */
  static async optimizeConfiguration(): Promise<void> {
    const optimizations = [
      // Increase work memory for complex queries
      "SET work_mem = '256MB'",
      
      // Increase maintenance work memory for index operations
      "SET maintenance_work_mem = '1GB'",
      
      // Optimize for read-heavy workloads
      "SET random_page_cost = 1.1",
      
      // Increase effective cache size
      "SET effective_cache_size = '4GB'",
      
      // Optimize checkpoint settings
      "SET checkpoint_completion_target = 0.9",
      
      // Increase WAL buffers
      "SET wal_buffers = '16MB'",
      
      // Optimize autovacuum for high-volume tables
      "ALTER TABLE crawl_results SET (autovacuum_vacuum_scale_factor = 0.1)",
      "ALTER TABLE issues SET (autovacuum_vacuum_scale_factor = 0.1)",
      "ALTER TABLE links SET (autovacuum_vacuum_scale_factor = 0.1)"
    ];

    for (const optimization of optimizations) {
      try {
        await DatabaseConnection.query(optimization);
        console.log(`Applied optimization: ${optimization}`);
      } catch (error) {
        console.error(`Failed to apply optimization: ${optimization}`, error);
      }
    }
  }

  /**
   * Create materialized views for common aggregations
   */
  static async createMaterializedViews(): Promise<void> {
    const views = [
      // Session summary view
      `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_session_summary AS
       SELECT 
         cs.id,
         cs.name,
         cs.status,
         cs.total_urls,
         cs.processed_urls,
         cs.failed_urls,
         COUNT(DISTINCT cr.id) as actual_results,
         COUNT(DISTINCT CASE WHEN i.severity = 'critical' THEN i.id END) as critical_issues,
         COUNT(DISTINCT CASE WHEN i.severity = 'high' THEN i.id END) as high_issues,
         AVG(cr.accessibility_score) as avg_accessibility_score,
         cs.created_at,
         cs.updated_at
       FROM crawl_sessions cs
       LEFT JOIN crawl_results cr ON cs.id = cr.session_id
       LEFT JOIN issues i ON cr.id = i.crawl_result_id
       GROUP BY cs.id, cs.name, cs.status, cs.total_urls, cs.processed_urls, 
                cs.failed_urls, cs.created_at, cs.updated_at`,

      // Issue summary view
      `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_issue_summary AS
       SELECT 
         i.type,
         i.severity,
         i.wcag_guideline,
         COUNT(*) as issue_count,
         COUNT(DISTINCT cr.session_id) as affected_sessions,
         COUNT(DISTINCT cr.url) as affected_urls
       FROM issues i
       JOIN crawl_results cr ON i.crawl_result_id = cr.id
       GROUP BY i.type, i.severity, i.wcag_guideline`,

      // Link status summary view
      `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_link_summary AS
       SELECT 
         l.status,
         l.type,
         l.http_status,
         COUNT(*) as link_count,
         COUNT(DISTINCT cr.session_id) as sessions_affected
       FROM links l
       JOIN crawl_results cr ON l.crawl_result_id = cr.id
       GROUP BY l.status, l.type, l.http_status`
    ];

    for (const view of views) {
      try {
        await DatabaseConnection.query(view);
        console.log('Created materialized view');
      } catch (error) {
        console.error('Failed to create materialized view:', error);
      }
    }

    // Create indexes on materialized views
    const viewIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_mv_session_summary_status 
       ON mv_session_summary(status)`,
      `CREATE INDEX IF NOT EXISTS idx_mv_issue_summary_type_severity 
       ON mv_issue_summary(type, severity)`,
      `CREATE INDEX IF NOT EXISTS idx_mv_link_summary_status 
       ON mv_link_summary(status, type)`
    ];

    for (const index of viewIndexes) {
      try {
        await DatabaseConnection.query(index);
        console.log('Created materialized view index');
      } catch (error) {
        console.error('Failed to create materialized view index:', error);
      }
    }
  }

  /**
   * Refresh materialized views
   */
  static async refreshMaterializedViews(): Promise<void> {
    const views = ['mv_session_summary', 'mv_issue_summary', 'mv_link_summary'];
    
    for (const view of views) {
      try {
        await DatabaseConnection.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        console.log(`Refreshed materialized view: ${view}`);
      } catch (error) {
        console.error(`Failed to refresh materialized view ${view}:`, error);
      }
    }
  }

  /**
   * Partition large tables by date for better performance
   */
  static async createTablePartitions(): Promise<void> {
    // Create partitioned table for crawl_results
    const partitionQueries = [
      `CREATE TABLE IF NOT EXISTS crawl_results_partitioned (
         LIKE crawl_results INCLUDING ALL
       ) PARTITION BY RANGE (created_at)`,

      // Create monthly partitions for the current and next few months
      `CREATE TABLE IF NOT EXISTS crawl_results_${new Date().getFullYear()}_${String(new Date().getMonth() + 1).padStart(2, '0')}
       PARTITION OF crawl_results_partitioned
       FOR VALUES FROM ('${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01') 
       TO ('${new Date().getFullYear()}-${String(new Date().getMonth() + 2).padStart(2, '0')}-01')`,

      // Create next month partition
      `CREATE TABLE IF NOT EXISTS crawl_results_${new Date().getFullYear()}_${String(new Date().getMonth() + 2).padStart(2, '0')}
       PARTITION OF crawl_results_partitioned
       FOR VALUES FROM ('${new Date().getFullYear()}-${String(new Date().getMonth() + 2).padStart(2, '0')}-01') 
       TO ('${new Date().getFullYear()}-${String(new Date().getMonth() + 3).padStart(2, '0')}-01')`
    ];

    for (const query of partitionQueries) {
      try {
        await DatabaseConnection.query(query);
        console.log('Created table partition');
      } catch (error) {
        console.error('Failed to create table partition:', error);
      }
    }
  }

  /**
   * Clean up old data to maintain performance
   */
  static async cleanupOldData(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const cleanupQueries = [
      // Delete old completed sessions and their related data
      `DELETE FROM crawl_sessions 
       WHERE status = 'completed' 
       AND created_at < $1`,

      // Delete orphaned reports
      `DELETE FROM reports 
       WHERE generated_at < $1 
       AND session_id NOT IN (SELECT id FROM crawl_sessions)`
    ];

    for (const query of cleanupQueries) {
      try {
        const result = await DatabaseConnection.query(query, [cutoffDate]);
        console.log(`Cleaned up ${result.rowCount} old records`);
      } catch (error) {
        console.error('Failed to cleanup old data:', error);
      }
    }
  }

  /**
   * Monitor database performance metrics
   */
  static async getPerformanceMetrics(): Promise<any> {
    const queries = {
      connectionStats: `
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `,
      
      slowQueries: `
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements 
        WHERE mean_time > 1000 
        ORDER BY mean_time DESC 
        LIMIT 10
      `,
      
      tableStats: `
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC
      `,
      
      indexStats: `
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes 
        WHERE idx_scan > 0
        ORDER BY idx_scan DESC
        LIMIT 20
      `
    };

    const metrics: any = {};
    
    for (const [key, query] of Object.entries(queries)) {
      try {
        const result = await DatabaseConnection.query(query);
        metrics[key] = result.rows;
      } catch (error) {
        console.error(`Failed to get ${key}:`, error);
        metrics[key] = [];
      }
    }

    return metrics;
  }
}