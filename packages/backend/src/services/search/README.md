# Search and Indexing Services

This directory contains the search and indexing functionality for the Enterprise Web Crawler, implementing full-text search capabilities using Elasticsearch.

## Overview

The search and indexing system provides:

- **Full-text search** across crawl results, issues, and content
- **Real-time indexing** of crawl data as it's processed
- **Content change detection** using MD5 hashing
- **Advanced filtering and aggregations** for data analysis
- **Search suggestions** and auto-completion
- **Scalable architecture** supporting large datasets (75,000+ links)

## Architecture

### Core Components

1. **IndexingService** - Handles data indexing into Elasticsearch
2. **SearchService** - Provides search functionality across all indices
3. **HashUtil** - Utilities for content hashing and change detection
4. **ElasticsearchClient** - Connection and configuration management

### Elasticsearch Indices

The system uses three main indices:

#### 1. `crawl-results` Index
Stores crawl result data with searchable content:
```typescript
{
  sessionId: string,
  url: string,
  status: string,
  httpStatus: number,
  responseTime: number,
  contentHash: string,
  lastModified: Date,
  accessibilityScore: number,
  content: string,        // HTML content
  title: string,          // Extracted page title
  description: string,    // Meta description
  keywords: string[]      // Meta keywords
}
```

#### 2. `issues` Index
Stores detected issues (accessibility, broken links, etc.):
```typescript
{
  sessionId: string,
  url: string,
  type: 'broken_link' | 'missing_image' | 'accessibility' | 'performance',
  severity: 'low' | 'medium' | 'high' | 'critical',
  description: string,
  element?: string,
  wcagGuideline?: string,
  remediation?: string
}
```

#### 3. `content` Index
Optimized for full-text search across page content:
```typescript
{
  sessionId: string,
  url: string,
  title: string,
  content: string,        // Raw HTML
  textContent: string,    // Extracted text content
  contentHash: string,
  lastModified: Date,
  metadata: object
}
```

## Usage Examples

### Basic Search

```typescript
import { SearchService } from '../services/search.service';

const searchService = new SearchService();

// Search crawl results
const results = await searchService.searchCrawlResults({
  query: 'accessibility',
  pagination: { page: 1, size: 20 },
  highlight: true
});

console.log(`Found ${results.total} results`);
results.hits.forEach(hit => {
  console.log(`${hit.source.url} (score: ${hit.score})`);
});
```

### Advanced Filtering

```typescript
// Search with filters
const filteredResults = await searchService.searchCrawlResults({
  query: 'broken links',
  filters: {
    sessionId: 'session-123',
    status: ['failed'],
    severity: ['high', 'critical'],
    dateRange: {
      from: new Date('2023-01-01'),
      to: new Date('2023-12-31')
    },
    accessibilityScore: {
      min: 0.0,
      max: 0.5
    }
  },
  sort: { field: 'accessibilityScore', order: 'asc' }
});
```

### Content Indexing

```typescript
import { IndexingService } from '../services/indexing.service';

const indexingService = new IndexingService();

// Initialize indices
await indexingService.initialize();

// Index crawl result with HTML content
await indexingService.indexCrawlResult(crawlResult, htmlContent);

// Index issues
await indexingService.indexIssues(issues, sessionId, url);
```

### Content Change Detection

```typescript
import { HashUtil } from '../utils/hash.util';

// Generate content hash
const currentHash = HashUtil.generateMD5(htmlContent);

// Compare with previous hash
const hashResult = HashUtil.generateContentHashResult(
  url,
  htmlContent,
  previousHash
);

if (hashResult.hasChanged) {
  console.log(`Content changed for ${url}`);
  console.log(`Change detected at: ${hashResult.changeDetectedAt}`);
}

// Text-only comparison (ignores HTML structure changes)
const textHash = HashUtil.generateTextContentHash(htmlContent);
```

## API Endpoints

### Search Endpoints

- `POST /api/search/crawl-results` - Search crawl results
- `POST /api/search/issues` - Search issues
- `POST /api/search/content` - Full-text content search
- `POST /api/search/all` - Search all indices simultaneously

### Utility Endpoints

- `GET /api/search/suggestions?query=term` - Get search suggestions
- `GET /api/search/aggregations` - Get data aggregations
- `GET /api/search/stats` - Get index statistics
- `POST /api/search/refresh` - Refresh indices (admin)

### Request/Response Examples

#### Search Request
```json
{
  "query": "accessibility issues",
  "filters": {
    "sessionId": "session-123",
    "severity": ["high", "critical"],
    "dateRange": {
      "from": "2023-01-01T00:00:00Z",
      "to": "2023-12-31T23:59:59Z"
    }
  },
  "sort": {
    "field": "createdAt",
    "order": "desc"
  },
  "pagination": {
    "page": 1,
    "size": 20
  },
  "highlight": true
}
```

#### Search Response
```json
{
  "success": true,
  "data": {
    "hits": [
      {
        "id": "result-123",
        "score": 1.5,
        "source": {
          "url": "https://example.com/page",
          "status": "success",
          "accessibilityScore": 0.65,
          "issues": [...]
        },
        "highlight": {
          "title": ["<mark>Accessibility</mark> Test Page"]
        }
      }
    ],
    "total": 150,
    "page": 1,
    "size": 20,
    "aggregations": {
      "statusCounts": {
        "success": 120,
        "failed": 30
      },
      "severityCounts": {
        "high": 45,
        "medium": 80,
        "low": 25
      }
    }
  }
}
```

## Configuration

### Environment Variables

```bash
# Elasticsearch Configuration
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=
ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED=false
ELASTICSEARCH_REQUEST_TIMEOUT=30000
ELASTICSEARCH_PING_TIMEOUT=3000
ELASTICSEARCH_MAX_RETRIES=3
```

### Docker Setup

Elasticsearch is included in the docker-compose.yml:

```yaml
elasticsearch:
  image: elasticsearch:8.8.0
  environment:
    - discovery.type=single-node
    - xpack.security.enabled=false
    - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
  ports:
    - "9200:9200"
    - "9300:9300"
```

## Performance Considerations

### Indexing Performance

- **Bulk operations** for multiple documents
- **Asynchronous indexing** to avoid blocking crawl operations
- **Configurable refresh intervals** for near real-time search

### Search Performance

- **Field boosting** for relevance tuning
- **Pagination limits** (max 100 results per page)
- **Aggregation caching** for frequently accessed data
- **Index optimization** with proper mappings and analyzers

### Scaling

- **Horizontal scaling** with Elasticsearch cluster
- **Index sharding** for large datasets
- **Connection pooling** for high concurrency
- **Circuit breaker** patterns for resilience

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern="hash"
```

### Integration Tests
```bash
npm test -- --testPathPattern="search.integration"
```

### Manual Testing
```bash
# Run the search demo
npm run demo:search
```

## Monitoring and Maintenance

### Health Checks

```typescript
// Check Elasticsearch connection
const client = getElasticsearchClient();
await client.connect();

// Get index statistics
const stats = await indexingService.getIndexStats();
console.log('Index stats:', stats);
```

### Index Management

```typescript
// Refresh indices for immediate search
await indexingService.refreshIndices();

// Clean up session data
await indexingService.deleteSessionData(sessionId);

// Get aggregations for monitoring
const aggs = await searchService.getAggregations();
```

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify Elasticsearch is running
   - Check network connectivity
   - Validate authentication credentials

2. **Search Not Working**
   - Refresh indices after indexing
   - Check index mappings
   - Verify query syntax

3. **Performance Issues**
   - Monitor index size and fragmentation
   - Optimize queries with filters
   - Consider index replication

### Debug Logging

Enable debug logging for search operations:

```bash
LOG_LEVEL=debug npm start
```

## Requirements Fulfilled

This implementation addresses the following requirements:

- **4.1**: Full-text search indexing of crawl results
- **4.2**: Sub-2-second search response times
- **4.3**: Search result highlighting and context
- **4.4**: Real-time filtering capabilities
- **4.5**: MD5 hash generation for change detection
- **4.6**: Page change information in reports

The search and indexing system provides a robust, scalable foundation for analyzing large-scale web crawl data with enterprise-grade performance and reliability.