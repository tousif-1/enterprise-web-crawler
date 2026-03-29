# Check Application Status
Write-Host "Checking Application Status..." -ForegroundColor Blue

# Check Node processes
Write-Host "`nNode.js Processes:" -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes running" -ForegroundColor Green
    $nodeProcesses | Format-Table Id, ProcessName, CPU, WorkingSet -AutoSize
} else {
    Write-Host "No Node.js processes found" -ForegroundColor Red
}

# Check ports
Write-Host "`nPort Status:" -ForegroundColor Cyan
$ports = @{3000="Frontend"; 8000="Backend"; 5432="PostgreSQL"; 6379="Redis"; 9200="Elasticsearch"}
foreach ($port in $ports.Keys) {
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $port -WarningAction SilentlyContinue
        $status = if ($connection.TcpTestSucceeded) { "OPEN" } else { "CLOSED" }
        $color = if ($connection.TcpTestSucceeded) { "Green" } else { "Red" }
        Write-Host "Port $port ($($ports[$port])): $status" -ForegroundColor $color
    } catch {
        Write-Host "Port $port ($($ports[$port])): ERROR" -ForegroundColor Red
    }
}

# Check Docker
Write-Host "`nDocker Status:" -ForegroundColor Cyan
try {
    docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null | Write-Host
} catch {
    Write-Host "Docker not available" -ForegroundColor Red
}

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "If Backend (port 8000) is CLOSED:" -ForegroundColor White
Write-Host "  cd packages/backend" -ForegroundColor Gray
Write-Host "  npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "If Frontend (port 3000) is CLOSED:" -ForegroundColor White
Write-Host "  cd packages/frontend" -ForegroundColor Gray
Write-Host "  npm start" -ForegroundColor Gray