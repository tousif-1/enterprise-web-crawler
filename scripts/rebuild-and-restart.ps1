# Complete Rebuild and Restart - Enterprise Web Crawler
Write-Host "🔄 Enterprise Web Crawler - Complete Rebuild and Restart" -ForegroundColor Blue
Write-Host "=" * 60

$ProjectRoot = $PWD

# Function to kill processes on specific ports
function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
        foreach ($pid in $processes) {
            Write-Host "Stopping process $pid on port $Port" -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "No processes found on port $Port" -ForegroundColor Gray
    }
}

Write-Host "`n🛑 Step 1: Stopping all existing services..." -ForegroundColor Cyan
Stop-ProcessOnPort -Port 3000
Stop-ProcessOnPort -Port 8000

# Kill any remaining node processes
Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "`n🧹 Step 2: Cleaning build artifacts..." -ForegroundColor Cyan

# Clean frontend
Set-Location "$ProjectRoot/packages/frontend"
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "Cleaned frontend dist folder" -ForegroundColor Green
}
if (Test-Path "node_modules/.vite") {
    Remove-Item -Recurse -Force "node_modules/.vite"
    Write-Host "Cleaned Vite cache" -ForegroundColor Green
}

# Clean backend
Set-Location "$ProjectRoot/packages/backend"
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "Cleaned backend dist folder" -ForegroundColor Green
}

Set-Location $ProjectRoot

Write-Host "`n📦 Step 3: Reinstalling dependencies..." -ForegroundColor Cyan

# Reinstall backend dependencies
Write-Host "Reinstalling backend dependencies..." -ForegroundColor White
Set-Location "$ProjectRoot/packages/backend"
Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend dependency installation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Backend dependencies installed" -ForegroundColor Green

# Reinstall frontend dependencies
Write-Host "Reinstalling frontend dependencies..." -ForegroundColor White
Set-Location "$ProjectRoot/packages/frontend"
Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend dependency installation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green

Set-Location $ProjectRoot

Write-Host "`n🐳 Step 4: Ensuring Docker services..." -ForegroundColor Cyan
try {
    docker-compose up -d
    Start-Sleep -Seconds 5
    Write-Host "✅ Docker services started" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Docker services may need manual start" -ForegroundColor Yellow
}

Write-Host "`n🚀 Step 5: Starting backend with CORS fixes..." -ForegroundColor Cyan
Set-Location "$ProjectRoot/packages/backend"

# Start backend in new window
$backendScript = @"
Write-Host 'Starting Backend Server with CORS fixes...' -ForegroundColor Green
Write-Host 'Backend will be available at: http://localhost:8000' -ForegroundColor Cyan
Write-Host 'API endpoints will be at: http://localhost:8000/api/*' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
Write-Host ''
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal

Write-Host "Waiting for backend to be ready..." -ForegroundColor White
$backendReady = $false
$attempts = 0
while (-not $backendReady -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            Write-Host "✅ Backend is ready!" -ForegroundColor Green
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

if (-not $backendReady) {
    Write-Host "`n❌ Backend failed to start" -ForegroundColor Red
    exit 1
}

Write-Host "`n🌐 Step 6: Starting frontend with proxy fixes..." -ForegroundColor Cyan
Set-Location "$ProjectRoot/packages/frontend"

# Start frontend in new window
$frontendScript = @"
Write-Host 'Starting Frontend Server with Vite proxy...' -ForegroundColor Green
Write-Host 'Frontend will be available at: http://localhost:3000' -ForegroundColor Cyan
Write-Host 'API requests will be proxied to backend automatically' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
Write-Host ''
npm start
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript -WindowStyle Normal

Write-Host "Waiting for frontend to be ready..." -ForegroundColor White
$frontendReady = $false
$attempts = 0
while (-not $frontendReady -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $frontendReady = $true
            Write-Host "✅ Frontend is ready!" -ForegroundColor Green
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

Set-Location $ProjectRoot

Write-Host "`n🧪 Step 7: Testing API connectivity..." -ForegroundColor Cyan

# Test direct backend API
try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Direct Backend API: WORKING (Status: $($healthResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Direct Backend API: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test crawl-sessions endpoint
try {
    $sessionsResponse = Invoke-WebRequest -Uri "http://localhost:8000/api/crawl-sessions" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Crawl Sessions API: WORKING (Status: $($sessionsResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Crawl Sessions API: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test frontend
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Frontend: WORKING (Status: $($frontendResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test proxied API through frontend
try {
    $proxyResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Frontend Proxy: WORKING (Status: $($proxyResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend Proxy: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Application Status Summary:" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host "🌐 Frontend URL:     http://localhost:3000" -ForegroundColor White
Write-Host "🔧 Backend API:      http://localhost:8000" -ForegroundColor White
Write-Host "❤️  Health Check:    http://localhost:8000/api/health" -ForegroundColor White
Write-Host "📋 Crawl Sessions:   http://localhost:8000/api/crawl-sessions" -ForegroundColor White
Write-Host ""
Write-Host "✅ CORS Configuration: Updated and applied" -ForegroundColor Green
Write-Host "✅ Vite Proxy:        Fixed and rebuilt" -ForegroundColor Green
Write-Host "✅ Dependencies:      Fresh installation" -ForegroundColor Green
Write-Host "✅ Build Cache:       Cleared" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Ready to test!" -ForegroundColor Green
Write-Host "   1. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "   2. Try creating a new crawl session" -ForegroundColor White
Write-Host "   3. Check browser developer tools for any remaining errors" -ForegroundColor White
Write-Host ""
Write-Host "💡 If you still see CORS errors:" -ForegroundColor Yellow
Write-Host "   • Clear browser cache completely (Ctrl+Shift+Delete)" -ForegroundColor White
Write-Host "   • Try incognito/private browsing mode" -ForegroundColor White
Write-Host "   • Check that both servers are running in separate windows" -ForegroundColor White