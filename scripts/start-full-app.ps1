# Start Full-Featured Enterprise Web Crawler
Write-Host "🚀 Starting Full-Featured Enterprise Web Crawler..." -ForegroundColor Blue
Write-Host "=" * 60

# Start backend
Write-Host "`n🔧 Starting Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/backend'; Write-Host 'Backend Server (Full API)' -ForegroundColor Green; npx ts-node src/simple-server.ts; Read-Host 'Press Enter to close'" -WindowStyle Normal

# Wait for backend
Start-Sleep -Seconds 8

# Test backend
Write-Host "Testing backend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is ready!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Backend still starting..." -ForegroundColor Yellow
}

# Start frontend
Write-Host "`n🎨 Starting Full-Featured Frontend..." -ForegroundColor Green
Write-Host "Features enabled:" -ForegroundColor Cyan
Write-Host "  ✅ Advanced CrawlForm with exclude patterns" -ForegroundColor White
Write-Host "  ✅ Real-time WebSocket updates" -ForegroundColor White
Write-Host "  ✅ Full Dashboard with charts" -ForegroundColor White
Write-Host "  ✅ Session management (pause/resume)" -ForegroundColor White
Write-Host "  ✅ Report generation (PDF/CSV)" -ForegroundColor White
Write-Host "  ✅ Progress monitoring" -ForegroundColor White

Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/frontend'; Write-Host 'Full-Featured Frontend Starting...' -ForegroundColor Green; npm start; Read-Host 'Press Enter to close'" -WindowStyle Normal

Write-Host "`n⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "`n🎯 Application Status:" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "🌟 Full Feature Set Now Available:" -ForegroundColor Green
Write-Host "• Advanced crawl configuration with exclude patterns" -ForegroundColor White
Write-Host "• Real-time progress updates via WebSocket" -ForegroundColor White
Write-Host "• Comprehensive dashboard with visualizations" -ForegroundColor White
Write-Host "• Session management and control" -ForegroundColor White
Write-Host "• Export capabilities (PDF/CSV)" -ForegroundColor White
Write-Host "• Accessibility analysis and reporting" -ForegroundColor White
Write-Host ""
Write-Host "Ready! Open http://localhost:3000 in your browser" -ForegroundColor Yellow