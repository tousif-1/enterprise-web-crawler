# Simple System Status Check - Enterprise Web Crawler
Write-Host "Enterprise Web Crawler - System Status Check" -ForegroundColor Blue
Write-Host "=" * 50

# Function to check if a port is listening
function Test-Port {
    param([string]$HostName, [int]$Port, [string]$Service)
    try {
        $connection = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
        if ($connection.TcpTestSucceeded) {
            Write-Host "OK - $Service ($HostName" + ":" + "$Port)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "FAIL - $Service ($HostName" + ":" + "$Port) - NOT RUNNING" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "ERROR - $Service ($HostName" + ":" + "$Port) - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "`nChecking Docker containers..." -ForegroundColor Cyan
try {
    $dockerStatus = docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker containers running:" -ForegroundColor Green
        Write-Host $dockerStatus
    } else {
        Write-Host "Docker is not running" -ForegroundColor Red
    }
} catch {
    Write-Host "Docker check failed" -ForegroundColor Red
}

Write-Host "`nChecking service ports..." -ForegroundColor Cyan

# Check all required ports
$frontendUp = Test-Port -HostName "localhost" -Port 3000 -Service "Frontend"
$backendUp = Test-Port -HostName "localhost" -Port 8000 -Service "Backend"
$postgresUp = Test-Port -HostName "localhost" -Port 5432 -Service "PostgreSQL"
$redisUp = Test-Port -HostName "localhost" -Port 6379 -Service "Redis"
$elasticUp = Test-Port -HostName "localhost" -Port 9200 -Service "Elasticsearch"

Write-Host "`nChecking HTTP endpoints..." -ForegroundColor Cyan

# Check HTTP endpoints
try {
    $frontendHttp = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET -TimeoutSec 3 -UseBasicParsing
    Write-Host "OK - Frontend HTTP (Status: $($frontendHttp.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "FAIL - Frontend HTTP not responding" -ForegroundColor Red
}

try {
    $backendHttp = Invoke-WebRequest -Uri "http://localhost:8000/health" -Method GET -TimeoutSec 3 -UseBasicParsing
    Write-Host "OK - Backend Health (Status: $($backendHttp.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "FAIL - Backend Health not responding" -ForegroundColor Red
}

Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host "Frontend (3000): $(if($frontendUp){'RUNNING'}else{'STOPPED'})"
Write-Host "Backend (8000): $(if($backendUp){'RUNNING'}else{'STOPPED'})"
Write-Host "PostgreSQL (5432): $(if($postgresUp){'RUNNING'}else{'STOPPED'})"
Write-Host "Redis (6379): $(if($redisUp){'RUNNING'}else{'STOPPED'})"
Write-Host "Elasticsearch (9200): $(if($elasticUp){'RUNNING'}else{'STOPPED'})"

Write-Host "`nQuick start commands:" -ForegroundColor Yellow
if (-not $frontendUp) {
    Write-Host "Start Frontend: cd packages/frontend && npm start"
}
if (-not $backendUp) {
    Write-Host "Start Backend: cd packages/backend && npm run dev"
}
if (-not ($postgresUp -and $redisUp -and $elasticUp)) {
    Write-Host "Start Infrastructure: docker-compose up -d"
}

Write-Host "`nAccess URLs:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend: http://localhost:8000"