# Enterprise Web Crawler - Application Startup Script
param(
    [switch]$Build,
    [switch]$Logs,
    [switch]$Status
)

Write-Host "🚀 Enterprise Web Crawler - Application Startup" -ForegroundColor Blue
Write-Host "================================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Check if Docker is available
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not available. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker Compose is not available. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

# Load environment variables
if (Test-Path ".env.development") {
    Write-Host "📋 Loading development environment..." -ForegroundColor Cyan
    Get-Content ".env.development" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
} else {
    Write-Host "⚠️  .env.development not found, using defaults" -ForegroundColor Yellow
}

if ($Status) {
    Write-Host "`n📊 Checking service status..." -ForegroundColor Cyan
    & docker-compose ps
    exit 0
}

if ($Build) {
    Write-Host "`n🔨 Building application images..." -ForegroundColor Cyan
    & docker-compose build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build completed successfully" -ForegroundColor Green
}

# Start the application
Write-Host "`n🚀 Starting Enterprise Web Crawler services..." -ForegroundColor Cyan

# Start infrastructure services first
Write-Host "Starting infrastructure services (PostgreSQL, Redis, Elasticsearch)..." -ForegroundColor Yellow
& docker-compose up -d postgres redis elasticsearch

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start infrastructure services" -ForegroundColor Red
    exit 1
}

# Wait for infrastructure services to be healthy
Write-Host "⏳ Waiting for infrastructure services to be ready..." -ForegroundColor Yellow
$maxWait = 120  # 2 minutes
$waited = 0

do {
    Start-Sleep -Seconds 5
    $waited += 5
    
    $postgresHealth = & docker-compose ps --filter "health=healthy" postgres 2>$null
    $redisHealth = & docker-compose ps --filter "health=healthy" redis 2>$null
    $elasticsearchHealth = & docker-compose ps --filter "health=healthy" elasticsearch 2>$null
    
    $allHealthy = ($postgresHealth -and $redisHealth -and $elasticsearchHealth)
    
    if ($allHealthy) {
        Write-Host "✅ Infrastructure services are ready" -ForegroundColor Green
        break
    }
    
    if ($waited -ge $maxWait) {
        Write-Host "⚠️  Timeout waiting for services to be healthy, continuing anyway..." -ForegroundColor Yellow
        break
    }
    
    Write-Host "⏳ Still waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
} while ($true)

# Start application services
Write-Host "Starting application services (Backend, Crawler, Frontend)..." -ForegroundColor Yellow
& docker-compose up -d backend crawler frontend

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start application services" -ForegroundColor Red
    & docker-compose logs
    exit 1
}

# Wait for application services
Write-Host "⏳ Waiting for application services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check service status
Write-Host "`n📊 Service Status:" -ForegroundColor Blue
& docker-compose ps

# Show service URLs
Write-Host "`n🌐 Application URLs:" -ForegroundColor Blue
Write-Host "Frontend (Web UI):    http://localhost:3000" -ForegroundColor Green
Write-Host "Backend API:          http://localhost:8000" -ForegroundColor Green
Write-Host "API Health Check:     http://localhost:8000/api/health" -ForegroundColor Green
Write-Host "PostgreSQL:           localhost:5432" -ForegroundColor Cyan
Write-Host "Redis:                localhost:6379" -ForegroundColor Cyan
Write-Host "Elasticsearch:        http://localhost:9200" -ForegroundColor Cyan

# Test API health
Write-Host "`n🏥 Testing API health..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 10
    Write-Host "✅ Backend API is healthy" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Gray
    Write-Host "   Database: $($response.database)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Backend API health check failed: $_" -ForegroundColor Yellow
    Write-Host "   The service might still be starting up..." -ForegroundColor Gray
}

if ($Logs) {
    Write-Host "`n📋 Showing service logs..." -ForegroundColor Cyan
    & docker-compose logs -f
} else {
    Write-Host "`n🎉 Enterprise Web Crawler is starting up!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Blue
    Write-Host "  1. Open your browser to http://localhost:3000" -ForegroundColor White
    Write-Host "  2. Create a new crawl session" -ForegroundColor White
    Write-Host "  3. Monitor progress in real-time" -ForegroundColor White
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Blue
    Write-Host "  View logs:        docker-compose logs -f" -ForegroundColor White
    Write-Host "  Stop services:    docker-compose down" -ForegroundColor White
    Write-Host "  Restart:          docker-compose restart" -ForegroundColor White
    Write-Host "  Status:           .\scripts\start-application.ps1 -Status" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 To view logs in real-time, run:" -ForegroundColor Cyan
    Write-Host "   .\scripts\start-application.ps1 -Logs" -ForegroundColor White
}