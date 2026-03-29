# Clear Cache and Restart Frontend - Enterprise Web Crawler
Write-Host "🧹 Clearing Frontend Cache and Restarting..." -ForegroundColor Blue
Write-Host "=" * 50

$ProjectRoot = $PWD

# Stop all Node processes
Write-Host "1. Stopping all Node processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Clear frontend cache and build artifacts
Write-Host "2. Clearing frontend cache..." -ForegroundColor Cyan
Set-Location "$ProjectRoot/packages/frontend"

# Remove Vite cache
if (Test-Path "node_modules/.vite") {
    Remove-Item -Recurse -Force "node_modules/.vite"
    Write-Host "✅ Cleared Vite cache" -ForegroundColor Green
}

# Remove dist folder
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "✅ Cleared dist folder" -ForegroundColor Green
}

# Clear npm cache for this project
npm cache clean --force 2>$null
Write-Host "✅ Cleared npm cache" -ForegroundColor Green

# Reinstall dependencies to ensure latest
Write-Host "3. Reinstalling frontend dependencies..." -ForegroundColor Cyan
Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend dependencies reinstalled" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

# Restart backend first
Write-Host "4. Starting backend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd '$ProjectRoot/packages/backend'; Write-Host 'Backend Starting (Simple Server)...' -ForegroundColor Green; npx ts-node src/simple-server.ts; Read-Host 'Press Enter to close'" -WindowStyle Normal

# Wait for backend
Write-Host "Waiting for backend to start..." -ForegroundColor White
Start-Sleep -Seconds 5

# Test backend
$backendReady = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $backendReady = $true
        Write-Host "✅ Backend is ready!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Backend still starting..." -ForegroundColor Yellow
}

# Start frontend with fresh cache
Write-Host "5. Starting frontend with cleared cache..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd '$ProjectRoot/packages/frontend'; Write-Host 'Frontend Starting (Fresh Cache)...' -ForegroundColor Green; Write-Host 'Vite will rebuild everything from scratch...' -ForegroundColor Yellow; npm start; Read-Host 'Press Enter to close'" -WindowStyle Normal

Write-Host "`n🎯 Cache Clearing Complete!" -ForegroundColor Green
Write-Host "=" * 50
Write-Host "✅ Vite cache cleared" -ForegroundColor White
Write-Host "✅ Build artifacts removed" -ForegroundColor White  
Write-Host "✅ Dependencies reinstalled" -ForegroundColor White
Write-Host "✅ Fresh frontend starting" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Application Status:" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000 $(if($backendReady){'(ready)'}else{'(starting...)'})" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000 (rebuilding with fresh cache...)" -ForegroundColor White
Write-Host ""
Write-Host "⏱️ Wait 30-60 seconds for complete rebuild, then:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:3000" -ForegroundColor White
Write-Host "2. You should see the latest frontend code" -ForegroundColor White
Write-Host "3. All components should load properly" -ForegroundColor White
Write-Host "4. API connectivity should work without issues" -ForegroundColor White