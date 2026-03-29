# Enterprise Web Crawler Deployment Script for Windows PowerShell
# Supports Windows deployment with Docker Desktop

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("development", "production", "test")]
    [string]$Environment = "development",
    
    [Parameter(Mandatory=$false)]
    [switch]$BuildOnly = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipTests = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$Cleanup = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help = $false
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Function to show usage
function Show-Usage {
    Write-Host "Usage: .\deploy.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Environment ENV     Set environment (development|production|test) [default: development]"
    Write-Host "  -BuildOnly           Only build images, don't deploy"
    Write-Host "  -SkipTests           Skip running tests"
    Write-Host "  -Cleanup             Cleanup containers and volumes after deployment"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1                                    # Deploy development environment"
    Write-Host "  .\deploy.ps1 -Environment production            # Deploy production environment"
    Write-Host "  .\deploy.ps1 -Environment development -BuildOnly # Build development images only"
    Write-Host "  .\deploy.ps1 -Environment test -SkipTests       # Deploy test environment, skip tests"
}

# Function to check prerequisites
function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    # Check Docker
    try {
        $dockerVersion = docker --version
        Write-Status "Docker found: $dockerVersion"
    }
    catch {
        Write-Error "Docker is not installed or not in PATH. Please install Docker Desktop first."
        exit 1
    }
    
    # Check Docker Compose
    try {
        $composeVersion = docker-compose --version
        Write-Status "Docker Compose found: $composeVersion"
    }
    catch {
        try {
            $composeVersion = docker compose version
            Write-Status "Docker Compose (plugin) found: $composeVersion"
        }
        catch {
            Write-Error "Docker Compose is not installed. Please install Docker Compose first."
            exit 1
        }
    }
    
    # Check if Docker is running
    try {
        docker ps | Out-Null
        Write-Status "Docker daemon is running"
    }
    catch {
        Write-Error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    }
    
    Write-Success "Prerequisites check completed"
}

# Function to setup environment
function Set-Environment {
    Write-Status "Setting up environment for: $Environment"
    
    # Copy appropriate environment file
    $envFile = ".env.$Environment"
    if (Test-Path $envFile) {
        Copy-Item $envFile ".env" -Force
        Write-Success "Environment file copied: $envFile -> .env"
    }
    else {
        Write-Warning "Environment file $envFile not found, using .env.example"
        Copy-Item ".env.example" ".env" -Force
    }
    
    # Windows-specific adjustments
    Write-Status "Applying Windows-specific configurations..."
    
    # Read the .env file and update paths for Windows
    $envContent = Get-Content ".env"
    $envContent = $envContent -replace "/usr/bin/chromium-browser", "C:\Program Files\Google\Chrome\Application\chrome.exe"
    $envContent | Set-Content ".env"
    
    Write-Success "Environment setup completed"
}

# Function to run tests
function Invoke-Tests {
    if ($SkipTests) {
        Write-Warning "Skipping tests as requested"
        return
    }
    
    Write-Status "Running tests..."
    
    try {
        # Use test environment
        docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres-test redis-test elasticsearch-test
        
        # Wait for services to be ready
        Write-Status "Waiting for test services to be ready..."
        Start-Sleep -Seconds 30
        
        # Run tests
        docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm backend npm run test -- --run
        docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm crawler npm run test -- --run
        docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm frontend npm run test -- --run
        
        # Cleanup test services
        docker-compose -f docker-compose.yml -f docker-compose.test.yml down -v
        
        Write-Success "Tests completed successfully"
    }
    catch {
        Write-Error "Tests failed: $_"
        exit 1
    }
}

# Function to build images
function Build-Images {
    Write-Status "Building Docker images for $Environment environment..."
    
    try {
        switch ($Environment) {
            "production" {
                docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
            }
            "development" {
                docker-compose build
            }
            "test" {
                docker-compose -f docker-compose.yml -f docker-compose.test.yml build
            }
        }
        
        Write-Success "Docker images built successfully"
    }
    catch {
        Write-Error "Failed to build Docker images: $_"
        exit 1
    }
}

# Function to deploy services
function Deploy-Services {
    if ($BuildOnly) {
        Write-Success "Build completed. Skipping deployment as requested."
        return
    }
    
    Write-Status "Deploying services for $Environment environment..."
    
    try {
        switch ($Environment) {
            "production" {
                docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            }
            "development" {
                docker-compose up -d
            }
            "test" {
                docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
            }
        }
        
        # Wait for services to be ready
        Write-Status "Waiting for services to be ready..."
        Start-Sleep -Seconds 30
        
        # Health check
        Test-Health
        
        Write-Success "Services deployed successfully"
    }
    catch {
        Write-Error "Failed to deploy services: $_"
        exit 1
    }
}

# Function to perform health check
function Test-Health {
    Write-Status "Performing health check..."
    
    $maxAttempts = 30
    $attempt = 1
    $backendPort = if ($Environment -eq "production") { 80 } else { 8000 }
    
    while ($attempt -le $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$backendPort/health" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Success "Backend service is healthy"
                return
            }
        }
        catch {
            # Continue trying
        }
        
        Write-Status "Attempt $attempt/$maxAttempts`: Waiting for backend service..."
        Start-Sleep -Seconds 10
        $attempt++
    }
    
    Write-Error "Backend service health check failed"
    exit 1
}

# Function to cleanup
function Invoke-Cleanup {
    if ($Cleanup) {
        Write-Status "Cleaning up..."
        try {
            docker-compose down -v --remove-orphans
            docker system prune -f
            Write-Success "Cleanup completed"
        }
        catch {
            Write-Warning "Cleanup encountered issues: $_"
        }
    }
}

# Main execution
function Main {
    if ($Help) {
        Show-Usage
        exit 0
    }
    
    Write-Status "Starting deployment for $Environment environment on Windows..."
    
    Test-Prerequisites
    Set-Environment
    
    if ($Environment -ne "production") {
        Invoke-Tests
    }
    
    Build-Images
    Deploy-Services
    Invoke-Cleanup
    
    Write-Success "Deployment completed successfully!"
    Write-Status "Access the application at:"
    
    $frontendPort = if ($Environment -eq "production") { 80 } else { 3000 }
    $backendPort = if ($Environment -eq "production") { 80 } else { 8000 }
    
    Write-Status "  Frontend: http://localhost:$frontendPort"
    Write-Status "  Backend API: http://localhost:$backendPort"
    Write-Status "  API Health: http://localhost:$backendPort/health"
}

# Run main function
Main