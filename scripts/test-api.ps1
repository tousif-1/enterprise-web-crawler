# Test API Endpoints - Enterprise Web Crawler
Write-Host "Testing Enterprise Web Crawler API Endpoints" -ForegroundColor Blue
Write-Host "=" * 50

Write-Host "`nTesting Backend API..." -ForegroundColor Cyan

# Test Health endpoint
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Health Check: OK (Status: $($health.StatusCode))" -ForegroundColor Green
    $healthData = $health.Content | ConvertFrom-Json
    Write-Host "   Response: $($healthData.status) at $($healthData.timestamp)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health Check: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test Crawl Sessions endpoint
try {
    $sessions = Invoke-WebRequest -Uri "http://localhost:8000/api/crawl-sessions" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Crawl Sessions: OK (Status: $($sessions.StatusCode))" -ForegroundColor Green
    $sessionsData = $sessions.Content | ConvertFrom-Json
    Write-Host "   Found $($sessionsData.Count) existing sessions" -ForegroundColor Gray
} catch {
    Write-Host "❌ Crawl Sessions: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test CORS headers
try {
    $corsTest = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method OPTIONS -Headers @{"Origin"="http://localhost:3000"} -TimeoutSec 5 -UseBasicParsing
    $corsHeaders = $corsTest.Headers
    if ($corsHeaders["Access-Control-Allow-Origin"]) {
        Write-Host "✅ CORS Headers: Present" -ForegroundColor Green
        Write-Host "   Allow-Origin: $($corsHeaders['Access-Control-Allow-Origin'])" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  CORS Headers: Missing" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ CORS Test: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTesting Frontend..." -ForegroundColor Cyan

# Test Frontend
try {
    $frontend = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Frontend: OK (Status: $($frontend.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test Frontend Proxy
try {
    $proxy = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Frontend Proxy: OK (Status: $($proxy.StatusCode))" -ForegroundColor Green
    Write-Host "   Vite proxy is working correctly" -ForegroundColor Gray
} catch {
    Write-Host "❌ Frontend Proxy: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   This means Vite proxy may not be configured correctly" -ForegroundColor Gray
}

Write-Host "`nTest Summary:" -ForegroundColor Cyan
Write-Host "If all tests show ✅, your application should work without CORS errors." -ForegroundColor White
Write-Host "If you see ❌, wait a moment and run this script again." -ForegroundColor White
Write-Host ""
Write-Host "Ready to test in browser:" -ForegroundColor Green
Write-Host "http://localhost:3000" -ForegroundColor White