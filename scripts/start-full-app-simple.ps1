# Start Full-Featured Enterprise Web Crawler
Write-Host "Starting Full-Featured Enterprise Web Crawler..." -ForegroundColor Blue

# Start backend
Write-Host "Starting Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/backend'; npx ts-node src/simple-server.ts; Read-Host 'Press Enter to close'" -WindowStyle Normal

# Wait for backend
Start-Sleep -Seconds 8

# Start frontend
Write-Host "Starting Full-Featured Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-Command", "cd '$PWD/packages/frontend'; npm start; Read-Host 'Press Enter to close'" -WindowStyle Normal

Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "Application Status:" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "Ready! Open http://localhost:3000 in your browser" -ForegroundColor Yellow