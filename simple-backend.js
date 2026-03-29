const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    version: '1.0.0'
  });
});

// Mock data
let sessions = [{
  id: '1',
  name: 'Demo Crawl Session',
  status: 'completed',
  createdAt: new Date().toISOString(),
  progress: { totalUrls: 25, processedUrls: 25, failedUrls: 2 }
}];

// API endpoints
app.get('/api/crawl-sessions', (req, res) => res.json(sessions));

app.post('/api/crawl-sessions', (req, res) => {
  const session = {
    id: Date.now().toString(),
    name: req.body.name || 'New Crawl Session',
    status: 'pending',
    createdAt: new Date().toISOString(),
    config: req.body,
    progress: { totalUrls: 0, processedUrls: 0, failedUrls: 0 }
  };
  
  sessions.push(session);
  res.status(201).json(session);
  
  // Simulate progress
  setTimeout(() => {
    session.status = 'running';
    io.emit('crawl-progress', {
      sessionId: session.id,
      progress: { totalUrls: 10, processedUrls: 5, failedUrls: 0 }
    });
  }, 2000);
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    socket.emit('session-joined', { sessionId });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log('Backend server running on http://localhost:' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/api/health');
});
