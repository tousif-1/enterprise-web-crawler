const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    version: '1.0.0'
  });
});

// Mock crawl sessions endpoint
app.get('/api/crawl-sessions', (req, res) => {
  res.json([
    {
      id: '1',
      name: 'Sample Crawl Session',
      status: 'completed',
      createdAt: new Date().toISOString(),
      progress: {
        totalUrls: 100,
        processedUrls: 100,
        failedUrls: 5
      }
    }
  ]);
});

app.post('/api/crawl-sessions', (req, res) => {
  const session = {
    id: Date.now().toString(),
    name: req.body.name || 'New Crawl Session',
    status: 'pending',
    createdAt: new Date().toISOString(),
    config: req.body,
    progress: {
      totalUrls: 0,
      processedUrls: 0,
      failedUrls: 0
    }
  };
  
  res.status(201).json(session);
  
  // Simulate crawl progress
  setTimeout(() => {
    io.emit('crawl-progress', {
      sessionId: session.id,
      progress: { totalUrls: 10, processedUrls: 5, failedUrls: 0 },
      currentUrl: 'https://example.com'
    });
  }, 2000);
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(Client joined session: );
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(Backend server running on http://localhost:);
  console.log(Health check: http://localhost:/api/health);
});
