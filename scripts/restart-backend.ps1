# Restart Backend with TypeScript Fix
Write-Host "Restarting Backend with TypeScript Fix..." -ForegroundColor Blue

# Kill existing Node processes
Write-Host "Stopping existing Node processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Navigate to backend directory
Set-Location "packages/backend"

Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host "Backend will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "API endpoints: http://localhost:8000/api/*" -ForegroundColor Cyan
Write-Host ""

# Start the backend
npm run dev