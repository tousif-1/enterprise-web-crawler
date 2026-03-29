import { Client } from '@elastic/elasticsearch';
import { 
  SearchQuery, 
  SearchResult, 
  SearchHit, 
  SearchAggregations,
  CrawlResult,
  Issue
} from '@enterprise-web-crawler/shared';
import { getElasticsearchClient } from '../config/elasticsearch.config';
import { logger } from '../utils/logger';

export class SearchService {
  private client: Client;
  private readonly CRAWL_RESULTS_INDEX = 'crawl-results';
  private readonly ISSUES_INDEX = 'issues';
  private readonly CONTENT_INDEX = 'content';

  constructor() {
    this.client = getElasticsearchClient().getClient();
  }

  async searchCrawlResults(searchQuery: SearchQuery): Promise<SearchResult<CrawlResult>> {
    try {
      const query = this.buildElasticsearchQuery(searchQuery);
      const response = await this.client.search({
        index: this.CRAWL_RESULTS_INDEX,
        query: query.query,
        sort: query.sort,
        from: query.from,
        size: query.size,
        highlight: query.highlight,
        aggs: this.buildCrawlResultsAggregations()
      });

      return this.formatSearchResponse<CrawlResult>(response, searchQuery);
    } catch (error) {
      logger.error('Failed to search crawl results:', error);
      throw error;
    }
  }

  async searchIssues(searchQuery: SearchQuery): Promise<SearchResult<Issue>> {
    try {
      const query = this.buildElasticsearchQuery(searchQuery);
      const response = await this.client.search({
        index: this.ISSUES_INDEX,
        query: query.query,
        sort: query.sort,
        from: query.from,
        size: query.size,
        highlight: query.highlight,
        aggs: this.buildIssuesAggregations()
      });

      return this.formatSearchResponse<Issue>(response, searchQuery);
    } catch (error) {
      logger.error('Failed to search issues:', error);
      throw error;
    }
  }

  async searchContent(searchQuery: SearchQuery): Promise<SearchResult<any>> {
    try {
      const query = this.buildContentSearchQuery(searchQuery);
      const response = await this.client.search({
        index: this.CONTENT_INDEX,
        query: query.query,
        sort: query.sort,
        from: query.from,
        size: query.size,
        highlight: {
          fields: {
            title: { fragment_size: 150, number_of_fragments: 1 },
            content: { fragment_size: 150, number_of_fragments: 3 },
            textContent: { fragment_size: 150, number_of_fragments: 3 }
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>']
        }
      });

      return this.formatSearchResponse<any>(response, searchQuery);
    } catch (error) {
      logger.error('Failed to search content:', error);
      throw error;
    }
  }

  async searchAll(searchQuery: SearchQuery): Promise<{
    crawlResults: SearchResult<CrawlResult>;
    issues: SearchResult<Issue>;
    content: SearchResult<any>;
  }> {
    try {
      const [crawlResults, issues, content] = await Promise.all([
        this.searchCrawlResults(searchQuery),
        this.searchIssues(searchQuery),
        this.searchContent(searchQuery)
      ]);

      return { crawlResults, issues, content };
    } catch (error) {
      logger.error('Failed to search all indices:', error);
      throw error;
    }
  }

  async getSuggestions(query: string, field: string = 'title'): Promise<string[]> {
    try {
      const response = await this.client.search({
        index: [this.CRAWL_RESULTS_INDEX, this.CONTENT_INDEX],
        suggest: {
          suggestions: {
            text: query,
            term: {
              field: field,
              size: 5
            }
          }
        }
      });

      const suggestions = response.suggest?.suggestions?.[0]?.options || [];
      return Array.isArray(suggestions) ? suggestions.map((option: any) => option.text) : [];
    } catch (error) {
      logger.error('Failed to get suggestions:', error);
      return [];
    }
  }

  async getAggregations(sessionId?: string): Promise<SearchAggregations> {
    try {
      const filters = sessionId ? { term: { sessionId } } : { match_all: {} };

      const [crawlResultsAggs, issuesAggs] = await Promise.all([
        this.client.search({
          index: this.CRAWL_RESULTS_INDEX,
          query: filters,
          size: 0,
          aggs: this.buildCrawlResultsAggregations()
        }),
        this.client.search({
          index: this.ISSUES_INDEX,
          query: filters,
          size: 0,
          aggs: this.buildIssuesAggregations()
        })
      ]);

      return {
        statusCounts: this.extractBuckets(crawlResultsAggs.aggregations?.status_counts),
        httpStatusCounts: this.extractBuckets(crawlResultsAggs.aggregations?.http_status_counts),
        issueTypeCounts: this.extractBuckets(issuesAggs.aggregations?.issue_type_counts),
        severityCounts: this.extractBuckets(issuesAggs.aggregations?.severity_counts)
      };
    } catch (error) {
      logger.error('Failed to get aggregations:', error);
      return {};
    }
  }

  private buildElasticsearchQuery(searchQuery: SearchQuery): any {
    const { query, filters, sort, pagination, highlight } = searchQuery;

    // Build the main query
    let esQuery: any = { match_all: {} };

    if (query && query.trim()) {
      esQuery = {
        multi_match: {
          query: query.trim(),
          fields: ['url^2', 'title^3', 'description^2', 'content', 'textContent'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      };
    }

    // Build filters
    const filterClauses = [];

    if (filters?.sessionId) {
      filterClauses.push({ term: { sessionId: filters.sessionId } });
    }

    if (filters?.status && filters.status.length > 0) {
      filterClauses.push({ terms: { status: filters.status } });
    }

    if (filters?.issueType && filters.issueType.length > 0) {
      filterClauses.push({ terms: { type: filters.issueType } });
    }

    if (filters?.severity && filters.severity.length > 0) {
      filterClauses.push({ terms: { severity: filters.severity } });
    }

    if (filters?.httpStatus && filters.httpStatus.length > 0) {
      filterClauses.push({ terms: { httpStatus: filters.httpStatus } });
    }

    if (filters?.dateRange) {
      filterClauses.push({
        range: {
          createdAt: {
            gte: filters.dateRange.from,
            lte: filters.dateRange.to
          }
        }
      });
    }

    if (filters?.accessibilityScore) {
      const rangeFilter: any = {};
      if (filters.accessibilityScore.min !== undefined) {
        rangeFilter.gte = filters.accessibilityScore.min;
      }
      if (filters.accessibilityScore.max !== undefined) {
        rangeFilter.lte = filters.accessibilityScore.max;
      }
      if (Object.keys(rangeFilter).length > 0) {
        filterClauses.push({ range: { accessibilityScore: rangeFilter } });
      }
    }

    // Combine query and filters
    const finalQuery = filterClauses.length > 0 ? {
      bool: {
        must: esQuery,
        filter: filterClauses
      }
    } : esQuery;

    // Build sort
    const esSort = [];
    if (sort) {
      esSort.push({ [sort.field]: { order: sort.order } });
    } else {
      esSort.push({ _score: { order: 'desc' } });
      esSort.push({ createdAt: { order: 'desc' } });
    }

    // Build pagination
    const page = pagination?.page || 1;
    const size = Math.min(pagination?.size || 20, 100); // Max 100 results per page
    const from = (page - 1) * size;

    // Build highlight
    const esHighlight = highlight ? {
      fields: {
        url: { fragment_size: 150, number_of_fragments: 1 },
        title: { fragment_size: 150, number_of_fragments: 1 },
        description: { fragment_size: 150, number_of_fragments: 1 },
        content: { fragment_size: 150, number_of_fragments: 3 }
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>']
    } : undefined;

    return {
      query: finalQuery,
      sort: esSort,
      from,
      size,
      highlight: esHighlight
    };
  }

  private buildContentSearchQuery(searchQuery: SearchQuery): any {
    const baseQuery = this.buildElasticsearchQuery(searchQuery);

    // Enhance query for content search with boosted fields
    if (searchQuery.query && searchQuery.query.trim()) {
      baseQuery.query = {
        bool: {
          should: [
            {
              multi_match: {
                query: searchQuery.query.trim(),
                fields: ['title^4', 'textContent^2', 'content'],
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            },
            {
              match_phrase: {
                textContent: {
                  query: searchQuery.query.trim(),
                  boost: 2
                }
              }
            }
          ],
          minimum_should_match: 1
        }
      };
    }

    return baseQuery;
  }

  private buildCrawlResultsAggregations(): any {
    return {
      status_counts: {
        terms: { field: 'status', size: 10 }
      },
      http_status_counts: {
        terms: { field: 'httpStatus', size: 20 }
      },
      accessibility_score_ranges: {
        range: {
          field: 'accessibilityScore',
          ranges: [
            { to: 0.3, key: 'poor' },
            { from: 0.3, to: 0.7, key: 'fair' },
            { from: 0.7, to: 0.9, key: 'good' },
            { from: 0.9, key: 'excellent' }
          ]
        }
      }
    };
  }

  private buildIssuesAggregations(): any {
    return {
      issue_type_counts: {
        terms: { field: 'type', size: 10 }
      },
      severity_counts: {
        terms: { field: 'severity', size: 10 }
      },
      wcag_guideline_counts: {
        terms: { field: 'wcagGuideline', size: 20 }
      }
    };
  }

  private formatSearchResponse<T>(response: any, searchQuery: SearchQuery): SearchResult<T> {
    const hits: SearchHit<T>[] = response.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      source: hit._source,
      highlight: hit.highlight
    }));

    const total = typeof response.hits.total === 'number' 
      ? response.hits.total 
      : response.hits.total.value;

    const aggregations = this.formatAggregations(response.aggregations);

    return {
      hits,
      total,
      page: searchQuery.pagination?.page || 1,
      size: searchQuery.pagination?.size || 20,
      aggregations
    };
  }

  private formatAggregations(aggregations: any): SearchAggregations | undefined {
    if (!aggregations) return undefined;

    const result: SearchAggregations = {};

    if (aggregations.status_counts) {
      result.statusCounts = this.extractBuckets(aggregations.status_counts);
    }

    if (aggregations.http_status_counts) {
      result.httpStatusCounts = this.extractBuckets(aggregations.http_status_counts);
    }

    if (aggregations.issue_type_counts) {
      result.issueTypeCounts = this.extractBuckets(aggregations.issue_type_counts);
    }

    if (aggregations.severity_counts) {
      result.severityCounts = this.extractBuckets(aggregations.severity_counts);
    }

    return result;
  }

  private extractBuckets(aggregation: any): Record<string, number> {
    if (!aggregation?.buckets) return {};

    const result: Record<string, number> = {};
    for (const bucket of aggregation.buckets) {
      result[bucket.key] = bucket.doc_count;
    }
    return result;
  }
}