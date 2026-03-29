# Simple Rebuild and Restart - Enterprise Web Crawler
Write-Host "Enterprise Web Crawler - Simple Rebuild and Restart" -ForegroundColor Blue
Write-Host "=" * 50

$ProjectRoot = $PWD

Write-Host "`nStep 1: Stopping existing services..." -ForegroundColor Cyan
# Kill Node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Cleaning and rebuilding..." -ForegroundColor Cyan

# Clean frontend
Set-Location "$ProjectRoot/packages/frontend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "node_modules/.vite") { Remove-Item -Recurse -Force "node_modules/.vite" }
npm install --silent
Write-Host "Frontend dependencies updated" -ForegroundColor Green

# Clean backend  
Set-Location "$ProjectRoot/packages/backend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
npm install --silent
Write-Host "Backend dependencies updated" -ForegroundColor Green

Set-Location $ProjectRoot

Write-Host "`nStep 3: Starting Docker services..." -ForegroundColor Cyan
docker-compose up -d
Start-Sleep -Seconds 5

Write-Host "`nStep 4: Starting backend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/c", "cd /d `"$ProjectRoot\packages\backend`" && npm run dev" -WindowStyle Normal
Write-Host "Backend starting in new window..." -ForegroundColor White

# Wait for backend
$backendReady = $false
$attempts = 0
Write-Host "Waiting for backend" -NoNewline
while (-not $backendReady -and $attempts -lt 20) {
    Start-Sleep -Seconds 3
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
        }
    } catch {
        Write-Host "." -NoNewline
    }
}

if ($backendReady) {
    Write-Host " Backend ready!" -ForegroundColor Green
} else {
    Write-Host " Backend may still be starting..." -ForegroundColor Yellow
}

Write-Host "`nStep 5: Starting frontend..." -ForegroundColor Cyan
Start-Process cmd -ArgumentList "/c", "cd /d `"$ProjectRoot\packages\frontend`" && npm start" -WindowStyle Normal
Write-Host "Frontend starting in new window..." -ForegroundColor White

Start-Sleep -Seconds 5

Write-Host "`nStep 6: Testing connectivity..." -ForegroundColor Cyan

# Test backend
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
    Write-Host "Backend API: OK (Status $($health.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "Backend API: Not responding yet" -ForegroundColor Yellow
}

# Test crawl sessions
try {
    $sessions = Invoke-WebRequest -Uri "http://localhost:8000/api/crawl-sessions" -Method GET -TimeoutSec 3 -UseBasicParsing
    Write-Host "Crawl Sessions API: OK (Status $($sessions.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "Crawl Sessions API: Not responding yet" -ForegroundColor Yellow
}

Write-Host "`nApplication URLs:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Health:   http://localhost:8000/api/health" -ForegroundColor White

Write-Host "`nChanges made:" -ForegroundColor Yellow
Write-Host "- Updated CORS configuration to allow multiple origins" -ForegroundColor White
Write-Host "- Fixed Vite proxy configuration" -ForegroundColor White
Write-Host "- Cleared build caches" -ForegroundColor White
Write-Host "- Fresh dependency installation" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Green
Write-Host "1. Wait a moment for both servers to fully start" -ForegroundColor White
Write-Host "2. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "3. Try creating a crawl session" -ForegroundColor White
Write-Host "4. Check browser console if issues persist" -ForegroundColor White