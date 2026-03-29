# Start Working Application - Simple Version
Write-Host "Starting Working Enterprise Web Crawler..." -ForegroundColor Blue
Write-Host "=" * 50

# Kill existing processes
Write-Host "Stopping existing processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Start simple backend in new window
Write-Host "Starting simple backend server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/backend'; Write-Host 'Simple Backend Starting...' -ForegroundColor Green; npx ts-node src/simple-server.ts; Read-Host 'Press Enter to close'" -WindowStyle Normal

# Wait for backend
Write-Host "Waiting for backend to start..." -ForegroundColor White
Start-Sleep -Seconds 5

# Test backend
$backendWorking = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $backendWorking = $true
        Write-Host "✅ Backend is working!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Backend still starting..." -ForegroundColor Yellow
}

# Start frontend in new window
Write-Host "Starting frontend server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/frontend'; Write-Host 'Frontend Starting...' -ForegroundColor Green; npm start; Read-Host 'Press Enter to close'" -WindowStyle Normal

Write-Host "`nApplication Status:" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000 $(if($backendWorking){'(ready)'}else{'(starting...)'})" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000 (starting...)" -ForegroundColor White
Write-Host ""
Write-Host "✅ Simple backend with CORS fixes" -ForegroundColor Green
Write-Host "✅ Frontend with Vite proxy" -ForegroundColor Green
Write-Host ""
Write-Host "Wait 30 seconds then test:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:3000" -ForegroundColor White
Write-Host "2. Try creating a crawl session" -ForegroundColor White
Write-Host "3. Should work without CORS errors" -ForegroundColor White