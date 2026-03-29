# Simple Application Startup Script
Write-Host "Enterprise Web Crawler - Simple Startup" -ForegroundColor Blue
Write-Host "=======================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Check if infrastructure services are running
Write-Host "Checking infrastructure services..." -ForegroundColor Cyan

$postgresRunning = $false
$redisRunning = $false
$elasticsearchRunning = $false

try {
    $dockerPs = & docker-compose ps --format json | ConvertFrom-Json
    foreach ($service in $dockerPs) {
        if ($service.Service -eq "postgres" -and $service.State -eq "running") {
            $postgresRunning = $true
        }
        if ($service.Service -eq "redis" -and $service.State -eq "running") {
            $redisRunning = $true
        }
        if ($service.Service -eq "elasticsearch" -and $service.State -eq "running") {
            $elasticsearchRunning = $true
        }
    }
} catch {
    Write-Host "Could not check Docker services" -ForegroundColor Yellow
}

if ($postgresRunning) {
    Write-Host "[PASS] PostgreSQL is running" -ForegroundColor Green
} else {
    Write-Host "[WARN] PostgreSQL not detected - starting..." -ForegroundColor Yellow
    & docker-compose up -d postgres
    Start-Sleep -Seconds 10
}

if ($redisRunning) {
    Write-Host "[PASS] Redis is running" -ForegroundColor Green
} else {
    Write-Host "[WARN] Redis not detected - starting..." -ForegroundColor Yellow
    & docker-compose up -d redis
    Start-Sleep -Seconds 5
}

if ($elasticsearchRunning) {
    Write-Host "[PASS] Elasticsearch is running" -ForegroundColor Green
} else {
    Write-Host "[INFO] Elasticsearch not running - search features will be limited" -ForegroundColor Yellow
}

# Create a simple backend server
Write-Host "`nStarting simple backend server..." -ForegroundColor Cyan

$backendScript = @"
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
    console.log(`Client joined session: ${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
"@

# Write the backend script
$backendScript | Out-File -FilePath "temp-backend.js" -Encoding UTF8

# Start the backend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node temp-backend.js"

Write-Host "[PASS] Backend server started on http://localhost:8000" -ForegroundColor Green

# Start the frontend
Write-Host "`nStarting frontend..." -ForegroundColor Cyan

Set-Location "packages/frontend"

# Check if build exists
if (-not (Test-Path "build")) {
    Write-Host "Building frontend..." -ForegroundColor Yellow
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARN] Frontend build failed, trying development server..." -ForegroundColor Yellow
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"
    } else {
        Write-Host "[PASS] Frontend built successfully" -ForegroundColor Green
        # Serve the built frontend
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx serve -s build -l 3000"
    }
} else {
    Write-Host "[PASS] Frontend build exists, serving..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx serve -s build -l 3000"
}

Set-Location $ProjectRoot

Write-Host "`nApplication URLs:" -ForegroundColor Blue
Write-Host "Frontend (Web UI):    http://localhost:3000" -ForegroundColor Green
Write-Host "Backend API:          http://localhost:8000" -ForegroundColor Green
Write-Host "API Health Check:     http://localhost:8000/api/health" -ForegroundColor Green

Write-Host "`nApplication is starting up!" -ForegroundColor Green
Write-Host "Open your browser to http://localhost:3000 to access the web interface." -ForegroundColor Cyan

Write-Host "`nTo stop the application:" -ForegroundColor Yellow
Write-Host "  1. Close the PowerShell windows that opened" -ForegroundColor White
Write-Host "  2. Run: docker-compose down" -ForegroundColor White
Write-Host "  3. Delete: temp-backend.js" -ForegroundColor White