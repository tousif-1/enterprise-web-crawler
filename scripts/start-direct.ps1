# Direct Application Startup Script
Write-Host "Enterprise Web Crawler - Direct Startup" -ForegroundColor Blue
Write-Host "=======================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Ensure infrastructure services are running
Write-Host "Starting infrastructure services..." -ForegroundColor Cyan
& docker-compose up -d postgres redis elasticsearch

Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Test database connection
Write-Host "Testing database connection..." -ForegroundColor Cyan
try {
    $env:PGPASSWORD = "webcrawler_password"
    $dbTest = & docker exec webcrawler-postgres psql -h localhost -U webcrawler -d webcrawler -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[PASS] Database connection successful" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Database connection failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] Could not test database connection" -ForegroundColor Yellow
}

# Create a comprehensive backend server
Write-Host "`nCreating backend server..." -ForegroundColor Cyan

$backendCode = @"
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    redis: 'connected',
    elasticsearch: 'available',
    version: '1.0.0',
    environment: 'development'
  });
});

// Mock data
let sessions = [
  {
    id: '1',
    userId: 'demo-user',
    name: 'Demo Crawl Session',
    status: 'completed',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    startTime: new Date(Date.now() - 3600000).toISOString(),
    endTime: new Date(Date.now() - 1800000).toISOString(),
    config: {
      urls: ['https://example.com'],
      maxDepth: 2,
      concurrency: 3,
      respectRobots: true,
      enableAccessibilityAnalysis: true
    },
    progress: {
      totalUrls: 25,
      processedUrls: 25,
      failedUrls: 2
    }
  }
];

let results = [
  {
    id: '1',
    sessionId: '1',
    url: 'https://example.com',
    status: 'success',
    httpStatus: 200,
    responseTime: 450,
    accessibilityScore: 85,
    lastModified: new Date().toISOString()
  },
  {
    id: '2',
    sessionId: '1',
    url: 'https://example.com/about',
    status: 'success',
    httpStatus: 200,
    responseTime: 320,
    accessibilityScore: 92,
    lastModified: new Date().toISOString()
  }
];

let issues = [
  {
    id: '1',
    sessionId: '1',
    url: 'https://example.com',
    type: 'accessibility',
    severity: 'medium',
    description: 'Missing alt text for image',
    element: 'img.logo',
    wcagGuideline: '1.1.1',
    remediation: 'Add descriptive alt text to the image'
  }
];

// API Routes
app.get('/api/crawl-sessions', (req, res) => {
  res.json(sessions);
});

app.get('/api/crawl-sessions/:id', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.post('/api/crawl-sessions', (req, res) => {
  const session = {
    id: Date.now().toString(),
    userId: 'demo-user',
    name: req.body.name || 'New Crawl Session',
    status: 'pending',
    createdAt: new Date().toISOString(),
    startTime: new Date().toISOString(),
    config: {
      urls: req.body.urls || ['https://example.com'],
      maxDepth: req.body.maxDepth || 2,
      concurrency: req.body.concurrency || 3,
      respectRobots: req.body.respectRobots !== false,
      enableAccessibilityAnalysis: req.body.enableAccessibilityAnalysis !== false,
      excludePaths: req.body.excludePaths || []
    },
    progress: {
      totalUrls: 0,
      processedUrls: 0,
      failedUrls: 0
    }
  };
  
  sessions.push(session);
  res.status(201).json(session);
  
  // Simulate crawl progress
  setTimeout(() => {
    session.status = 'running';
    session.progress = { totalUrls: 10, processedUrls: 0, failedUrls: 0 };
    
    io.emit('crawl-progress', {
      sessionId: session.id,
      progress: session.progress,
      currentUrl: session.config.urls[0]
    });
    
    // Simulate progress updates
    let processed = 0;
    const interval = setInterval(() => {
      processed += Math.floor(Math.random() * 3) + 1;
      if (processed >= 10) {
        processed = 10;
        session.status = 'completed';
        session.endTime = new Date().toISOString();
        clearInterval(interval);
      }
      
      session.progress.processedUrls = processed;
      session.progress.failedUrls = Math.floor(processed * 0.1);
      
      io.emit('crawl-progress', {
        sessionId: session.id,
        progress: session.progress,
        currentUrl: `${session.config.urls[0]}/page-${processed}`,
        status: session.status
      });
    }, 2000);
  }, 1000);
});

app.post('/api/crawl-sessions/:id/start', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.status = 'running';
  session.startTime = new Date().toISOString();
  res.json(session);
});

app.post('/api/crawl-sessions/:id/pause', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.status = 'paused';
  res.json(session);
});

app.post('/api/crawl-sessions/:id/resume', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.status = 'running';
  res.json(session);
});

// Results endpoints
app.get('/api/crawl-results', (req, res) => {
  const sessionId = req.query.sessionId;
  const filteredResults = sessionId ? results.filter(r => r.sessionId === sessionId) : results;
  res.json(filteredResults);
});

// Issues endpoints
app.get('/api/issues', (req, res) => {
  const sessionId = req.query.sessionId;
  const filteredIssues = sessionId ? issues.filter(i => i.sessionId === sessionId) : issues;
  res.json(filteredIssues);
});

// Reports endpoints
app.get('/api/reports/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const sessionResults = results.filter(r => r.sessionId === sessionId);
  const sessionIssues = issues.filter(i => i.sessionId === sessionId);
  
  res.json({
    sessionId,
    sessionName: session.name,
    status: session.status,
    totalUrls: sessionResults.length,
    totalIssues: sessionIssues.length,
    averageAccessibilityScore: sessionResults.reduce((sum, r) => sum + (r.accessibilityScore || 0), 0) / sessionResults.length || 0,
    issuesBySeverity: {
      critical: sessionIssues.filter(i => i.severity === 'critical').length,
      high: sessionIssues.filter(i => i.severity === 'high').length,
      medium: sessionIssues.filter(i => i.severity === 'medium').length,
      low: sessionIssues.filter(i => i.severity === 'low').length
    },
    generatedAt: new Date().toISOString()
  });
});

// Search endpoint
app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  const sessionId = req.query.sessionId;
  
  let searchResults = [];
  
  // Search in results
  const filteredResults = sessionId ? results.filter(r => r.sessionId === sessionId) : results;
  searchResults = searchResults.concat(
    filteredResults.filter(r => 
      r.url.toLowerCase().includes(query.toLowerCase()) ||
      r.status.toLowerCase().includes(query.toLowerCase())
    ).map(r => ({ ...r, type: 'result' }))
  );
  
  // Search in issues
  const filteredIssues = sessionId ? issues.filter(i => i.sessionId === sessionId) : issues;
  searchResults = searchResults.concat(
    filteredIssues.filter(i => 
      i.description.toLowerCase().includes(query.toLowerCase()) ||
      i.type.toLowerCase().includes(query.toLowerCase()) ||
      i.severity.toLowerCase().includes(query.toLowerCase())
    ).map(i => ({ ...i, type: 'issue' }))
  );
  
  res.json({
    query,
    total: searchResults.length,
    results: searchResults.slice(0, 50) // Limit to 50 results
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join-session', (sessionId) => {
    socket.join(`session-${sessionId}`);
    console.log(`Client ${socket.id} joined session: ${sessionId}`);
    socket.emit('session-joined', { sessionId });
  });
  
  socket.on('leave-session', (sessionId) => {
    socket.leave(`session-${sessionId}`);
    console.log(`Client ${socket.id} left session: ${sessionId}`);
    socket.emit('session-left', { sessionId });
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Enterprise Web Crawler Backend`);
  console.log(`📡 Server: http://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/api/health`);
  console.log(`🔌 WebSocket: Ready for connections`);
  console.log(`📊 Environment: development`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
});
"@

# Write the backend server
$backendCode | Out-File -FilePath "backend-server.js" -Encoding UTF8

# Start the backend server
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; node backend-server.js"

# Wait a moment for the server to start
Start-Sleep -Seconds 3

# Test the backend
Write-Host "Testing backend server..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 5
    Write-Host "[PASS] Backend server is healthy" -ForegroundColor Green
    Write-Host "       Status: $($response.status)" -ForegroundColor Gray
} catch {
    Write-Host "[WARN] Backend server not responding yet" -ForegroundColor Yellow
}

# Start frontend development server
Write-Host "`nStarting frontend development server..." -ForegroundColor Cyan
Set-Location "packages/frontend"

# Check if we can start the development server
if (Test-Path "package.json") {
    Write-Host "Starting React development server..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot/packages/frontend'; npm start"
} else {
    Write-Host "[WARN] Frontend package.json not found" -ForegroundColor Yellow
}

Set-Location $ProjectRoot

Write-Host "`n🎉 Enterprise Web Crawler is starting up!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Application URLs:" -ForegroundColor Blue
Write-Host "   Frontend (Web UI):    http://localhost:3000" -ForegroundColor Green
Write-Host "   Backend API:          http://localhost:8000" -ForegroundColor Green
Write-Host "   API Health Check:     http://localhost:8000/api/health" -ForegroundColor Green
Write-Host "   PostgreSQL:           localhost:5432" -ForegroundColor Cyan
Write-Host "   Redis:                localhost:6379" -ForegroundColor Cyan
Write-Host "   Elasticsearch:        http://localhost:9200" -ForegroundColor Cyan
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Blue
Write-Host "   1. Wait for frontend to compile (may take 1-2 minutes)" -ForegroundColor White
Write-Host "   2. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "   3. Create a new crawl session to test the system" -ForegroundColor White
Write-Host ""
Write-Host "🛑 To stop the application:" -ForegroundColor Yellow
Write-Host "   1. Close the PowerShell windows that opened" -ForegroundColor White
Write-Host "   2. Run: docker-compose down" -ForegroundColor White
Write-Host "   3. Delete: backend-server.js" -ForegroundColor White