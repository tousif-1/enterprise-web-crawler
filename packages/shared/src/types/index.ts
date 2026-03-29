// Core type definitions for the enterprise web crawler
export interface CrawlSession {
  id: string;
  userId: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  config: CrawlConfig;
  startTime: Date;
  endTime?: Date;
  progress: {
    totalUrls: number;
    processedUrls: number;
    failedUrls: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CrawlConfig {
  urls: string[];
  excludePaths: string[];
  maxDepth: number;
  concurrency: number;
  respectRobots: boolean;
}

export interface CrawlResult {
  id: string;
  sessionId: string;
  url: string;
  status: 'success' | 'failed' | 'skipped';
  httpStatus: number;
  responseTime: number;
  contentHash: string;
  lastModified: Date;
  issues: Issue[];
  accessibilityScore: number;
  createdAt: Date;
}

export interface Issue {
  id: string;
  type: 'broken_link' | 'missing_image' | 'accessibility' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  element?: string;
  wcagGuideline?: string;
  remediation?: string;
}

export interface Link {
  url: string;
  sourceUrl: string;
  text: string;
  type: 'internal' | 'external';
  status: 'pending' | 'valid' | 'broken' | 'redirect';
  httpStatus?: number;
  redirectUrl?: string;
}

// Accessibility Analysis Types
export interface AccessibilityReport {
  url: string;
  violations: WCAGViolation[];
  passes: WCAGPass[];
  incomplete: WCAGIncomplete[];
  score: number;
  timestamp: Date;
}

export interface WCAGViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
  wcagLevel: 'A' | 'AA' | 'AAA';
  wcagGuideline: string;
  remediation: string;
}

export interface WCAGPass {
  id: string;
  impact: null;
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: PassNode[];
}

export interface WCAGIncomplete {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: IncompleteNode[];
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary?: string;
  element?: string;
}

export interface PassNode {
  html: string;
  target: string[];
}

export interface IncompleteNode {
  html: string;
  target: string[];
  message?: string;
}

export interface ComplianceScore {
  overall: number;
  perceivable: number;
  operable: number;
  understandable: number;
  robust: number;
  violationCount: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

export interface AccessibilityAnalysisConfig {
  wcagLevel: 'A' | 'AA' | 'AAA';
  tags?: string[];
  rules?: string[];
  excludeRules?: string[];
  timeout?: number;
}

// Job Scheduling Types
export interface CrawlJob {
  id: string;
  sessionId: string;
  type: 'crawl_url' | 'analyze_accessibility' | 'validate_links' | 'generate_report';
  priority: JobPriority;
  data: CrawlJobData;
  status: JobStatus;
  progress: JobProgress;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface CrawlJobData {
  url?: string;
  urls?: string[];
  sessionId: string;
  config?: CrawlConfig;
  [key: string]: any;
}

export interface JobProgress {
  percentage: number;
  processed: number;
  total: number;
  currentTask?: string;
  estimatedTimeRemaining?: number;
}

export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

export type JobStatus = 
  | 'waiting'
  | 'active' 
  | 'completed' 
  | 'failed' 
  | 'delayed' 
  | 'paused'
  | 'stuck';

export interface JobSchedulerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  concurrency: {
    crawl: number;
    analysis: number;
    validation: number;
  };
  retries: {
    maxRetries: number;
    backoffDelay: number;
  };
  cleanup: {
    maxAge: number; // milliseconds
    maxCount: number;
  };
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface ResourceAllocation {
  maxConcurrentJobs: number;
  currentActiveJobs: number;
  availableSlots: number;
  memoryUsage: number;
  cpuUsage: number;
}

// Search and Indexing Types
export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  sort?: SearchSort;
  pagination?: SearchPagination;
  highlight?: boolean;
}

export interface SearchFilters {
  sessionId?: string;
  status?: string[];
  issueType?: string[];
  severity?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  httpStatus?: number[];
  accessibilityScore?: {
    min?: number;
    max?: number;
  };
}

export interface SearchSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface SearchPagination {
  page: number;
  size: number;
}

export interface SearchResult<T> {
  hits: SearchHit<T>[];
  total: number;
  page: number;
  size: number;
  aggregations?: SearchAggregations;
}

export interface SearchHit<T> {
  id: string;
  score: number;
  source: T;
  highlight?: Record<string, string[]>;
}

export interface SearchAggregations {
  statusCounts?: Record<string, number>;
  issueTypeCounts?: Record<string, number>;
  severityCounts?: Record<string, number>;
  httpStatusCounts?: Record<string, number>;
}

export interface IndexDocument {
  id: string;
  type: 'crawl_result' | 'issue';
  sessionId: string;
  url: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface ContentHashResult {
  url: string;
  currentHash: string;
  previousHash?: string;
  hasChanged: boolean;
  changeDetectedAt?: Date;
}

// Error Handling and Resilience Types
export interface ErrorContext {
  service: string;
  operation: string;
  url?: string;
  sessionId?: string;
  userId?: string;
  requestId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedErrors: string[];
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ErrorCategory = 
  | 'network'
  | 'http'
  | 'validation'
  | 'database'
  | 'external_service'
  | 'system'
  | 'business_logic'
  | 'authentication'
  | 'authorization';

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  lastErrorTime?: Date;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
}