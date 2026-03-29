#!/bin/bash

# Enterprise Web Crawler - AWS Deployment Script
set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

# Default values
ENVIRONMENT="dev"
AWS_REGION="us-west-2"
PROJECT_NAME="enterprise-web-crawler"
SKIP_TESTS=false
SKIP_BUILD=false
FORCE_DEPLOY=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Enterprise Web Crawler - AWS Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -e, --environment ENVIRONMENT   Deployment environment (dev, staging, prod) [default: dev]
    -r, --region REGION            AWS region [default: us-west-2]
    -p, --project PROJECT          Project name [default: enterprise-web-crawler]
    --skip-tests                   Skip running tests
    --skip-build                   Skip building Docker images
    --force                        Force deployment without confirmation
    -h, --help                     Show this help message

EXAMPLES:
    $0 -e prod -r us-east-1
    $0 --environment staging --skip-tests
    $0 --force --skip-build

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Terraform installed (>= 1.0)
    - Docker installed and running
    - Node.js and npm installed

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod."
    exit 1
fi

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid."
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        log_error "Node.js and npm are required. Please install them first."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping tests"
        return 0
    fi
    
    log_info "Running tests..."
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    npm ci
    
    # Run tests
    npm run test:ci
    npm run lint
    npm run type-check
    
    log_success "All tests passed"
}

# Build and push Docker images
build_and_push_images() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        log_warning "Skipping Docker image build"
        return 0
    fi
    
    log_info "Building and pushing Docker images..."
    
    # Get AWS account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    # Login to ECR
    aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
    
    # Build and push each service
    for service in frontend backend crawler; do
        log_info "Building $service image..."
        
        # Create ECR repository if it doesn't exist
        aws ecr describe-repositories --repository-names "$PROJECT_NAME-$ENVIRONMENT/$service" --region "$AWS_REGION" 2>/dev/null || \
        aws ecr create-repository --repository-name "$PROJECT_NAME-$ENVIRONMENT/$service" --region "$AWS_REGION"
        
        # Build image
        docker build \
            -f "packages/$service/Dockerfile" \
            -t "$ECR_REGISTRY/$PROJECT_NAME-$ENVIRONMENT/$service:latest" \
            -t "$ECR_REGISTRY/$PROJECT_NAME-$ENVIRONMENT/$service:$(git rev-parse --short HEAD)" \
            "$PROJECT_ROOT"
        
        # Push image
        docker push "$ECR_REGISTRY/$PROJECT_NAME-$ENVIRONMENT/$service:latest"
        docker push "$ECR_REGISTRY/$PROJECT_NAME-$ENVIRONMENT/$service:$(git rev-parse --short HEAD)"
        
        log_success "$service image built and pushed"
    done
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    # Initialize Terraform
    terraform init
    
    # Create terraform.tfvars file
    cat > terraform.tfvars << EOF
aws_region = "$AWS_REGION"
environment = "$ENVIRONMENT"
project_name = "$PROJECT_NAME"
EOF
    
    # Plan deployment
    log_info "Creating Terraform plan..."
    terraform plan -out=tfplan
    
    # Confirm deployment
    if [[ "$FORCE_DEPLOY" != "true" ]]; then
        echo
        log_warning "About to deploy infrastructure for environment: $ENVIRONMENT"
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Apply changes
    log_info "Applying Terraform changes..."
    terraform apply tfplan
    
    log_success "Infrastructure deployed successfully"
}

# Update ECS services
update_services() {
    log_info "Updating ECS services..."
    
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    CLUSTER_NAME="$PROJECT_NAME-$ENVIRONMENT-cluster"
    
    for service in frontend backend crawler; do
        log_info "Updating $service service..."
        
        SERVICE_NAME="$PROJECT_NAME-$ENVIRONMENT-$service"
        IMAGE_URI="$ECR_REGISTRY/$PROJECT_NAME-$ENVIRONMENT/$service:$(git rev-parse --short HEAD)"
        
        # Get current task definition
        TASK_DEF_ARN=$(aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --query 'services[0].taskDefinition' \
            --output text)
        
        # Get task definition JSON
        TASK_DEF_JSON=$(aws ecs describe-task-definition \
            --task-definition "$TASK_DEF_ARN" \
            --query 'taskDefinition')
        
        # Update image URI and create new task definition
        NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | jq --arg IMAGE "$IMAGE_URI" \
            '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn) | del(.revision) | del(.status) | del(.requiresAttributes) | del(.placementConstraints) | del(.compatibilities) | del(.registeredAt) | del(.registeredBy)')
        
        # Register new task definition
        NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | aws ecs register-task-definition \
            --cli-input-json file:///dev/stdin \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text)
        
        # Update service
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --task-definition "$NEW_TASK_DEF_ARN" > /dev/null
        
        log_success "$service service updated"
    done
    
    # Wait for services to stabilize
    log_info "Waiting for services to stabilize..."
    for service in frontend backend crawler; do
        SERVICE_NAME="$PROJECT_NAME-$ENVIRONMENT-$service"
        aws ecs wait services-stable \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME"
    done
    
    log_success "All services updated and stable"
}

# Run post-deployment tests
run_post_deploy_tests() {
    log_info "Running post-deployment tests..."
    
    # Get load balancer DNS
    LB_DNS=$(aws elbv2 describe-load-balancers \
        --names "$PROJECT_NAME-$ENVIRONMENT-alb" \
        --query 'LoadBalancers[0].DNSName' \
        --output text)
    
    log_info "Application URL: http://$LB_DNS"
    
    # Wait for services to be ready
    sleep 30
    
    # Health checks
    log_info "Performing health checks..."
    
    # Frontend health check
    if curl -f -s "http://$LB_DNS/health" > /dev/null; then
        log_success "Frontend health check passed"
    else
        log_error "Frontend health check failed"
        exit 1
    fi
    
    # Backend API health check
    if curl -f -s "http://$LB_DNS/api/health" > /dev/null; then
        log_success "Backend API health check passed"
    else
        log_error "Backend API health check failed"
        exit 1
    fi
    
    log_success "Post-deployment tests completed"
}

# Main deployment function
main() {
    log_info "Starting deployment for environment: $ENVIRONMENT"
    log_info "AWS Region: $AWS_REGION"
    log_info "Project: $PROJECT_NAME"
    echo
    
    check_prerequisites
    run_tests
    build_and_push_images
    deploy_infrastructure
    update_services
    run_post_deploy_tests
    
    log_success "Deployment completed successfully!"
    
    # Get application URL
    LB_DNS=$(aws elbv2 describe-load-balancers \
        --names "$PROJECT_NAME-$ENVIRONMENT-alb" \
        --query 'LoadBalancers[0].DNSName' \
        --output text 2>/dev/null || echo "Not available")
    
    echo
    log_info "Application URL: http://$LB_DNS"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $AWS_REGION"
}

# Run main function
main "$@"