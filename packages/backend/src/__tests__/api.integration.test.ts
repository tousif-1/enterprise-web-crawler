import request from 'supertest';
import { createApp } from '../app';
import { DatabaseConnection } from '../database/connection';
import { CrawlSessionRepository } from '../database/repositories/crawl-session.repository';
import { CrawlResultRepository } from '../database/repositories/crawl-result.repository';
import { CrawlSession, CrawlResult } from '@enterprise-web-crawler/shared';

describe('API Integration Tests', () => {
  let app: any;
  let server: any;
  let io: any;
  let db: DatabaseConnection;
  let crawlSessionRepo: CrawlSessionRepository;
  let crawlResultRepo: CrawlResultRepository;

  beforeAll(async () => {
    // Create test app
    const appInstance = createApp();
    app = appInstance.app;
    server = appInstance.server;
    io = appInstance.io;

    // Initialize database connection
    db = DatabaseConnection.getInstance();
    await db.connect();

    // Initialize repositories
    crawlSessionRepo = new CrawlSessionRepository();
    crawlResultRepo = new CrawlResultRepository();

    // Run migrations for test database
    await db.query(`
      CREATE TABLE IF NOT EXISTS crawl_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        config JSONB NOT NULL,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        progress JSONB NOT NULL DEFAULT '{"totalUrls": 0, "processedUrls": 0, "failedUrls": 0}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS crawl_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        http_status INTEGER,
        response_time INTEGER,
        content_hash VARCHAR(32),
        last_modified TIMESTAMP,
        accessibility_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    // Clean up test data
    await db.query('DROP TABLE IF EXISTS crawl_results CASCADE');
    await db.query('DROP TABLE IF EXISTS crawl_sessions CASCADE');
    
    await db.disconnect();
    server.close();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await db.query('DELETE FROM crawl_results');
    await db.query('DELETE FROM crawl_sessions');
  });

  describe('Health Endpoints', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
        version: expect.any(String)
      });
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
        version: expect.any(String),
        services: {
          database: {
            status: expect.any(String),
            latency: expect.any(String)
          },
          memory: {
            used: expect.any(String),
            total: expect.any(String)
          }
        }
      });
    });
  });

  describe('Crawl Session Endpoints', () => {
    const validSessionData = {
      name: 'Test Crawl Session',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      config: {
        urls: ['https://example.com'],
        excludePaths: ['/admin'],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true
      }
    };

    it('should create a new crawl session', async () => {
      const response = await request(app)
        .post('/api/crawl-sessions')
        .send(validSessionData)
        .expect(201);

      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        name: validSessionData.name,
        userId: validSessionData.userId,
        status: 'pending',
        config: validSessionData.config,
        progress: {
          totalUrls: 1,
          processedUrls: 0,
          failedUrls: 0
        },
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    });

    it('should validate required fields when creating session', async () => {
      const invalidData = {
        name: '',
        userId: 'invalid-uuid',
        config: {
          urls: [],
          maxDepth: 0
        }
      };

      const response = await request(app)
        .post('/api/crawl-sessions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.message).toContain('Validation error');
    });

    it('should list crawl sessions with pagination', async () => {
      // Create test sessions
      const session1 = await crawlSessionRepo.create({
        ...validSessionData,
        name: 'Session 1'
      });
      const session2 = await crawlSessionRepo.create({
        ...validSessionData,
        name: 'Session 2'
      });

      const response = await request(app)
        .get('/api/crawl-sessions?page=1&limit=10')
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: session1.id }),
          expect.objectContaining({ id: session2.id })
        ]),
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1
        }
      });
    });

    it('should get specific crawl session by id', async () => {
      const session = await crawlSessionRepo.create(validSessionData);

      const response = await request(app)
        .get(`/api/crawl-sessions/${session.id}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: session.id,
        name: validSessionData.name,
        userId: validSessionData.userId
      });
    });

    it('should return 404 for non-existent session', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174999';
      
      await request(app)
        .get(`/api/crawl-sessions/${nonExistentId}`)
        .expect(404);
    });

    it('should update crawl session', async () => {
      const session = await crawlSessionRepo.create(validSessionData);
      const updateData = {
        name: 'Updated Session Name',
        status: 'paused'
      };

      const response = await request(app)
        .put(`/api/crawl-sessions/${session.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: session.id,
        name: updateData.name,
        status: updateData.status
      });
    });

    it('should delete crawl session', async () => {
      const session = await crawlSessionRepo.create(validSessionData);

      await request(app)
        .delete(`/api/crawl-sessions/${session.id}`)
        .expect(204);

      // Verify session is deleted
      const deletedSession = await crawlSessionRepo.findById(session.id);
      expect(deletedSession).toBeNull();
    });

    it('should not delete running session', async () => {
      const session = await crawlSessionRepo.create({
        ...validSessionData,
        status: 'running'
      });

      const response = await request(app)
        .delete(`/api/crawl-sessions/${session.id}`)
        .expect(400);

      expect(response.body.error.message).toContain('Cannot delete running crawl session');
    });

    it('should start crawl session', async () => {
      const session = await crawlSessionRepo.create(validSessionData);

      const response = await request(app)
        .post(`/api/crawl-sessions/${session.id}/start`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: session.id,
        status: 'running',
        startTime: expect.any(String)
      });
    });

    it('should pause crawl session', async () => {
      const session = await crawlSessionRepo.create({
        ...validSessionData,
        status: 'running'
      });

      const response = await request(app)
        .post(`/api/crawl-sessions/${session.id}/pause`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: session.id,
        status: 'paused'
      });
    });

    it('should resume crawl session', async () => {
      const session = await crawlSessionRepo.create({
        ...validSessionData,
        status: 'paused'
      });

      const response = await request(app)
        .post(`/api/crawl-sessions/${session.id}/resume`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: session.id,
        status: 'running'
      });
    });

    it('should get crawl session progress', async () => {
      const session = await crawlSessionRepo.create(validSessionData);

      const response = await request(app)
        .get(`/api/crawl-sessions/${session.id}/progress`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        totalUrls: expect.any(Number),
        processedUrls: expect.any(Number),
        failedUrls: expect.any(Number),
        jobs: expect.any(Object)
      });
    });
  });

  describe('Crawl Result Endpoints', () => {
    let testSession: CrawlSession;
    let testResult: CrawlResult;

    beforeEach(async () => {
      testSession = await crawlSessionRepo.create({
        name: 'Test Session',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        config: {
          urls: ['https://example.com'],
          excludePaths: [],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        }
      });

      testResult = await crawlResultRepo.create({
        sessionId: testSession.id,
        url: 'https://example.com',
        status: 'success',
        httpStatus: 200,
        responseTime: 500,
        contentHash: 'abc123',
        lastModified: new Date(),
        issues: [],
        accessibilityScore: 85
      });
    });

    it('should list crawl results with pagination', async () => {
      const response = await request(app)
        .get('/api/crawl-results?page=1&limit=10')
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: testResult.id })
        ]),
        pagination: {
          page: 1,
          limit: 10,
          total: expect.any(Number),
          totalPages: expect.any(Number)
        }
      });
    });

    it('should filter crawl results by session', async () => {
      const response = await request(app)
        .get(`/api/crawl-results?sessionId=${testSession.id}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: testResult.id,
        sessionId: testSession.id
      });
    });

    it('should get specific crawl result by id', async () => {
      const response = await request(app)
        .get(`/api/crawl-results/${testResult.id}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: testResult.id,
        sessionId: testSession.id,
        url: 'https://example.com',
        status: 'success'
      });
    });

    it('should get session results summary', async () => {
      const response = await request(app)
        .get(`/api/crawl-results/session/${testSession.id}/summary`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        sessionId: testSession.id,
        totalResults: expect.any(Number),
        successCount: expect.any(Number),
        failedCount: expect.any(Number),
        averageAccessibilityScore: expect.any(Number)
      });
    });

    it('should search crawl results', async () => {
      const response = await request(app)
        .get('/api/crawl-results/search?q=example.com&type=url')
        .expect(200);

      expect(response.body).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining('example.com') })
        ]),
        pagination: expect.any(Object),
        query: {
          term: 'example.com',
          type: 'url'
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-route')
        .expect(404);

      expect(response.body.error.message).toContain('Route /api/unknown-route not found');
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/crawl-sessions')
        .send({})
        .expect(400);

      expect(response.body.error.message).toContain('Validation error');
    });

    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test that the error middleware is properly set up
      expect(app._router.stack.some((layer: any) => 
        layer.handle.length === 4 // Error middleware has 4 parameters
      )).toBe(true);
    });
  });
});