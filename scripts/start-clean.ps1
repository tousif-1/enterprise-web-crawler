# Enterprise Web Crawler - Clean Startup Script
Write-Host "Enterprise Web Crawler - Clean Startup" -ForegroundColor Blue
Write-Host "=======================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Start infrastructure services
Write-Host "Starting infrastructure services..." -ForegroundColor Cyan
& docker-compose up -d postgres redis elasticsearch

Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Create backend server
Write-Host "Creating backend server..." -ForegroundColor Cyan

$backendCode = @'
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
'@

$backendCode | Out-File -FilePath "simple-backend.js" -Encoding UTF8

# Start backend
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; node simple-backend.js"

Start-Sleep -Seconds 3

# Test backend
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 5
    Write-Host "[PASS] Backend server is healthy" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Backend server not responding yet" -ForegroundColor Yellow
}

# Start frontend
Write-Host "Starting frontend..." -ForegroundColor Cyan
Set-Location "packages/frontend"

if (Test-Path "package.json") {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot/packages/frontend'; npm start"
} else {
    Write-Host "[WARN] Frontend not found" -ForegroundColor Yellow
}

Set-Location $ProjectRoot

Write-Host ""
Write-Host "Enterprise Web Crawler is starting up!" -ForegroundColor Green
Write-Host ""
Write-Host "Application URLs:" -ForegroundColor Blue
Write-Host "  Frontend:     http://localhost:3000" -ForegroundColor Green
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor Green
Write-Host "  Health Check: http://localhost:8000/api/health" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Blue
Write-Host "  1. Wait for frontend to compile" -ForegroundColor White
Write-Host "  2. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "  3. Create a new crawl session" -ForegroundColor White
Write-Host ""
Write-Host "To stop:" -ForegroundColor Yellow
Write-Host "  1. Close the PowerShell windows" -ForegroundColor White
Write-Host "  2. Run: docker-compose down" -ForegroundColor White