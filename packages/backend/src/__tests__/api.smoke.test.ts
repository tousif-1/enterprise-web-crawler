import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import request from 'supertest';
import { errorHandler, notFoundHandler } from '../middleware/error.middleware';
import { healthRoutes } from '../routes/health.routes';

describe('API Smoke Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create a minimal app without job services for testing
    app = express();
    
    // Security middleware
    app.use(helmet());
    app.use(cors());
    
    // Body parsing middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Health routes only
    app.use('/api/health', healthRoutes);
    
    // Error handling middleware
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  it('should respond to health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('should handle CORS headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should handle JSON requests', async () => {
    const response = await request(app)
      .post('/api/health')
      .send({ test: 'data' })
      .expect(404); // Health route doesn't accept POST

    expect(response.body.error).toBeDefined();
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown')
      .expect(404);

    expect(response.body.error.message).toContain('Route /api/unknown not found');
  });

  it('should have security headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    // Check for helmet security headers
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });
});