# Enterprise Web Crawler - Simple Startup Script
param(
    [switch]$Build,
    [switch]$Logs,
    [switch]$Status
)

Write-Host "Enterprise Web Crawler - Application Startup" -ForegroundColor Blue
Write-Host "=============================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Check Docker availability
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not available. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "Docker Compose is not available. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

if ($Status) {
    Write-Host "Checking service status..." -ForegroundColor Cyan
    & docker-compose ps
    exit 0
}

if ($Build) {
    Write-Host "Building application images..." -ForegroundColor Cyan
    & docker-compose build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "Build completed successfully" -ForegroundColor Green
}

# Start the application
Write-Host "Starting Enterprise Web Crawler services..." -ForegroundColor Cyan

# Start infrastructure services first
Write-Host "Starting infrastructure services..." -ForegroundColor Yellow
& docker-compose up -d postgres redis elasticsearch

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start infrastructure services" -ForegroundColor Red
    exit 1
}

# Wait for services
Write-Host "Waiting for infrastructure services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Start application services
Write-Host "Starting application services..." -ForegroundColor Yellow
& docker-compose up -d backend crawler frontend

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start application services" -ForegroundColor Red
    & docker-compose logs
    exit 1
}

# Wait for application services
Write-Host "Waiting for application services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check service status
Write-Host "Service Status:" -ForegroundColor Blue
& docker-compose ps

# Show service URLs
Write-Host "Application URLs:" -ForegroundColor Blue
Write-Host "Frontend (Web UI):    http://localhost:3000" -ForegroundColor Green
Write-Host "Backend API:          http://localhost:8000" -ForegroundColor Green
Write-Host "API Health Check:     http://localhost:8000/api/health" -ForegroundColor Green
Write-Host "PostgreSQL:           localhost:5432" -ForegroundColor Cyan
Write-Host "Redis:                localhost:6379" -ForegroundColor Cyan
Write-Host "Elasticsearch:        http://localhost:9200" -ForegroundColor Cyan

# Test API health
Write-Host "Testing API health..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 10
    Write-Host "Backend API is healthy" -ForegroundColor Green
} catch {
    Write-Host "Backend API health check failed - service might still be starting up" -ForegroundColor Yellow
}

if ($Logs) {
    Write-Host "Showing service logs..." -ForegroundColor Cyan
    & docker-compose logs -f
} else {
    Write-Host "Enterprise Web Crawler is starting up!" -ForegroundColor Green
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
    Write-Host "  Status:           .\scripts\start-app.ps1 -Status" -ForegroundColor White
}