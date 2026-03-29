# Simple Docker Status Check

Write-Host "Docker Status Check" -ForegroundColor Blue
Write-Host "===================" -ForegroundColor Blue

# Check if Docker command exists
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Docker command is available" -ForegroundColor Green

# Test Docker connection
$dockerTest = & docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Docker Desktop is running" -ForegroundColor Green
    $version = & docker --version
    Write-Host $version -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "Ready to start the application!" -ForegroundColor Green
    Write-Host "Run: .\scripts\start-app.ps1" -ForegroundColor Cyan
} else {
    Write-Host "Docker Desktop is not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker Desktop:" -ForegroundColor Yellow
    Write-Host "1. Open Docker Desktop from Start menu" -ForegroundColor White
    Write-Host "2. Wait for it to fully start (30-60 seconds)" -ForegroundColor White
    Write-Host "3. Look for Docker icon in system tray" -ForegroundColor White
    Write-Host "4. Run this script again to verify" -ForegroundColor White
    
    # Try to start Docker Desktop
    $dockerPath = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Write-Host ""
        Write-Host "Attempting to start Docker Desktop..." -ForegroundColor Yellow
        Start-Process $dockerPath
        Write-Host "Docker Desktop startup initiated" -ForegroundColor Green
    }
}