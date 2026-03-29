#!/bin/bash

# Enterprise Web Crawler Deployment Script
# Supports Mac, Linux, and Windows (via Git Bash/WSL)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
PLATFORM=""
BUILD_ONLY=false
SKIP_TESTS=false
CLEANUP=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)    PLATFORM="mac" ;;
        Linux*)     PLATFORM="linux" ;;
        CYGWIN*|MINGW*|MSYS*) PLATFORM="windows" ;;
        *)          PLATFORM="unknown" ;;
    esac
    print_status "Detected platform: $PLATFORM"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check Node.js (for local development)
    if [[ "$ENVIRONMENT" == "development" ]] && ! command -v node &> /dev/null; then
        print_warning "Node.js is not installed. Some development features may not work."
    fi
    
    print_success "Prerequisites check completed"
}

# Function to setup environment
setup_environment() {
    print_status "Setting up environment for: $ENVIRONMENT"
    
    # Copy appropriate environment file
    if [[ -f ".env.$ENVIRONMENT" ]]; then
        cp ".env.$ENVIRONMENT" ".env"
        print_success "Environment file copied: .env.$ENVIRONMENT -> .env"
    else
        print_warning "Environment file .env.$ENVIRONMENT not found, using .env.example"
        cp ".env.example" ".env"
    fi
    
    # Platform-specific adjustments
    case "$PLATFORM" in
        "windows")
            # Windows-specific environment adjustments
            print_status "Applying Windows-specific configurations..."
            # Convert paths for Windows
            sed -i 's|/usr/bin/chromium-browser|C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe|g' .env
            ;;
        "mac")
            # Mac-specific environment adjustments
            print_status "Applying Mac-specific configurations..."
            ;;
        "linux")
            # Linux-specific environment adjustments
            print_status "Applying Linux-specific configurations..."
            ;;
    esac
}

# Function to run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        print_warning "Skipping tests as requested"
        return
    fi
    
    print_status "Running tests..."
    
    # Use test environment
    docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres-test redis-test elasticsearch-test
    
    # Wait for services to be ready
    print_status "Waiting for test services to be ready..."
    sleep 30
    
    # Run tests
    docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm backend npm run test -- --run
    docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm crawler npm run test -- --run
    docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm frontend npm run test -- --run
    
    # Cleanup test services
    docker-compose -f docker-compose.yml -f docker-compose.test.yml down -v
    
    print_success "Tests completed successfully"
}

# Function to build images
build_images() {
    print_status "Building Docker images for $ENVIRONMENT environment..."
    
    case "$ENVIRONMENT" in
        "production")
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
            ;;
        "development")
            docker-compose build
            ;;
        "test")
            docker-compose -f docker-compose.yml -f docker-compose.test.yml build
            ;;
    esac
    
    print_success "Docker images built successfully"
}

# Function to deploy services
deploy_services() {
    if [[ "$BUILD_ONLY" == "true" ]]; then
        print_success "Build completed. Skipping deployment as requested."
        return
    fi
    
    print_status "Deploying services for $ENVIRONMENT environment..."
    
    case "$ENVIRONMENT" in
        "production")
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            ;;
        "development")
            docker-compose up -d
            ;;
        "test")
            docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
            ;;
    esac
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    health_check
    
    print_success "Services deployed successfully"
}

# Function to perform health check
health_check() {
    print_status "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost:${BACKEND_PORT:-8000}/health &> /dev/null; then
            print_success "Backend service is healthy"
            break
        fi
        
        print_status "Attempt $attempt/$max_attempts: Waiting for backend service..."
        sleep 10
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        print_error "Backend service health check failed"
        exit 1
    fi
}

# Function to cleanup
cleanup() {
    if [[ "$CLEANUP" == "true" ]]; then
        print_status "Cleaning up..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Set environment (development|production|test) [default: development]"
    echo "  -p, --platform PLATFORM Set platform (mac|linux|windows) [auto-detected]"
    echo "  -b, --build-only         Only build images, don't deploy"
    echo "  -s, --skip-tests         Skip running tests"
    echo "  -c, --cleanup            Cleanup containers and volumes after deployment"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy development environment"
    echo "  $0 -e production                     # Deploy production environment"
    echo "  $0 -e development -b                 # Build development images only"
    echo "  $0 -e test -s                        # Deploy test environment, skip tests"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        -b|--build-only)
            BUILD_ONLY=true
            shift
            ;;
        -s|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -c|--cleanup)
            CLEANUP=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|production|test)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Valid environments: development, production, test"
    exit 1
fi

# Main execution
main() {
    print_status "Starting deployment for $ENVIRONMENT environment..."
    
    detect_platform
    check_prerequisites
    setup_environment
    
    if [[ "$ENVIRONMENT" != "production" ]]; then
        run_tests
    fi
    
    build_images
    deploy_services
    cleanup
    
    print_success "Deployment completed successfully!"
    print_status "Access the application at:"
    print_status "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
    print_status "  Backend API: http://localhost:${BACKEND_PORT:-8000}"
    print_status "  API Health: http://localhost:${BACKEND_PORT:-8000}/health"
}

# Run main function
main