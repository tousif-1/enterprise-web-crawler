#!/bin/bash

# Enterprise Web Crawler - Deployment Validation Script
# Validates that the deployment meets all requirements from the task

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation results
VALIDATION_RESULTS=()
FAILED_VALIDATIONS=0

# Function to print colored output
print_status() {
    echo -e "${BLUE}[VALIDATE]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    VALIDATION_RESULTS+=("✓ $1")
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
    VALIDATION_RESULTS+=("⚠ $1")
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
    VALIDATION_RESULTS+=("✗ $1")
    ((FAILED_VALIDATIONS++))
}

# Validation functions

validate_dockerfiles_exist() {
    print_status "Validating Dockerfiles exist for all services..."
    
    local services=("backend" "frontend" "crawler")
    for service in "${services[@]}"; do
        if [[ -f "packages/$service/Dockerfile" ]]; then
            print_success "Dockerfile exists for $service"
        else
            print_error "Dockerfile missing for $service"
        fi
    done
}

validate_multistage_builds() {
    print_status "Validating multi-stage builds in Dockerfiles..."
    
    local services=("backend" "frontend" "crawler")
    for service in "${services[@]}"; do
        local dockerfile="packages/$service/Dockerfile"
        if [[ -f "$dockerfile" ]]; then
            # Check for multiple FROM statements (multi-stage)
            local from_count=$(grep -c "^FROM" "$dockerfile" || echo "0")
            if [[ $from_count -ge 3 ]]; then
                print_success "$service Dockerfile uses multi-stage builds ($from_count stages)"
            else
                print_error "$service Dockerfile does not use proper multi-stage builds"
            fi
            
            # Check for production stage
            if grep -q "FROM.*AS production" "$dockerfile"; then
                print_success "$service Dockerfile has production stage"
            else
                print_error "$service Dockerfile missing production stage"
            fi
        fi
    done
}

validate_docker_compose_config() {
    print_status "Validating Docker Compose configuration..."
    
    # Check main docker-compose.yml exists
    if [[ -f "docker-compose.yml" ]]; then
        print_success "Main docker-compose.yml exists"
    else
        print_error "Main docker-compose.yml missing"
        return
    fi
    
    # Check environment-specific compose files
    local env_files=("docker-compose.prod.yml" "docker-compose.test.yml")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            print_success "$env_file exists"
        else
            print_error "$env_file missing"
        fi
    done
    
    # Validate compose file syntax (ignore version warnings)
    if docker-compose config 2>&1 | grep -q "ERROR\|error:"; then
        print_error "Docker Compose configuration has syntax errors"
    else
        print_success "Docker Compose configuration is valid"
    fi
}

validate_health_checks() {
    print_status "Validating container health checks..."
    
    local services=("backend" "frontend" "crawler")
    for service in "${services[@]}"; do
        local dockerfile="packages/$service/Dockerfile"
        if [[ -f "$dockerfile" ]] && grep -q "HEALTHCHECK" "$dockerfile"; then
            print_success "$service Dockerfile includes health check"
        else
            print_error "$service Dockerfile missing health check"
        fi
    done
    
    # Check docker-compose health checks
    if grep -q "healthcheck:" docker-compose.yml; then
        print_success "Docker Compose includes health checks"
    else
        print_error "Docker Compose missing health checks"
    fi
}

validate_resource_limits() {
    print_status "Validating resource limits configuration..."
    
    # Check for resource limits in docker-compose files
    local compose_files=("docker-compose.yml" "docker-compose.prod.yml")
    for compose_file in "${compose_files[@]}"; do
        if [[ -f "$compose_file" ]]; then
            if grep -q "resources:" "$compose_file" && grep -q "limits:" "$compose_file"; then
                print_success "$compose_file includes resource limits"
            else
                print_error "$compose_file missing resource limits"
            fi
        fi
    done
    
    # Check for memory and CPU limits
    if grep -q "memory:" docker-compose.yml && grep -q "cpus:" docker-compose.yml; then
        print_success "Memory and CPU limits configured"
    else
        print_error "Memory and CPU limits not properly configured"
    fi
}

validate_environment_config() {
    print_status "Validating environment-specific configuration..."
    
    # Check environment files exist
    local env_files=(".env.development" ".env.production" ".env.test" ".env.example")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            print_success "$env_file exists"
        else
            print_error "$env_file missing"
        fi
    done
    
    # Check for environment variable usage in compose files
    if grep -q "\${" docker-compose.yml; then
        print_success "Docker Compose uses environment variables"
    else
        print_error "Docker Compose not using environment variables for configuration"
    fi
}

validate_deployment_scripts() {
    print_status "Validating deployment scripts..."
    
    # Check deployment scripts exist
    local scripts=("scripts/deploy.sh" "scripts/deploy.ps1" "scripts/deploy-simple.sh")
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]]; then
            print_success "$script exists"
            
            # Check if script is executable (Unix scripts)
            if [[ "$script" == *.sh ]] && [[ -x "$script" ]]; then
                print_success "$script is executable"
            elif [[ "$script" == *.sh ]]; then
                print_warning "$script exists but is not executable"
            fi
        else
            print_error "$script missing"
        fi
    done
    
    # Check Makefile exists
    if [[ -f "Makefile" ]]; then
        print_success "Makefile exists for easy deployment"
    else
        print_error "Makefile missing"
    fi
}

validate_cross_platform_support() {
    print_status "Validating cross-platform support..."
    
    # Check for platform-specific configurations
    local platform=$(uname -s)
    case "$platform" in
        Darwin*)
            print_success "Running on macOS - checking compatibility"
            ;;
        Linux*)
            print_success "Running on Linux - checking compatibility"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            print_success "Running on Windows - checking compatibility"
            ;;
        *)
            print_warning "Unknown platform: $platform"
            ;;
    esac
    
    # Check for Windows PowerShell script
    if [[ -f "scripts/deploy.ps1" ]]; then
        print_success "Windows PowerShell deployment script available"
    else
        print_error "Windows PowerShell deployment script missing"
    fi
    
    # Check for Unix shell scripts
    if [[ -f "scripts/deploy.sh" ]]; then
        print_success "Unix shell deployment script available"
    else
        print_error "Unix shell deployment script missing"
    fi
}

validate_documentation() {
    print_status "Validating deployment documentation..."
    
    # Check for Docker documentation
    if [[ -f "docker/README.md" ]]; then
        print_success "Docker deployment documentation exists"
    else
        print_error "Docker deployment documentation missing"
    fi
    
    # Check main README mentions Docker
    if [[ -f "README.md" ]] && grep -qi "docker" README.md; then
        print_success "Main README mentions Docker deployment"
    else
        print_warning "Main README should mention Docker deployment"
    fi
}

validate_security_features() {
    print_status "Validating security features..."
    
    # Check for non-root users in Dockerfiles
    local services=("backend" "frontend" "crawler")
    for service in "${services[@]}"; do
        local dockerfile="packages/$service/Dockerfile"
        if [[ -f "$dockerfile" ]]; then
            if grep -q "USER" "$dockerfile" && ! grep -q "USER root" "$dockerfile"; then
                print_success "$service runs as non-root user"
            else
                print_error "$service does not run as non-root user"
            fi
        fi
    done
    
    # Check for secret management
    if grep -q "JWT_SECRET" .env.example; then
        print_success "Secret management configured"
    else
        print_error "Secret management not properly configured"
    fi
}

validate_testing_support() {
    print_status "Validating testing support..."
    
    # Check for test deployment script
    if [[ -f "scripts/test-deployment.sh" ]]; then
        print_success "Deployment testing script exists"
    else
        print_error "Deployment testing script missing"
    fi
    
    # Check for test environment configuration
    if [[ -f "docker-compose.test.yml" ]]; then
        print_success "Test environment Docker Compose configuration exists"
    else
        print_error "Test environment Docker Compose configuration missing"
    fi
}

# Function to run all validations
run_all_validations() {
    print_status "Starting deployment validation..."
    echo "=============================================="
    
    validate_dockerfiles_exist
    validate_multistage_builds
    validate_docker_compose_config
    validate_health_checks
    validate_resource_limits
    validate_environment_config
    validate_deployment_scripts
    validate_cross_platform_support
    validate_documentation
    validate_security_features
    validate_testing_support
    
    echo ""
    echo "=============================================="
    print_status "Validation Summary"
    echo "=============================================="
    
    # Print all results
    for result in "${VALIDATION_RESULTS[@]}"; do
        echo "$result"
    done
    
    echo ""
    if [[ $FAILED_VALIDATIONS -eq 0 ]]; then
        print_success "All validations passed! The deployment meets all requirements. ✅"
        echo ""
        print_status "Task 14 requirements validation:"
        print_success "✓ Dockerfiles for all services with multi-stage builds"
        print_success "✓ Docker Compose configuration for local development"
        print_success "✓ Container health checks and resource limits"
        print_success "✓ Environment-specific configuration management"
        print_success "✓ Cross-platform deployment support (Mac, Windows, Linux)"
        echo ""
        return 0
    else
        print_error "$FAILED_VALIDATIONS validation(s) failed! ❌"
        print_status "Please address the failed validations before considering the task complete."
        echo ""
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -q, --quick          Run quick validation (skip Docker syntax checks)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "This script validates that the Docker containerization and deployment"
    echo "implementation meets all requirements from task 14."
}

# Parse command line arguments
QUICK=false

while [[ $# -gt 0 ]]; do
    case $1 in
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

# Run validations
run_all_validations