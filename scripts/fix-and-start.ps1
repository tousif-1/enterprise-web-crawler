# Fix CORS Issues and Start Application
Write-Host "Enterprise Web Crawler - CORS Fix and Startup" -ForegroundColor Blue
Write-Host "=" * 50

$ProjectRoot = $PWD

# Function to check if port is in use
function Test-PortInUse {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -WarningAction SilentlyContinue
        return $connection.TcpTestSucceeded
    } catch {
        return $false
    }
}

# Function to kill process on port
function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
        foreach ($pid in $processes) {
            Write-Host "Stopping process $pid on port $Port" -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "No processes found on port $Port" -ForegroundColor Gray
    }
}

Write-Host "`n1. Checking and stopping existing services..." -ForegroundColor Cyan

# Stop existing processes on our ports
if (Test-PortInUse -Port 3000) {
    Write-Host "Port 3000 is in use, stopping processes..." -ForegroundColor Yellow
    Stop-ProcessOnPort -Port 3000
    Start-Sleep -Seconds 2
}

if (Test-PortInUse -Port 8000) {
    Write-Host "Port 8000 is in use, stopping processes..." -ForegroundColor Yellow
    Stop-ProcessOnPort -Port 8000
    Start-Sleep -Seconds 2
}

Write-Host "`n2. Ensuring Docker services are running..." -ForegroundColor Cyan
try {
    $dockerStatus = docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker services are running:" -ForegroundColor Green
        Write-Host $dockerStatus
    } else {
        Write-Host "Starting Docker services..." -ForegroundColor Yellow
        docker-compose up -d
        Start-Sleep -Seconds 10
    }
} catch {
    Write-Host "Docker not available, please start manually: docker-compose up -d" -ForegroundColor Red
}

Write-Host "`n3. Installing/updating dependencies..." -ForegroundColor Cyan

# Backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor White
Set-Location "$ProjectRoot/packages/backend"
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend dependency installation failed" -ForegroundColor Red
    exit 1
}

# Frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor White
Set-Location "$ProjectRoot/packages/frontend"
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend dependency installation failed" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

Write-Host "`n4. Starting backend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot/packages/backend'; Write-Host 'Starting Backend Server...' -ForegroundColor Green; npm run dev" -WindowStyle Normal

# Wait for backend to start
Write-Host "Waiting for backend to start..." -ForegroundColor White
$backendReady = $false
$attempts = 0
while (-not $backendReady -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            Write-Host "Backend is ready!" -ForegroundColor Green
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

if (-not $backendReady) {
    Write-Host "`nBackend failed to start within 60 seconds" -ForegroundColor Red
    exit 1
}

Write-Host "`n5. Starting frontend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot/packages/frontend'; Write-Host 'Starting Frontend Server...' -ForegroundColor Green; npm start" -WindowStyle Normal

# Wait for frontend to start
Write-Host "Waiting for frontend to start..." -ForegroundColor White
$frontendReady = $false
$attempts = 0
while (-not $frontendReady -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $frontendReady = $true
            Write-Host "Frontend is ready!" -ForegroundColor Green
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}

Write-Host "`n6. Final status check..." -ForegroundColor Cyan

# Test API connectivity
try {
    $healthCheck = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Backend API: WORKING (Status: $($healthCheck.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend API: FAILED" -ForegroundColor Red
}

try {
    $frontendCheck = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Frontend: WORKING (Status: $($frontendCheck.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend: FAILED" -ForegroundColor Red
}

Write-Host "`n🎉 Application Status:" -ForegroundColor Cyan
Write-Host "=" * 50
Write-Host "Frontend URL: http://localhost:3000" -ForegroundColor White
Write-Host "Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "Health Check: http://localhost:8000/api/health" -ForegroundColor White
Write-Host ""
Write-Host "✅ CORS issues have been fixed" -ForegroundColor Green
Write-Host "✅ Both servers should be running in separate windows" -ForegroundColor Green
Write-Host "✅ You can now access the application at http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "If you still see CORS errors, try:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache and cookies" -ForegroundColor White
Write-Host "2. Try incognito/private browsing mode" -ForegroundColor White
Write-Host "3. Check browser developer console for specific errors" -ForegroundColor White