# Diagnose Connection Issues - Enterprise Web Crawler
Write-Host "🔍 Diagnosing Connection Issues" -ForegroundColor Blue
Write-Host "=" * 50

# Check if processes are running
Write-Host "`n1. Checking running processes..." -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "✅ Found Node.js processes:" -ForegroundColor Green
    foreach ($proc in $nodeProcesses) {
        Write-Host "   PID: $($proc.Id) - CPU: $($proc.CPU) - Memory: $([math]::Round($proc.WorkingSet64/1MB, 2))MB" -ForegroundColor White
    }
} else {
    Write-Host "❌ No Node.js processes found - Backend/Frontend not running" -ForegroundColor Red
}

# Check ports
Write-Host "`n2. Checking port availability..." -ForegroundColor Cyan
$ports = @(3000, 8000, 5432, 6379, 9200)
foreach ($port in $ports) {
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $port -WarningAction SilentlyContinue
        if ($connection.TcpTestSucceeded) {
            Write-Host "✅ Port $port is OPEN" -ForegroundColor Green
        } else {
            Write-Host "❌ Port $port is CLOSED" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Port $port - Error checking" -ForegroundColor Red
    }
}

# Check Docker services
Write-Host "`n3. Checking Docker services..." -ForegroundColor Cyan
try {
    $dockerStatus = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker services:" -ForegroundColor Green
        Write-Host $dockerStatus
    } else {
        Write-Host "❌ Docker not running or no containers" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Docker check failed" -ForegroundColor Red
}

# Check if backend files exist
Write-Host "`n4. Checking backend files..." -ForegroundColor Cyan
$backendFiles = @(
    "packages/backend/package.json",
    "packages/backend/src/index.ts",
    "packages/backend/src/app.ts"
)
foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $file missing" -ForegroundColor Red
    }
}

# Check if frontend files exist
Write-Host "`n5. Checking frontend files..." -ForegroundColor Cyan
$frontendFiles = @(
    "packages/frontend/package.json",
    "packages/frontend/src/main.tsx",
    "packages/frontend/vite.config.ts"
)
foreach ($file in $frontendFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $file missing" -ForegroundColor Red
    }
}

Write-Host "`n6. Recommended actions:" -ForegroundColor Yellow
Write-Host "If no Node processes are running:" -ForegroundColor White
Write-Host "  1. Start backend: cd packages/backend; npm run dev" -ForegroundColor Gray
Write-Host "  2. Start frontend: cd packages/frontend; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "If ports are closed but processes exist:" -ForegroundColor White
Write-Host "  1. Check for startup errors in the console windows" -ForegroundColor Gray
Write-Host "  2. Kill all Node processes and restart" -ForegroundColor Gray
Write-Host ""
Write-Host "If Docker services are down:" -ForegroundColor White
Write-Host "  1. Run: docker-compose up -d" -ForegroundColor Gray