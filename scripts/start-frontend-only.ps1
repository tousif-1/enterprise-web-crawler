# Start Frontend Only - Enterprise Web Crawler
Write-Host "Starting Enterprise Web Crawler Frontend..." -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location "$ProjectRoot/packages/frontend"

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🚀 Starting Vite Development Server..." -ForegroundColor Green
Write-Host "📱 Frontend will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔗 Backend should be running at: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚡ Features:" -ForegroundColor Yellow
Write-Host "  • Hot Module Replacement (HMR)" -ForegroundColor White
Write-Host "  • TypeScript Support" -ForegroundColor White
Write-Host "  • React DevTools Compatible" -ForegroundColor White
Write-Host "  • API Proxy to Backend" -ForegroundColor White
Write-Host ""
Write-Host "🛑 Press Ctrl+C to stop the server" -ForegroundColor Red
Write-Host ""

# Start Vite development server
npm run dev