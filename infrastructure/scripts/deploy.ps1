# Enterprise Web Crawler - AWS Deployment Script (PowerShell)
param(
    [string]$Environment = "dev",
    [string]$Region = "us-west-2",
    [string]$ProjectName = "enterprise-web-crawler",
    [switch]$SkipTests,
    [switch]$SkipBuild,
    [switch]$Force,
    [switch]$Help
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$TerraformDir = Join-Path $ProjectRoot "infrastructure\terraform"

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

# Logging functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

# Help function
function Show-Help {
    @"
Enterprise Web Crawler - AWS Deployment Script (PowerShell)

Usage: .\deploy.ps1 [OPTIONS]

OPTIONS:
    -Environment ENVIRONMENT    Deployment environment (dev, staging, prod) [default: dev]
    -Region REGION             AWS region [default: us-west-2]
    -ProjectName PROJECT       Project name [default: enterprise-web-crawler]
    -SkipTests                 Skip running tests
    -SkipBuild                 Skip building Docker images
    -Force                     Force deployment without confirmation
    -Help                      Show this help message

EXAMPLES:
    .\deploy.ps1 -Environment prod -Region us-east-1
    .\deploy.ps1 -Environment staging -SkipTests
    .\deploy.ps1 -Force -SkipBuild

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Terraform installed (>= 1.0)
    - Docker Desktop installed and running
    - Node.js and npm installed

"@
}

# Show help if requested
if ($Help) {
    Show-Help
    exit 0
}

# Validate environment
if ($Environment -notin @("dev", "staging", "prod")) {
    Write-Error "Invalid environment: $Environment. Must be dev, staging, or prod."
    exit 1
}

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check AWS CLI
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Write-Error "AWS CLI is not installed. Please install it first."
        exit 1
    }
    
    # Check AWS credentials
    try {
        aws sts get-caller-identity | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "AWS credentials error"
        }
    }
    catch {
        Write-Error "AWS credentials not configured or invalid."
        exit 1
    }
    
    # Check Terraform
    if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
        Write-Error "Terraform is not installed. Please install it first."
        exit 1
    }
    
    # Check Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker is not installed. Please install it first."
        exit 1
    }
    
    # Check if Docker is running
    try {
        docker info | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Docker not running"
        }
    }
    catch {
        Write-Error "Docker is not running. Please start Docker Desktop first."
        exit 1
    }
    
    # Check Node.js and npm
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js and npm are required. Please install them first."
        exit 1
    }
    
    Write-Success "All prerequisites met"
}

# Run tests
function Invoke-Tests {
    if ($SkipTests) {
        Write-Warning "Skipping tests"
        return
    }
    
    Write-Info "Running tests..."
    Set-Location $ProjectRoot
    
    # Install dependencies
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies"
        exit 1
    }
    
    # Run tests
    npm run test:ci
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed"
        exit 1
    }
    
    npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Linting failed"
        exit 1
    }
    
    npm run type-check
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Type checking failed"
        exit 1
    }
    
    Write-Success "All tests passed"
}

# Build and push Docker images
function Build-AndPushImages {
    if ($SkipBuild) {
        Write-Warning "Skipping Docker image build"
        return
    }
    
    Write-Info "Building and pushing Docker images..."
    
    # Get AWS account ID
    $AwsAccountId = (aws sts get-caller-identity --query Account --output text)
    $EcrRegistry = "$AwsAccountId.dkr.ecr.$Region.amazonaws.com"
    
    # Login to ECR
    $LoginCommand = aws ecr get-login-password --region $Region
    $LoginCommand | docker login --username AWS --password-stdin $EcrRegistry
    
    # Build and push each service
    $Services = @("frontend", "backend", "crawler")
    foreach ($Service in $Services) {
        Write-Info "Building $Service image..."
        
        # Create ECR repository if it doesn't exist
        try {
            aws ecr describe-repositories --repository-names "$ProjectName-$Environment/$Service" --region $Region | Out-Null
        }
        catch {
            aws ecr create-repository --repository-name "$ProjectName-$Environment/$Service" --region $Region | Out-Null
        }
        
        # Get git commit hash
        $GitHash = git rev-parse --short HEAD
        
        # Build image
        docker build `
            -f "packages\$Service\Dockerfile" `
            -t "$EcrRegistry/$ProjectName-$Environment/$Service`:latest" `
            -t "$EcrRegistry/$ProjectName-$Environment/$Service`:$GitHash" `
            $ProjectRoot
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to build $Service image"
            exit 1
        }
        
        # Push image
        docker push "$EcrRegistry/$ProjectName-$Environment/$Service`:latest"
        docker push "$EcrRegistry/$ProjectName-$Environment/$Service`:$GitHash"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to push $Service image"
            exit 1
        }
        
        Write-Success "$Service image built and pushed"
    }
}

# Deploy infrastructure
function Deploy-Infrastructure {
    Write-Info "Deploying infrastructure with Terraform..."
    
    Set-Location $TerraformDir
    
    # Initialize Terraform
    terraform init
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Terraform init failed"
        exit 1
    }
    
    # Create terraform.tfvars file
    @"
aws_region = "$Region"
environment = "$Environment"
project_name = "$ProjectName"
"@ | Out-File -FilePath "terraform.tfvars" -Encoding UTF8
    
    # Plan deployment
    Write-Info "Creating Terraform plan..."
    terraform plan -out=tfplan
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Terraform plan failed"
        exit 1
    }
    
    # Confirm deployment
    if (-not $Force) {
        Write-Warning "About to deploy infrastructure for environment: $Environment"
        $Confirmation = Read-Host "Do you want to continue? (y/N)"
        if ($Confirmation -ne "y" -and $Confirmation -ne "Y") {
            Write-Info "Deployment cancelled"
            exit 0
        }
    }
    
    # Apply changes
    Write-Info "Applying Terraform changes..."
    terraform apply tfplan
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Terraform apply failed"
        exit 1
    }
    
    Write-Success "Infrastructure deployed successfully"
}

# Update ECS services
function Update-Services {
    Write-Info "Updating ECS services..."
    
    $AwsAccountId = (aws sts get-caller-identity --query Account --output text)
    $EcrRegistry = "$AwsAccountId.dkr.ecr.$Region.amazonaws.com"
    $ClusterName = "$ProjectName-$Environment-cluster"
    $GitHash = git rev-parse --short HEAD
    
    $Services = @("frontend", "backend", "crawler")
    foreach ($Service in $Services) {
        Write-Info "Updating $Service service..."
        
        $ServiceName = "$ProjectName-$Environment-$Service"
        $ImageUri = "$EcrRegistry/$ProjectName-$Environment/$Service`:$GitHash"
        
        # Get current task definition ARN
        $TaskDefArn = (aws ecs describe-services `
            --cluster $ClusterName `
            --services $ServiceName `
            --query 'services[0].taskDefinition' `
            --output text)
        
        # Get task definition JSON
        $TaskDefJson = aws ecs describe-task-definition `
            --task-definition $TaskDefArn `
            --query 'taskDefinition'
        
        # Update image URI and create new task definition
        $NewTaskDef = $TaskDefJson | ConvertFrom-Json
        $NewTaskDef.containerDefinitions[0].image = $ImageUri
        
        # Remove read-only properties
        $NewTaskDef.PSObject.Properties.Remove('taskDefinitionArn')
        $NewTaskDef.PSObject.Properties.Remove('revision')
        $NewTaskDef.PSObject.Properties.Remove('status')
        $NewTaskDef.PSObject.Properties.Remove('requiresAttributes')
        $NewTaskDef.PSObject.Properties.Remove('placementConstraints')
        $NewTaskDef.PSObject.Properties.Remove('compatibilities')
        $NewTaskDef.PSObject.Properties.Remove('registeredAt')
        $NewTaskDef.PSObject.Properties.Remove('registeredBy')
        
        # Convert back to JSON and register new task definition
        $NewTaskDefJson = $NewTaskDef | ConvertTo-Json -Depth 10
        $TempFile = [System.IO.Path]::GetTempFileName()
        $NewTaskDefJson | Out-File -FilePath $TempFile -Encoding UTF8
        
        $NewTaskDefArn = (aws ecs register-task-definition `
            --cli-input-json "file://$TempFile" `
            --query 'taskDefinition.taskDefinitionArn' `
            --output text)
        
        Remove-Item $TempFile
        
        # Update service
        aws ecs update-service `
            --cluster $ClusterName `
            --service $ServiceName `
            --task-definition $NewTaskDefArn | Out-Null
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to update $Service service"
            exit 1
        }
        
        Write-Success "$Service service updated"
    }
    
    # Wait for services to stabilize
    Write-Info "Waiting for services to stabilize..."
    foreach ($Service in $Services) {
        $ServiceName = "$ProjectName-$Environment-$Service"
        aws ecs wait services-stable `
            --cluster $ClusterName `
            --services $ServiceName
    }
    
    Write-Success "All services updated and stable"
}

# Run post-deployment tests
function Invoke-PostDeployTests {
    Write-Info "Running post-deployment tests..."
    
    # Get load balancer DNS
    $LbDns = (aws elbv2 describe-load-balancers `
        --names "$ProjectName-$Environment-alb" `
        --query 'LoadBalancers[0].DNSName' `
        --output text)
    
    Write-Info "Application URL: http://$LbDns"
    
    # Wait for services to be ready
    Start-Sleep -Seconds 30
    
    # Health checks
    Write-Info "Performing health checks..."
    
    # Frontend health check
    try {
        $Response = Invoke-WebRequest -Uri "http://$LbDns/health" -UseBasicParsing
        if ($Response.StatusCode -eq 200) {
            Write-Success "Frontend health check passed"
        } else {
            throw "Health check failed"
        }
    }
    catch {
        Write-Error "Frontend health check failed"
        exit 1
    }
    
    # Backend API health check
    try {
        $Response = Invoke-WebRequest -Uri "http://$LbDns/api/health" -UseBasicParsing
        if ($Response.StatusCode -eq 200) {
            Write-Success "Backend API health check passed"
        } else {
            throw "API health check failed"
        }
    }
    catch {
        Write-Error "Backend API health check failed"
        exit 1
    }
    
    Write-Success "Post-deployment tests completed"
}

# Main deployment function
function Start-Deployment {
    Write-Info "Starting deployment for environment: $Environment"
    Write-Info "AWS Region: $Region"
    Write-Info "Project: $ProjectName"
    Write-Host ""
    
    Test-Prerequisites
    Invoke-Tests
    Build-AndPushImages
    Deploy-Infrastructure
    Update-Services
    Invoke-PostDeployTests
    
    Write-Success "Deployment completed successfully!"
    
    # Get application URL
    try {
        $LbDns = (aws elbv2 describe-load-balancers `
            --names "$ProjectName-$Environment-alb" `
            --query 'LoadBalancers[0].DNSName' `
            --output text 2>$null)
    }
    catch {
        $LbDns = "Not available"
    }
    
    Write-Host ""
    Write-Info "Application URL: http://$LbDns"
    Write-Info "Environment: $Environment"
    Write-Info "Region: $Region"
}

# Run main function
try {
    Start-Deployment
}
catch {
    Write-Error "Deployment failed: $($_.Exception.Message)"
    exit 1
}