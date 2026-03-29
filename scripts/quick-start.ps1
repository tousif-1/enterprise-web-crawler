# Quick Start - Enterprise Web Crawler (CORS Fixed)
Write-Host "Enterprise Web Crawler - Quick Start with CORS Fix" -ForegroundColor Blue
Write-Host "=" * 50

$ProjectRoot = $PWD

# Kill existing processes
Write-Host "Stopping existing Node processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Docker services (skip if already running)
Write-Host "Ensuring Docker services are running..." -ForegroundColor Cyan
docker-compose up -d postgres redis elasticsearch
Start-Sleep -Seconds 3

Write-Host "`nStarting Backend Server..." -ForegroundColor Green
Set-Location "$ProjectRoot/packages/backend"
Start-Process powershell -ArgumentList "-Command", "npm run dev; Read-Host 'Press Enter to close'" -WindowStyle Normal

Write-Host "Waiting for backend to start..." -ForegroundColor White
Start-Sleep -Seconds 8

# Test backend
$backendReady = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $backendReady = $true
        Write-Host "Backend is ready!" -ForegroundColor Green
    }
} catch {
    Write-Host "Backend is still starting..." -ForegroundColor Yellow
}

Write-Host "`nStarting Frontend Server..." -ForegroundColor Green
Set-Location "$ProjectRoot/packages/frontend"
Start-Process powershell -ArgumentList "-Command", "npm start; Read-Host 'Press Enter to close'" -WindowStyle Normal

Set-Location $ProjectRoot

Write-Host "`nServices Status:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000 (starting...)" -ForegroundColor White
Write-Host "Backend:  http://localhost:8000 $(if($backendReady){'(ready)'}else{'(starting...)'})" -ForegroundColor White

Write-Host "`nCORS Configuration Applied:" -ForegroundColor Green
Write-Host "- Multiple origin support added" -ForegroundColor White
Write-Host "- Vite proxy configuration fixed" -ForegroundColor White
Write-Host "- Socket.IO CORS updated" -ForegroundColor White

Write-Host "`nTest the application:" -ForegroundColor Yellow
Write-Host "1. Wait 30 seconds for both servers to fully start" -ForegroundColor White
Write-Host "2. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "3. Try creating a new crawl session" -ForegroundColor White
Write-Host "4. The API requests should now work without CORS errors" -ForegroundColor White

Write-Host "`nIf you still see CORS errors:" -ForegroundColor Red
Write-Host "- Clear browser cache completely" -ForegroundColor White
Write-Host "- Try incognito/private browsing" -ForegroundColor White
Write-Host "- Check that both PowerShell windows are running" -ForegroundColor White