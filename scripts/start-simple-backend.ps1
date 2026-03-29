# Start Simple Backend Server
Write-Host "Starting Simple Backend Server..." -ForegroundColor Blue

# Kill existing processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Navigate to backend
Set-Location "packages/backend"

Write-Host "Starting simple backend server..." -ForegroundColor Green
Write-Host "Backend will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""

# Start simple server directly with ts-node
npx ts-node src/simple-server.ts