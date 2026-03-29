// Repository exports
export { BaseRepository } from './base.repository';
export { CrawlSessionRepository } from './crawl-session.repository';
export { CrawlResultRepository } from './crawl-result.repository';
export { IssueRepository } from './issue.repository';
export { LinkRepository } from './link.repository';

// Import classes for instances
import { CrawlSessionRepository } from './crawl-session.repository';
import { CrawlResultRepository } from './crawl-result.repository';
import { IssueRepository } from './issue.repository';
import { LinkRepository } from './link.repository';

// Repository instances for dependency injection
export const crawlSessionRepository = new CrawlSessionRepository();
export const crawlResultRepository = new CrawlResultRepository();
export const issueRepository = new IssueRepository();
export const linkRepository = new LinkRepository();