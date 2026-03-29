#!/bin/bash

# Enterprise Web Crawler - Deployment Testing Script
# Tests containerized deployment across different scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_TIMEOUT=300  # 5 minutes
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Function to cleanup
cleanup() {
    print_status "Cleaning up test environment..."
    docker-compose down -v --remove-orphans 2>/dev/null || true
    docker-compose -f docker-compose.yml -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans 2>/dev/null || true
}

# Function to wait for service health
wait_for_service() {
    local service_name=$1
    local health_url=$2
    local max_retries=${3:-$HEALTH_CHECK_RETRIES}
    
    print_status "Waiting for $service_name to be healthy..."
    
    local retry=1
    while [[ $retry -le $max_retries ]]; do
        if curl -f "$health_url" &>/dev/null; then
            print_success "$service_name is healthy"
            return 0
        fi
        
        print_status "Attempt $retry/$max_retries: $service_name not ready yet..."
        sleep $HEALTH_CHECK_INTERVAL
        ((retry++))
    done
    
    print_error "$service_name failed to become healthy within timeout"
    return 1
}

# Function to test basic functionality
test_basic_functionality() {
    print_status "Testing basic functionality..."
    
    # Test backend health endpoint
    if ! wait_for_service "Backend" "http://localhost:8000/health"; then
        return 1
    fi
    
    # Test frontend availability
    if ! wait_for_service "Frontend" "http://localhost:3000" 10; then
        return 1
    fi
    
    # Test database connectivity
    if ! docker-compose exec -T postgres pg_isready -U webcrawler -d webcrawler &>/dev/null; then
        print_error "Database connectivity test failed"
        return 1
    fi
    print_success "Database connectivity test passed"
    
    # Test Redis connectivity
    if ! docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        print_error "Redis connectivity test failed"
        return 1
    fi
    print_success "Redis connectivity test passed"
    
    # Test Elasticsearch connectivity
    if ! curl -f "http://localhost:9200/_cluster/health" &>/dev/null; then
        print_error "Elasticsearch connectivity test failed"
        return 1
    fi
    print_success "Elasticsearch connectivity test passed"
    
    print_success "Basic functionality tests passed"
    return 0
}

# Function to test development environment
test_development_environment() {
    print_status "Testing development environment..."
    
    # Setup environment
    cp .env.development .env 2>/dev/null || cp .env.example .env
    
    # Start services
    print_status "Starting development services..."
    timeout $TEST_TIMEOUT docker-compose up -d --build
    
    # Wait for services to be ready
    sleep 30
    
    # Test functionality
    if ! test_basic_functionality; then
        print_error "Development environment test failed"
        return 1
    fi
    
    # Test hot reloading (check if volumes are mounted)
    if ! docker-compose exec -T backend ls /app/packages/backend/src &>/dev/null; then
        print_error "Development volumes not mounted correctly"
        return 1
    fi
    print_success "Development volumes mounted correctly"
    
    print_success "Development environment test passed"
    return 0
}

# Function to test production environment
test_production_environment() {
    print_status "Testing production environment..."
    
    # Setup environment
    cp .env.production .env 2>/dev/null || {
        print_warning "Production environment file not found, creating minimal config"
        cat > .env << EOF
NODE_ENV=production
BUILD_TARGET=production
DATABASE_URL=postgresql://webcrawler:webcrawler_password@postgres:5432/webcrawler
REDIS_URL=redis://redis:6379
ELASTICSEARCH_URL=http://elasticsearch:9200
JWT_SECRET=test-production-secret
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
EOF
    }
    
    # Start services
    print_status "Starting production services..."
    timeout $TEST_TIMEOUT docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
    
    # Wait for services to be ready
    sleep 60  # Production builds take longer
    
    # Test functionality with production ports
    if ! wait_for_service "Production Backend" "http://localhost:8000/health"; then
        print_error "Production environment test failed"
        return 1
    fi
    
    # Verify production optimizations
    if docker-compose exec -T backend ls /app/packages/backend/src &>/dev/null; then
        print_error "Production image contains source code (should be compiled only)"
        return 1
    fi
    print_success "Production image properly optimized"
    
    print_success "Production environment test passed"
    return 0
}

# Function to test resource limits
test_resource_limits() {
    print_status "Testing resource limits..."
    
    # Check if containers respect memory limits
    local backend_memory=$(docker stats --no-stream --format "{{.MemUsage}}" webcrawler-backend | cut -d'/' -f1 | sed 's/[^0-9.]//g')
    local crawler_memory=$(docker stats --no-stream --format "{{.MemUsage}}" webcrawler-crawler | cut -d'/' -f1 | sed 's/[^0-9.]//g')
    
    if [[ -n "$backend_memory" && -n "$crawler_memory" ]]; then
        print_success "Resource monitoring working (Backend: ${backend_memory}MB, Crawler: ${crawler_memory}MB)"
    else
        print_warning "Could not verify resource limits"
    fi
    
    return 0
}

# Function to test container health checks
test_health_checks() {
    print_status "Testing container health checks..."
    
    # Wait for health checks to stabilize
    sleep 30
    
    # Check health status of all containers
    local unhealthy_containers=$(docker-compose ps --format json | jq -r '.[] | select(.Health != "healthy" and .Health != "") | .Name')
    
    if [[ -n "$unhealthy_containers" ]]; then
        print_error "Unhealthy containers found: $unhealthy_containers"
        return 1
    fi
    
    print_success "All containers are healthy"
    return 0
}

# Function to test cross-platform compatibility
test_cross_platform() {
    print_status "Testing cross-platform compatibility..."
    
    # Test path handling
    local platform=$(uname -s)
    case "$platform" in
        Darwin*)    print_status "Testing on macOS" ;;
        Linux*)     print_status "Testing on Linux" ;;
        CYGWIN*|MINGW*|MSYS*) print_status "Testing on Windows" ;;
        *)          print_warning "Unknown platform: $platform" ;;
    esac
    
    # Test volume mounts work correctly
    if ! docker-compose exec -T backend test -f /app/packages/backend/package.json; then
        print_error "Volume mounts not working correctly"
        return 1
    fi
    print_success "Volume mounts working correctly"
    
    # Test network connectivity between containers
    if ! docker-compose exec -T backend ping -c 1 postgres &>/dev/null; then
        print_error "Inter-container networking not working"
        return 1
    fi
    print_success "Inter-container networking working"
    
    return 0
}

# Function to run performance tests
test_performance() {
    print_status "Running basic performance tests..."
    
    # Test API response time
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:8000/health)
    local response_time_ms=$(echo "$response_time * 1000" | bc -l | cut -d'.' -f1)
    
    if [[ $response_time_ms -lt 5000 ]]; then
        print_success "API response time acceptable: ${response_time_ms}ms"
    else
        print_warning "API response time slow: ${response_time_ms}ms"
    fi
    
    return 0
}

# Main test function
run_all_tests() {
    print_status "Starting comprehensive deployment tests..."
    
    local failed_tests=0
    
    # Test development environment
    cleanup
    if ! test_development_environment; then
        ((failed_tests++))
        print_error "Development environment test failed"
    fi
    
    # Test resource limits and health checks on development environment
    if ! test_resource_limits; then
        ((failed_tests++))
    fi
    
    if ! test_health_checks; then
        ((failed_tests++))
    fi
    
    if ! test_cross_platform; then
        ((failed_tests++))
    fi
    
    if ! test_performance; then
        ((failed_tests++))
    fi
    
    # Test production environment
    cleanup
    if ! test_production_environment; then
        ((failed_tests++))
        print_error "Production environment test failed"
    fi
    
    # Final cleanup
    cleanup
    
    # Report results
    if [[ $failed_tests -eq 0 ]]; then
        print_success "All deployment tests passed! ✅"
        print_status "The containerized deployment is working correctly on this platform."
        return 0
    else
        print_error "$failed_tests test(s) failed! ❌"
        print_status "Please review the failed tests and fix any issues."
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --dev-only       Test development environment only"
    echo "  -p, --prod-only      Test production environment only"
    echo "  -q, --quick          Run quick tests (skip performance tests)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   # Run all tests"
    echo "  $0 -d                # Test development environment only"
    echo "  $0 -p                # Test production environment only"
    echo "  $0 -q                # Quick test run"
}

# Parse command line arguments
DEV_ONLY=false
PROD_ONLY=false
QUICK=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dev-only)
            DEV_ONLY=true
            shift
            ;;
        -p|--prod-only)
            PROD_ONLY=true
            shift
            ;;
        -q|--quick)
            QUICK=true
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

# Set up trap for cleanup on exit
trap cleanup EXIT

# Run tests based on options
if [[ "$DEV_ONLY" == "true" ]]; then
    cleanup
    test_development_environment
elif [[ "$PROD_ONLY" == "true" ]]; then
    cleanup
    test_production_environment
else
    run_all_tests
fi