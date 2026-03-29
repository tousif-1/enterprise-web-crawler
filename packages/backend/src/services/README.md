# Job Scheduling and Queue Management System

This directory contains the job scheduling and queue management system for the Enterprise Web Crawler. The system is built using Bull Queue and Redis to provide scalable, reliable job processing with advanced features like priority management, pause/resume functionality, and resource allocation.

## Architecture Overview

The job scheduling system consists of two main components:

### 1. JobSchedulerService (`job-scheduler.service.ts`)

The low-level job scheduler that manages Bull queues and Redis connections.

**Key Features:**
- Multiple specialized queues (crawl, analysis, validation, report)
- Priority-based job scheduling
- Retry logic with exponential backoff
- Resource monitoring and auto-scaling
- Pause/resume functionality
- Progress tracking and status reporting
- Comprehensive error handling

**Queues:**
- **Crawl Queue**: Handles URL crawling jobs
- **Analysis Queue**: Processes accessibility analysis jobs
- **Validation Queue**: Manages link validation jobs
- **Report Queue**: Generates reports and exports

### 2. JobManagerService (`job-manager.service.ts`)

The high-level orchestration service that manages complete crawl sessions.

**Key Features:**
- Session-based job orchestration
- Automatic job dependency management
- Real-time progress tracking
- Event-driven architecture
- Session pause/resume/cancel operations
- System-wide monitoring and statistics

## Usage Examples

### Basic Job Scheduling

```typescript
import { JobSchedulerService } from './services/job-scheduler.service';
import { config } from './config';

const jobScheduler = new JobSchedulerService(config.jobScheduler);

// Schedule a crawl job
const jobId = await jobScheduler.scheduleJob('crawl_url', {
  sessionId: 'session-123',
  url: 'https://example.com',
  config: crawlConfig
}, 'high');

// Get job status
const job = await jobScheduler.getJobStatus(jobId);
console.log(`Job ${jobId} status: ${job?.status}`);
```

### Session Management

```typescript
import { JobManagerService } from './services/job-manager.service';

const jobManager = new JobManagerService(jobScheduler);

// Create and start a crawl session
const session: CrawlSession = {
  id: 'session-123',
  userId: 'user-456',
  name: 'Website Audit',
  status: 'pending',
  config: {
    urls: ['https://example.com', 'https://example.com/about'],
    excludePaths: ['/admin'],
    maxDepth: 3,
    concurrency: 5,
    respectRobots: true
  },
  // ... other properties
};

await jobManager.startCrawlSession(session);

// Monitor progress
jobManager.on('job:completed', (job) => {
  console.log(`Job completed: ${job.id}`);
});

jobManager.on('session:completed', (session) => {
  console.log(`Session completed: ${session.id}`);
});
```

### Event Handling

The system emits various events for real-time monitoring:

```typescript
// Job-level events
jobManager.on('job:completed', (job) => { /* ... */ });
jobManager.on('job:failed', (job, error) => { /* ... */ });
jobManager.on('job:progress', (job, progress) => { /* ... */ });

// Session-level events
jobManager.on('session:started', (sessionId, jobIds) => { /* ... */ });
jobManager.on('session:paused', (sessionId, jobCount) => { /* ... */ });
jobManager.on('session:resumed', (sessionId, jobCount) => { /* ... */ });
jobManager.on('session:completed', (session) => { /* ... */ });

// System-level events
jobManager.on('resource:update', (allocation) => { /* ... */ });
```

## Configuration

The job scheduler is configured through the application config:

```typescript
// config/index.ts
export const config = {
  jobScheduler: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_JOB_DB || '1', 10)
    },
    concurrency: {
      crawl: parseInt(process.env.JOB_CRAWL_CONCURRENCY || '5', 10),
      analysis: parseInt(process.env.JOB_ANALYSIS_CONCURRENCY || '3', 10),
      validation: parseInt(process.env.JOB_VALIDATION_CONCURRENCY || '10', 10)
    },
    retries: {
      maxRetries: parseInt(process.env.JOB_MAX_RETRIES || '3', 10),
      backoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '2000', 10)
    },
    cleanup: {
      maxAge: parseInt(process.env.JOB_MAX_AGE || '86400000', 10), // 24 hours
      maxCount: parseInt(process.env.JOB_MAX_COUNT || '100', 10)
    }
  }
};
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | localhost | Redis server host |
| `REDIS_PORT` | 6379 | Redis server port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `REDIS_JOB_DB` | 1 | Redis database for jobs |
| `JOB_CRAWL_CONCURRENCY` | 5 | Max concurrent crawl jobs |
| `JOB_ANALYSIS_CONCURRENCY` | 3 | Max concurrent analysis jobs |
| `JOB_VALIDATION_CONCURRENCY` | 10 | Max concurrent validation jobs |
| `JOB_MAX_RETRIES` | 3 | Maximum retry attempts |
| `JOB_BACKOFF_DELAY` | 2000 | Retry backoff delay (ms) |
| `JOB_MAX_AGE` | 86400000 | Job retention time (ms) |
| `JOB_MAX_COUNT` | 100 | Max completed jobs to keep |

## Job Types

The system supports four main job types:

### 1. `crawl_url`
Crawls a single URL and extracts links, content, and metadata.

**Data:**
```typescript
{
  sessionId: string;
  url: string;
  config: CrawlConfig;
}
```

### 2. `analyze_accessibility`
Analyzes pages for WCAG 2.2 AA compliance using Axe-core.

**Data:**
```typescript
{
  sessionId: string;
  urls?: string[];
  config: CrawlConfig;
}
```

### 3. `validate_links`
Validates links for broken/missing resources.

**Data:**
```typescript
{
  sessionId: string;
  urls?: string[];
  config: CrawlConfig;
}
```

### 4. `generate_report`
Generates reports in various formats (PDF, CSV, etc.).

**Data:**
```typescript
{
  sessionId: string;
  config: CrawlConfig;
  format?: 'pdf' | 'csv' | 'json';
}
```

## Priority Levels

Jobs can be assigned different priority levels:

- **`critical`** (20): Urgent jobs that need immediate processing
- **`high`** (10): Important jobs with elevated priority
- **`normal`** (5): Standard priority jobs
- **`low`** (1): Background jobs that can wait

## Resource Management

The system includes automatic resource management:

- **Memory Monitoring**: Tracks heap usage and pauses low-priority jobs when memory is high
- **CPU Monitoring**: Can be extended to monitor CPU usage
- **Auto-scaling**: Automatically adjusts job processing based on resource availability
- **Load Balancing**: Distributes jobs across available workers

## Error Handling

Comprehensive error handling includes:

- **Retry Logic**: Exponential backoff for transient failures
- **Circuit Breaker**: Prevents cascade failures
- **Dead Letter Queue**: Failed jobs are preserved for analysis
- **Graceful Degradation**: System continues operating with reduced functionality

## Monitoring and Observability

The system provides extensive monitoring capabilities:

- **Queue Statistics**: Real-time metrics for all queues
- **Resource Allocation**: Current system resource usage
- **Job Progress**: Individual job progress tracking
- **Event Streams**: Real-time event notifications
- **Health Checks**: System health monitoring

## Testing

The system includes comprehensive tests:

```bash
# Run job scheduler tests
npm test -- --testPathPattern="job-scheduler"

# Run job manager tests
npm test -- --testPathPattern="job-manager"

# Run all job-related tests
npm test -- --testPathPattern="job-scheduler|job-manager"
```

## Demo

Run the demo script to see the system in action:

```bash
npx ts-node src/examples/job-scheduler-demo.ts
```

## Integration with Other Services

The job scheduler integrates with other crawler services:

- **CrawlerService**: Processes crawl_url jobs
- **AccessibilityAnalyzer**: Handles analyze_accessibility jobs
- **LinkValidator**: Processes validate_links jobs
- **ReportGenerator**: Handles generate_report jobs

## Performance Considerations

- **Concurrency**: Adjust concurrency limits based on system resources
- **Memory Usage**: Monitor Redis memory usage for large job queues
- **Network I/O**: Consider network bandwidth when setting crawl concurrency
- **Database Connections**: Ensure adequate connection pooling for high throughput

## Deployment

For production deployment:

1. **Redis Cluster**: Use Redis cluster for high availability
2. **Monitoring**: Integrate with Prometheus/Grafana for metrics
3. **Logging**: Use structured logging for better observability
4. **Scaling**: Deploy multiple worker instances for horizontal scaling
5. **Security**: Secure Redis connections and implement proper authentication

## Troubleshooting

Common issues and solutions:

### Jobs Stuck in Waiting State
- Check Redis connectivity
- Verify worker processes are running
- Check resource allocation limits

### High Memory Usage
- Reduce job retention settings
- Increase cleanup frequency
- Monitor for memory leaks in job processors

### Slow Job Processing
- Increase concurrency limits
- Check network connectivity
- Monitor database performance

### Failed Jobs
- Check error logs for specific failure reasons
- Verify external service availability
- Review retry configuration

## Future Enhancements

Potential improvements:

- **Job Scheduling**: Cron-like scheduling for recurring jobs
- **Distributed Processing**: Multi-node job processing
- **Advanced Monitoring**: Integration with APM tools
- **Job Chaining**: Complex job dependency management
- **Rate Limiting**: Per-domain rate limiting for crawl jobs