# Enterprise Web Crawler - Integration Test Execution Script
param(
    [switch]$SkipSetup,
    [switch]$Verbose,
    [string]$TestPattern = "*"
)

Write-Host "Enterprise Web Crawler - Integration Test Execution" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Test configuration
$TestTimeout = 300000  # 5 minutes per test suite
$TestSuites = @(
    @{
        Name = "Cross-Platform Compatibility"
        File = "cross-platform.test.ts"
        Description = "Verify system works across Mac, Windows, and Docker environments"
        Requirements = @("6.1", "6.2", "6.3")
    },
    @{
        Name = "Complete Workflow Integration"
        File = "complete-workflow.test.ts"
        Description = "Test end-to-end crawl workflows from creation to reporting"
        Requirements = @("1.7", "2.3", "4.4", "5.1")
    },
    @{
        Name = "Large-Scale Performance"
        File = "large-scale.test.ts"
        Description = "Validate performance with 75,000+ links across 150 countries"
        Requirements = @("5.1", "5.2", "5.3", "5.4")
    },
    @{
        Name = "WebSocket Real-time Updates"
        File = "websocket-realtime.test.ts"
        Description = "Verify real-time updates and WebSocket functionality"
        Requirements = @("1.7", "2.3", "7.1")
    },
    @{
        Name = "Accessibility Compliance E2E"
        File = "accessibility-e2e.test.ts"
        Description = "End-to-end accessibility compliance testing (WCAG 2.2 AA)"
        Requirements = @("3.1", "3.2", "3.3", "3.4")
    }
)

# Setup test environment
if (-not $SkipSetup) {
    Write-Host "`nSetting up test environment..." -ForegroundColor Cyan
    
    # Install missing dependencies
    if (-not (Test-Path "packages/crawler/node_modules")) {
        Write-Host "Installing crawler dependencies..." -ForegroundColor Yellow
        Set-Location "packages/crawler"
        & npm install
        Set-Location $ProjectRoot
    }
    
    if (-not (Test-Path "packages/shared/node_modules")) {
        Write-Host "Installing shared dependencies..." -ForegroundColor Yellow
        Set-Location "packages/shared"
        & npm install
        Set-Location $ProjectRoot
    }
    
    # Start test services
    Write-Host "Starting test services..." -ForegroundColor Cyan
    & docker-compose -f docker-compose.test.yml up -d postgres redis elasticsearch
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[PASS] Test services started" -ForegroundColor Green
        Start-Sleep -Seconds 10  # Wait for services to be ready
    } else {
        Write-Host "[WARN] Failed to start some test services" -ForegroundColor Yellow
    }
}

# Run integration tests
Write-Host "`nExecuting Integration Test Suites" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

$TestResults = @()
$TotalStartTime = Get-Date

Set-Location "packages/backend"

foreach ($suite in $TestSuites) {
    if ($TestPattern -ne "*" -and $suite.File -notlike "*$TestPattern*") {
        Write-Host "[SKIP] Skipping $($suite.Name) (pattern filter)" -ForegroundColor Gray
        continue
    }
    
    Write-Host "`nRunning: $($suite.Name)" -ForegroundColor Cyan
    Write-Host "Description: $($suite.Description)" -ForegroundColor Gray
    Write-Host "Requirements: $($suite.Requirements -join ', ')" -ForegroundColor Gray
    Write-Host "Timeout: $($TestTimeout / 1000)s" -ForegroundColor Gray
    
    $suiteStartTime = Get-Date
    
    try {
        # Run the test suite
        $testFile = "src/__tests__/integration/$($suite.File)"
        
        if (-not (Test-Path $testFile)) {
            Write-Host "[FAIL] Test file not found: $testFile" -ForegroundColor Red
            $TestResults += @{
                Suite = $suite.Name
                Status = "Failed"
                Duration = 0
                Error = "Test file not found"
            }
            continue
        }
        
        # Execute Jest test
        $jestArgs = @(
            $testFile,
            "--verbose",
            "--detectOpenHandles",
            "--forceExit",
            "--testTimeout=$TestTimeout",
            "--runInBand"
        )
        
        if ($Verbose) {
            $jestArgs += "--verbose"
        }
        
        $testOutput = & npx jest @jestArgs 2>&1
        $testExitCode = $LASTEXITCODE
        
        $duration = ((Get-Date) - $suiteStartTime).TotalMilliseconds
        
        if ($testExitCode -eq 0) {
            Write-Host "[PASS] $($suite.Name) completed in $([math]::Round($duration))ms" -ForegroundColor Green
            $TestResults += @{
                Suite = $suite.Name
                Status = "Passed"
                Duration = $duration
                Error = $null
            }
        } else {
            Write-Host "[FAIL] $($suite.Name) failed after $([math]::Round($duration))ms" -ForegroundColor Red
            if ($Verbose) {
                Write-Host $testOutput -ForegroundColor Gray
            }
            $TestResults += @{
                Suite = $suite.Name
                Status = "Failed"
                Duration = $duration
                Error = "Test execution failed"
            }
        }
        
    } catch {
        $duration = ((Get-Date) - $suiteStartTime).TotalMilliseconds
        Write-Host "[FAIL] $($suite.Name) error after $([math]::Round($duration))ms" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        
        $TestResults += @{
            Suite = $suite.Name
            Status = "Error"
            Duration = $duration
            Error = $_.Exception.Message
        }
    }
}

Set-Location $ProjectRoot

# Generate test report
$TotalDuration = ((Get-Date) - $TotalStartTime).TotalMilliseconds
$PassedTests = ($TestResults | Where-Object { $_.Status -eq "Passed" }).Count
$FailedTests = ($TestResults | Where-Object { $_.Status -ne "Passed" }).Count
$TotalTests = $TestResults.Count

Write-Host "`nIntegration Test Results" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host "Platform: $([System.Environment]::OSVersion.Platform)" -ForegroundColor Cyan
Write-Host "Total Test Suites: $TotalTests" -ForegroundColor Cyan
Write-Host "Passed: $PassedTests" -ForegroundColor Green
Write-Host "Failed: $FailedTests" -ForegroundColor Red
Write-Host "Total Duration: $([math]::Round($TotalDuration / 1000))s" -ForegroundColor Cyan

Write-Host "`nDetailed Results:" -ForegroundColor Blue
foreach ($result in $TestResults) {
    $status = switch ($result.Status) {
        "Passed" { "[PASS]"; "Green" }
        "Failed" { "[FAIL]"; "Red" }
        "Error" { "[ERROR]"; "Red" }
        default { "[UNKNOWN]"; "Yellow" }
    }
    
    $durationSec = [math]::Round($result.Duration / 1000, 1)
    Write-Host "$($status[0]) $($result.Suite) ($($durationSec)s)" -ForegroundColor $status[1]
    
    if ($result.Error -and $Verbose) {
        Write-Host "   Error: $($result.Error)" -ForegroundColor Gray
    }
}

# Requirements coverage
Write-Host "`nRequirements Coverage:" -ForegroundColor Blue
$allRequirements = $TestSuites | ForEach-Object { $_.Requirements } | Sort-Object -Unique
$coveredRequirements = ($TestResults | Where-Object { $_.Status -eq "Passed" } | ForEach-Object { 
    $passedSuite = $_.Suite
    ($TestSuites | Where-Object { $_.Name -eq $passedSuite }).Requirements 
}) | Sort-Object -Unique

foreach ($req in $allRequirements) {
    if ($req -in $coveredRequirements) {
        Write-Host "[PASS] Requirement $req" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Requirement $req" -ForegroundColor Red
    }
}

# Final assessment
Write-Host "`nFinal Assessment:" -ForegroundColor Blue
if ($FailedTests -eq 0) {
    Write-Host "ALL INTEGRATION TESTS PASSED!" -ForegroundColor Green
    Write-Host "System is ready for deployment across all platforms" -ForegroundColor Green
    
    Write-Host "`nValidated Capabilities:" -ForegroundColor Blue
    Write-Host "  - Cross-platform compatibility (Mac, Windows, Docker)" -ForegroundColor Green
    Write-Host "  - Large-scale processing (75,000+ links)" -ForegroundColor Green
    Write-Host "  - Real-time WebSocket functionality" -ForegroundColor Green
    Write-Host "  - End-to-end accessibility compliance (WCAG 2.2 AA)" -ForegroundColor Green
    Write-Host "  - Complete workflow integration" -ForegroundColor Green
    
    $exitCode = 0
} else {
    Write-Host "SOME INTEGRATION TESTS FAILED" -ForegroundColor Red
    Write-Host "Please review and fix the failing tests before deployment" -ForegroundColor Red
    
    Write-Host "`nFailed Test Suites:" -ForegroundColor Red
    $TestResults | Where-Object { $_.Status -ne "Passed" } | ForEach-Object {
        Write-Host "  - $($_.Suite): $($_.Error)" -ForegroundColor Red
    }
    
    $exitCode = 1
}

# Cleanup
if (-not $SkipSetup) {
    Write-Host "`nCleaning up test environment..." -ForegroundColor Cyan
    & docker-compose -f docker-compose.test.yml down --remove-orphans
}

Write-Host "`nIntegration testing completed." -ForegroundColor Blue
exit $exitCode