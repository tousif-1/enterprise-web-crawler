import { Client } from '@elastic/elasticsearch';
import { 
  CrawlResult, 
  Issue, 
  IndexDocument, 
  ContentHashResult 
} from '@enterprise-web-crawler/shared';
import { getElasticsearchClient } from '../config/elasticsearch.config';
import { HashUtil } from '../utils/hash.util';
import { logger } from '../utils/logger';

export class IndexingService {
  private client: Client;
  private readonly CRAWL_RESULTS_INDEX = 'crawl-results';
  private readonly ISSUES_INDEX = 'issues';
  private readonly CONTENT_INDEX = 'content';

  constructor() {
    this.client = getElasticsearchClient().getClient();
  }

  async initialize(): Promise<void> {
    try {
      await this.createIndices();
      logger.info('Indexing service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize indexing service:', error);
      throw error;
    }
  }

  private async createIndices(): Promise<void> {
    const elasticsearchClient = getElasticsearchClient();

    // Create crawl results index
    await elasticsearchClient.createIndex(this.CRAWL_RESULTS_INDEX, {
      properties: {
        sessionId: { type: 'keyword' },
        url: { type: 'keyword' },
        status: { type: 'keyword' },
        httpStatus: { type: 'integer' },
        responseTime: { type: 'integer' },
        contentHash: { type: 'keyword' },
        lastModified: { type: 'date' },
        accessibilityScore: { type: 'float' },
        createdAt: { type: 'date' },
        content: { 
          type: 'text',
          analyzer: 'html_analyzer'
        },
        title: { type: 'text' },
        description: { type: 'text' },
        keywords: { type: 'keyword' }
      }
    });

    // Create issues index
    await elasticsearchClient.createIndex(this.ISSUES_INDEX, {
      properties: {
        sessionId: { type: 'keyword' },
        url: { type: 'keyword' },
        type: { type: 'keyword' },
        severity: { type: 'keyword' },
        description: { 
          type: 'text',
          analyzer: 'standard'
        },
        element: { type: 'text' },
        wcagGuideline: { type: 'keyword' },
        remediation: { 
          type: 'text',
          analyzer: 'standard'
        },
        createdAt: { type: 'date' }
      }
    });

    // Create content index for full-text search
    await elasticsearchClient.createIndex(this.CONTENT_INDEX, {
      properties: {
        sessionId: { type: 'keyword' },
        url: { type: 'keyword' },
        title: { 
          type: 'text',
          analyzer: 'standard',
          boost: 2.0
        },
        content: { 
          type: 'text',
          analyzer: 'html_analyzer'
        },
        textContent: { 
          type: 'text',
          analyzer: 'standard'
        },
        contentHash: { type: 'keyword' },
        lastModified: { type: 'date' },
        metadata: { type: 'object' }
      }
    });
  }

  async indexCrawlResult(crawlResult: CrawlResult, htmlContent?: string): Promise<void> {
    try {
      // Generate content hash if HTML content is provided
      let contentHashResult: ContentHashResult | undefined;
      if (htmlContent) {
        contentHashResult = HashUtil.generateContentHashResult(
          crawlResult.url,
          htmlContent,
          crawlResult.contentHash || undefined
        );
      }

      // Extract metadata from HTML content
      const metadata = htmlContent ? this.extractMetadata(htmlContent) : {};

      const document = {
        ...crawlResult,
        content: htmlContent || '',
        title: metadata.title || '',
        description: metadata.description || '',
        keywords: metadata.keywords || [],
        contentHash: contentHashResult?.currentHash || crawlResult.contentHash,
        hasChanged: contentHashResult?.hasChanged || false
      };

      await this.client.index({
        index: this.CRAWL_RESULTS_INDEX,
        id: crawlResult.id,
        document: document
      });

      // Also index in content index for full-text search
      if (htmlContent) {
        await this.indexContent({
          id: crawlResult.id,
          type: 'crawl_result',
          sessionId: crawlResult.sessionId,
          url: crawlResult.url,
          content: htmlContent,
          metadata: {
            ...metadata,
            httpStatus: crawlResult.httpStatus,
            responseTime: crawlResult.responseTime,
            accessibilityScore: crawlResult.accessibilityScore
          },
          timestamp: crawlResult.createdAt
        });
      }

      logger.debug(`Indexed crawl result: ${crawlResult.url}`);
    } catch (error) {
      logger.error(`Failed to index crawl result ${crawlResult.id}:`, error);
      throw error;
    }
  }

  async indexIssues(issues: Issue[], sessionId: string, url: string): Promise<void> {
    try {
      const operations = [];

      for (const issue of issues) {
        operations.push({
          index: {
            _index: this.ISSUES_INDEX,
            _id: issue.id
          }
        });

        operations.push({
          ...issue,
          sessionId,
          url,
          createdAt: new Date()
        });
      }

      if (operations.length > 0) {
        await this.client.bulk({
          operations: operations
        });

        // Also index issues in content index for searchability
        for (const issue of issues) {
          await this.indexContent({
            id: issue.id,
            type: 'issue',
            sessionId,
            url,
            content: `${issue.description} ${issue.remediation || ''}`,
            metadata: {
              type: issue.type,
              severity: issue.severity,
              element: issue.element,
              wcagGuideline: issue.wcagGuideline
            },
            timestamp: new Date()
          });
        }
      }

      logger.debug(`Indexed ${issues.length} issues for URL: ${url}`);
    } catch (error) {
      logger.error(`Failed to index issues for URL ${url}:`, error);
      throw error;
    }
  }

  async indexContent(document: IndexDocument): Promise<void> {
    try {
      const textContent = document.content ? 
        HashUtil.extractTextContent(document.content) : '';

      const indexDocument = {
        sessionId: document.sessionId,
        url: document.url,
        title: document.metadata.title || '',
        content: document.content,
        textContent,
        contentHash: HashUtil.generateMD5(document.content),
        lastModified: document.timestamp,
        metadata: document.metadata
      };

      await this.client.index({
        index: this.CONTENT_INDEX,
        id: document.id,
        document: indexDocument
      });

      logger.debug(`Indexed content document: ${document.id}`);
    } catch (error) {
      logger.error(`Failed to index content document ${document.id}:`, error);
      throw error;
    }
  }

  async deleteSessionData(sessionId: string): Promise<void> {
    try {
      // Delete from all indices
      const indices = [this.CRAWL_RESULTS_INDEX, this.ISSUES_INDEX, this.CONTENT_INDEX];

      for (const index of indices) {
        await this.client.deleteByQuery({
          index,
          query: {
            term: {
              sessionId
            }
          }
        });
      }

      logger.info(`Deleted indexed data for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to delete session data ${sessionId}:`, error);
      throw error;
    }
  }

  async refreshIndices(): Promise<void> {
    try {
      await this.client.indices.refresh({
        index: [this.CRAWL_RESULTS_INDEX, this.ISSUES_INDEX, this.CONTENT_INDEX]
      });
    } catch (error) {
      logger.error('Failed to refresh indices:', error);
      throw error;
    }
  }

  private extractMetadata(html: string): Record<string, any> {
    const metadata: Record<string, any> = {};

    try {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) {
        metadata.title = titleMatch[1].trim();
      }

      // Extract meta description
      const descMatch = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"']*)["\'][^>]*>/i);
      if (descMatch) {
        metadata.description = descMatch[1].trim();
      }

      // Extract meta keywords
      const keywordsMatch = html.match(/<meta[^>]*name=["\']keywords["\'][^>]*content=["\']([^"']*)["\'][^>]*>/i);
      if (keywordsMatch) {
        metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
      }

      // Extract h1 tags
      const h1Matches = html.match(/<h1[^>]*>([^<]*)<\/h1>/gi);
      if (h1Matches) {
        metadata.headings = h1Matches.map(h => h.replace(/<[^>]*>/g, '').trim());
      }

      // Extract language
      const langMatch = html.match(/<html[^>]*lang=["\']([^"']*)["\'][^>]*>/i);
      if (langMatch) {
        metadata.language = langMatch[1];
      }

    } catch (error) {
      logger.warn('Error extracting metadata from HTML:', error);
    }

    return metadata;
  }

  async getIndexStats(): Promise<Record<string, any>> {
    try {
      const stats = await this.client.indices.stats({
        index: [this.CRAWL_RESULTS_INDEX, this.ISSUES_INDEX, this.CONTENT_INDEX]
      });

      return {
        crawlResults: stats.indices?.[this.CRAWL_RESULTS_INDEX]?.total?.docs?.count || 0,
        issues: stats.indices?.[this.ISSUES_INDEX]?.total?.docs?.count || 0,
        content: stats.indices?.[this.CONTENT_INDEX]?.total?.docs?.count || 0,
        totalSize: stats.indices ? Object.values(stats.indices).reduce((total: number, index: any) => {
          return total + (index.total?.store?.size_in_bytes || 0);
        }, 0) : 0
      };
    } catch (error) {
      logger.error('Failed to get index stats:', error);
      return {};
    }
  }
}