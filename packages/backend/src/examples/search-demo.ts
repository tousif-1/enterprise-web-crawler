import { SearchService } from '../services/search.service';
import { IndexingService } from '../services/indexing.service';
import { getElasticsearchClient } from '../config/elasticsearch.config';
import { 
  CrawlResult, 
  Issue, 
  SearchQuery,
  IndexDocument 
} from '@enterprise-web-crawler/shared';
import { HashUtil } from '../utils/hash.util';

/**
 * Demo script showing how to use the search and indexing functionality
 */
async function searchDemo() {
  console.log('🔍 Starting Search and Indexing Demo...\n');

  try {
    // Initialize services
    const searchService = new SearchService();
    const indexingService = new IndexingService();
    const elasticsearchClient = getElasticsearchClient();

    // Connect to Elasticsearch
    console.log('📡 Connecting to Elasticsearch...');
    await elasticsearchClient.connect();

    // Initialize indices
    console.log('🏗️  Initializing search indices...');
    await indexingService.initialize();

    // Demo data
    const sessionId = 'demo-session-' + Date.now();
    const demoUrl = 'https://example.com/demo-page';
    const htmlContent = `
      <html>
        <head>
          <title>Demo Page - Accessibility Testing</title>
          <meta name="description" content="This is a demo page for testing web crawler functionality">
          <meta name="keywords" content="demo, testing, accessibility, web crawler">
        </head>
        <body>
          <h1>Welcome to Demo Page</h1>
          <p>This page contains various accessibility issues for testing purposes.</p>
          <img src="missing-image.jpg" alt="">
          <a href="broken-link.html">Broken Link</a>
          <div style="color: #ccc; background: #ddd;">Low contrast text</div>
        </body>
      </html>
    `;

    // Create sample crawl result
    const crawlResult: CrawlResult = {
      id: 'demo-result-1',
      sessionId,
      url: demoUrl,
      status: 'success',
      httpStatus: 200,
      responseTime: 1250,
      contentHash: HashUtil.generateMD5(htmlContent),
      lastModified: new Date(),
      issues: [],
      accessibilityScore: 0.65,
      createdAt: new Date()
    };

    // Create sample issues
    const issues: Issue[] = [
      {
        id: 'demo-issue-1',
        type: 'accessibility',
        severity: 'high',
        description: 'Image missing alternative text',
        element: 'img[src="missing-image.jpg"]',
        wcagGuideline: '1.1.1',
        remediation: 'Add meaningful alt attribute to describe the image content'
      },
      {
        id: 'demo-issue-2',
        type: 'broken_link',
        severity: 'medium',
        description: 'Link returns 404 Not Found',
        element: 'a[href="broken-link.html"]',
        remediation: 'Update link to point to existing resource or remove if no longer needed'
      },
      {
        id: 'demo-issue-3',
        type: 'accessibility',
        severity: 'medium',
        description: 'Insufficient color contrast ratio',
        element: 'div',
        wcagGuideline: '1.4.3',
        remediation: 'Increase contrast ratio to at least 4.5:1 for normal text'
      }
    ];

    // Index the data
    console.log('📝 Indexing demo crawl result...');
    await indexingService.indexCrawlResult(crawlResult, htmlContent);

    console.log('🐛 Indexing demo issues...');
    await indexingService.indexIssues(issues, sessionId, demoUrl);

    // Refresh indices to make data immediately searchable
    console.log('🔄 Refreshing indices...');
    await indexingService.refreshIndices();

    // Wait a moment for indexing to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n🔍 Running search demonstrations...\n');

    // Demo 1: Basic text search
    console.log('1️⃣  Basic text search for "accessibility":');
    const basicSearch: SearchQuery = {
      query: 'accessibility',
      highlight: true
    };

    const basicResults = await searchService.searchContent(basicSearch);
    console.log(`   Found ${basicResults.total} results`);
    basicResults.hits.forEach(hit => {
      console.log(`   - ${hit.source.url} (score: ${hit.score.toFixed(2)})`);
      if (hit.highlight?.title) {
        console.log(`     Title: ${hit.highlight.title[0]}`);
      }
    });

    // Demo 2: Filtered search
    console.log('\n2️⃣  Filtered search for high severity issues:');
    const filteredSearch: SearchQuery = {
      query: '',
      filters: {
        sessionId,
        severity: ['high']
      }
    };

    const filteredResults = await searchService.searchIssues(filteredSearch);
    console.log(`   Found ${filteredResults.total} high severity issues`);
    filteredResults.hits.forEach(hit => {
      console.log(`   - ${hit.source.type}: ${hit.source.description}`);
    });

    // Demo 3: Search with aggregations
    console.log('\n3️⃣  Getting aggregations for session:');
    const aggregations = await searchService.getAggregations(sessionId);
    console.log('   Issue types:', aggregations.issueTypeCounts);
    console.log('   Severities:', aggregations.severityCounts);

    // Demo 4: Search suggestions
    console.log('\n4️⃣  Getting search suggestions for "access":');
    const suggestions = await searchService.getSuggestions('access', 'title');
    console.log('   Suggestions:', suggestions);

    // Demo 5: Search all indices
    console.log('\n5️⃣  Searching all indices for "demo":');
    const allSearch: SearchQuery = {
      query: 'demo',
      pagination: { page: 1, size: 5 }
    };

    const allResults = await searchService.searchAll(allSearch);
    console.log(`   Crawl results: ${allResults.crawlResults.total}`);
    console.log(`   Issues: ${allResults.issues.total}`);
    console.log(`   Content: ${allResults.content.total}`);

    // Demo 6: Content hash comparison
    console.log('\n6️⃣  Demonstrating content change detection:');
    const originalHash = HashUtil.generateMD5(htmlContent);
    console.log(`   Original content hash: ${originalHash}`);

    const modifiedContent = htmlContent.replace('Demo Page', 'Updated Demo Page');
    const modifiedHash = HashUtil.generateMD5(modifiedContent);
    console.log(`   Modified content hash: ${modifiedHash}`);

    const hashResult = HashUtil.generateContentHashResult(demoUrl, modifiedContent, originalHash);
    console.log(`   Content changed: ${hashResult.hasChanged}`);
    console.log(`   Change detected at: ${hashResult.changeDetectedAt}`);

    // Demo 7: Text-only content hash (ignoring HTML structure changes)
    console.log('\n7️⃣  Text-only content hash comparison:');
    const textHash1 = HashUtil.generateTextContentHash('<div><p>Hello World</p></div>');
    const textHash2 = HashUtil.generateTextContentHash('<span><strong>Hello World</strong></span>');
    console.log(`   Same text, different HTML structure: ${textHash1 === textHash2}`);

    // Demo 8: Index statistics
    console.log('\n8️⃣  Index statistics:');
    const stats = await indexingService.getIndexStats();
    console.log('   Statistics:', stats);

    // Cleanup demo data
    console.log('\n🧹 Cleaning up demo data...');
    await indexingService.deleteSessionData(sessionId);

    console.log('\n✅ Search and Indexing Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  searchDemo()
    .then(() => {
      console.log('\n👋 Demo finished. Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Unhandled error:', error);
      process.exit(1);
    });
}

export { searchDemo };