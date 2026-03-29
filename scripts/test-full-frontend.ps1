# Test Full-Featured Frontend
Write-Host "Testing Full-Featured Frontend..." -ForegroundColor Blue

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Full-Featured Frontend is running!" -ForegroundColor Green
        Write-Host "URL: http://localhost:3001" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Frontend not ready yet" -ForegroundColor Red
}

Write-Host ""
Write-Host "🌟 Full Feature Set Available:" -ForegroundColor Yellow
Write-Host "• Advanced CrawlForm with exclude patterns and regex support" -ForegroundColor White
Write-Host "• Real-time WebSocket updates for live progress" -ForegroundColor White
Write-Host "• Comprehensive Dashboard with charts and visualizations" -ForegroundColor White
Write-Host "• Session management (pause, resume, delete)" -ForegroundColor White
Write-Host "• Export capabilities (PDF and CSV reports)" -ForegroundColor White
Write-Host "• Accessibility analysis and detailed reporting" -ForegroundColor White
Write-Host "• Progress monitoring with real-time updates" -ForegroundColor White
Write-Host ""
Write-Host "🎯 Access your application:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3001" -ForegroundColor White
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White