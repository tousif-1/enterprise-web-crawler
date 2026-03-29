# Complete System Status Check - Enterprise Web Crawler
Write-Host "🔍 Enterprise Web Crawler - System Status Check" -ForegroundColor Blue
Write-Host "=" * 60 -ForegroundColor Gray

# Function to check if a port is listening
function Test-Port {
    param([string]$Host, [int]$Port, [string]$Service)
    try {
        $connection = Test-NetConnection -ComputerName $Host -Port $Port -WarningAction SilentlyContinue
        if ($connection.TcpTestSucceeded) {
            Write-Host "✅ $Service ($Host`:$Port)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ $Service ($Host`:$Port) - NOT RUNNING" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ $Service ($Host`:$Port) - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to check HTTP endpoint
function Test-HttpEndpoint {
    param([string]$Url, [string]$Service)
    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $Service ($Url) - HTTP 200 OK" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️  $Service ($Url) - HTTP $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ $Service ($Url) - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "`n🐳 Docker Infrastructure Services:" -ForegroundColor Cyan
Write-Host "-" * 40

# Check Docker services
$dockerRunning = $false
try {
    $dockerStatus = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker containers:" -ForegroundColor White
        Write-Host $dockerStatus
        $dockerRunning = $true
    } else {
        Write-Host "❌ Docker is not running or accessible" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Docker check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🔌 Port Connectivity Check:" -ForegroundColor Cyan
Write-Host "-" * 40

# Check all required ports
$services = @{
    "Frontend (Vite)" = @{ Host = "localhost"; Port = 3000 }
    "Backend API" = @{ Host = "localhost"; Port = 8000 }
    "PostgreSQL" = @{ Host = "localhost"; Port = 5432 }
    "Redis" = @{ Host = "localhost"; Port = 6379 }
    "Elasticsearch" = @{ Host = "localhost"; Port = 9200 }
}

$allServicesUp = $true
foreach ($service in $services.GetEnumerator()) {
    $isUp = Test-Port -Host $service.Value.Host -Port $service.Value.Port -Service $service.Key
    if (-not $isUp) { $allServicesUp = $false }
}

Write-Host "`n🌐 HTTP Endpoint Check:" -ForegroundColor Cyan
Write-Host "-" * 40

# Check HTTP endpoints
$httpEndpoints = @{
    "Frontend" = "http://localhost:3000"
    "Backend Health" = "http://localhost:8000/health"
    "Backend API" = "http://localhost:8000/api/crawl-sessions"
    "Elasticsearch" = "http://localhost:9200"
}

$allEndpointsUp = $true
foreach ($endpoint in $httpEndpoints.GetEnumerator()) {
    $isUp = Test-HttpEndpoint -Url $endpoint.Value -Service $endpoint.Key
    if (-not $isUp) { $allEndpointsUp = $false }
}

Write-Host "`n📁 File System Check:" -ForegroundColor Cyan
Write-Host "-" * 40

# Check critical files
$criticalFiles = @(
    "packages/frontend/package.json",
    "packages/backend/package.json", 
    "docker-compose.yml",
    "packages/frontend/src/App.tsx",
    "packages/backend/src/index.ts"
)

$allFilesExist = $true
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "❌ $file - MISSING" -ForegroundColor Red
        $allFilesExist = $false
    }
}

Write-Host "`n🔄 Process Check:" -ForegroundColor Cyan
Write-Host "-" * 40

# Check for Node.js processes
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "✅ Node.js processes running:" -ForegroundColor Green
    foreach ($proc in $nodeProcesses) {
        Write-Host "  PID: $($proc.Id) - $($proc.ProcessName)" -ForegroundColor White
    }
} else {
    Write-Host "❌ No Node.js processes found" -ForegroundColor Red
}

Write-Host "`n📊 Summary:" -ForegroundColor Cyan
Write-Host "=" * 60

if ($dockerRunning) {
    Write-Host "✅ Docker Infrastructure: RUNNING" -ForegroundColor Green
} else {
    Write-Host "❌ Docker Infrastructure: NOT RUNNING" -ForegroundColor Red
}

if ($allServicesUp) {
    Write-Host "✅ All Ports: ACCESSIBLE" -ForegroundColor Green
} else {
    Write-Host "❌ Some Ports: NOT ACCESSIBLE" -ForegroundColor Red
}

if ($allEndpointsUp) {
    Write-Host "✅ All HTTP Endpoints: RESPONDING" -ForegroundColor Green
} else {
    Write-Host "❌ Some HTTP Endpoints: NOT RESPONDING" -ForegroundColor Red
}

if ($allFilesExist) {
    Write-Host "✅ All Critical Files: PRESENT" -ForegroundColor Green
} else {
    Write-Host "❌ Some Critical Files: MISSING" -ForegroundColor Red
}

Write-Host "`n🚀 Quick Actions:" -ForegroundColor Cyan
Write-Host "-" * 40

if (-not $dockerRunning) {
    Write-Host "🔧 To start Docker services:" -ForegroundColor Yellow
    Write-Host "   docker-compose up -d" -ForegroundColor White
}

if (-not (Test-Port -Host "localhost" -Port 8000 -Service "Backend")) {
    Write-Host "🔧 To start Backend:" -ForegroundColor Yellow
    Write-Host "   cd packages/backend && npm run dev" -ForegroundColor White
}

if (-not (Test-Port -Host "localhost" -Port 3000 -Service "Frontend")) {
    Write-Host "🔧 To start Frontend:" -ForegroundColor Yellow
    Write-Host "   cd packages/frontend && npm start" -ForegroundColor White
}

Write-Host "`n🌟 Access URLs (if running):" -ForegroundColor Cyan
Write-Host "-" * 40
Write-Host "Frontend:     http://localhost:3000" -ForegroundColor White
Write-Host "Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "Health Check: http://localhost:8000/health" -ForegroundColor White

Write-Host "`n" -ForegroundColor White