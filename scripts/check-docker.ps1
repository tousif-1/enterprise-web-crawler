# Check Docker Status and Provide Guidance

Write-Host "🐳 Docker Status Check" -ForegroundColor Blue
Write-Host "=====================" -ForegroundColor Blue

# Check if Docker command is available
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker Desktop from:" -ForegroundColor Yellow
    Write-Host "https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Docker command is available" -ForegroundColor Green

# Check if Docker Desktop is running
try {
    $dockerInfo = & docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
        
        # Show Docker info
        $version = & docker --version
        Write-Host "   $version" -ForegroundColor Gray
        
        # Check available resources
        Write-Host ""
        Write-Host "📊 Docker Resources:" -ForegroundColor Blue
        & docker system df
        
        Write-Host ""
        Write-Host "🚀 Ready to start the application!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Run the application with:" -ForegroundColor Blue
        Write-Host "   .\scripts\start-app.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "Or manually with:" -ForegroundColor Blue
        Write-Host "   docker-compose up -d" -ForegroundColor White
        
    } else {
        throw "Docker not responding"
    }
} catch {
    Write-Host "❌ Docker Desktop is not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker Desktop:" -ForegroundColor Yellow
    Write-Host "1. Look for Docker Desktop in your Start menu" -ForegroundColor White
    Write-Host "2. Click on Docker Desktop to start it" -ForegroundColor White
    Write-Host "3. Wait for the Docker icon to appear in your system tray" -ForegroundColor White
    Write-Host "4. The icon should show 'Docker Desktop is running'" -ForegroundColor White
    Write-Host ""
    Write-Host "Once Docker Desktop is running, try again:" -ForegroundColor Cyan
    Write-Host "   .\scripts\check-docker.ps1" -ForegroundColor White
    
    # Try to start Docker Desktop automatically
    Write-Host ""
    Write-Host "Attempting to start Docker Desktop..." -ForegroundColor Yellow
    
    $dockerDesktopPath = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopPath) {
        Start-Process $dockerDesktopPath
        Write-Host "✅ Docker Desktop startup initiated" -ForegroundColor Green
        Write-Host "Please wait 30-60 seconds for Docker Desktop to fully start" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  Could not find Docker Desktop executable" -ForegroundColor Yellow
        Write-Host "Please start Docker Desktop manually" -ForegroundColor Yellow
    }
}