import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

// Simple CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://172.28.128.1:3000",
    "http://192.168.1.4:3000",
    "http://192.168.89.1:3000",
    "http://192.168.145.1:3000",
    "http://192.168.29.47:3000",
    "http://172.23.128.1:3000"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Simple health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Backend server is running'
  });
});

// Simple crawl sessions endpoint
app.get('/api/crawl-sessions', (req, res) => {
  res.json([
    {
      id: '1',
      name: 'Sample Crawl Session',
      status: 'completed',
      createdAt: new Date().toISOString(),
      progress: {
        totalUrls: 10,
        processedUrls: 10,
        failedUrls: 0
      }
    }
  ]);
});

// Create crawl session endpoint
app.post('/api/crawl-sessions', (req, res) => {
  const { name, config } = req.body;
  
  const newSession = {
    id: Date.now().toString(),
    name: name || 'New Crawl Session',
    status: 'pending',
    createdAt: new Date().toISOString(),
    config: config || {},
    progress: {
      totalUrls: 0,
      processedUrls: 0,
      failedUrls: 0
    }
  };
  
  res.status(201).json(newSession);
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🚀 Simple Backend Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 API endpoints: http://localhost:${PORT}/api/*`);
});