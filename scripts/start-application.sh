#!/bin/bash

# Enterprise Web Crawler - Application Startup Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
BUILD=false
LOGS=false
STATUS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD=true
            shift
            ;;
        --logs)
            LOGS=true
            shift
            ;;
        --status)
            STATUS=true
            shift
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🚀 Enterprise Web Crawler - Application Startup${NC}"
echo -e "${BLUE}================================================${NC}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not available. Please install Docker.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available. Please install Docker Compose.${NC}"
    exit 1
fi

# Load environment variables
if [ -f ".env.development" ]; then
    echo -e "${CYAN}📋 Loading development environment...${NC}"
    export $(grep -v '^#' .env.development | xargs)
else
    echo -e "${YELLOW}⚠️  .env.development not found, using defaults${NC}"
fi

if [ "$STATUS" = true ]; then
    echo -e "\n${CYAN}📊 Checking service status...${NC}"
    docker-compose ps
    exit 0
fi

if [ "$BUILD" = true ]; then
    echo -e "\n${CYAN}🔨 Building application images...${NC}"
    docker-compose build --no-cache
    echo -e "${GREEN}✅ Build completed successfully${NC}"
fi

# Start the application
echo -e "\n${CYAN}🚀 Starting Enterprise Web Crawler services...${NC}"

# Start infrastructure services first
echo -e "${YELLOW}Starting infrastructure services (PostgreSQL, Redis, Elasticsearch)...${NC}"
docker-compose up -d postgres redis elasticsearch

# Wait for infrastructure services to be healthy
echo -e "${YELLOW}⏳ Waiting for infrastructure services to be ready...${NC}"
max_wait=120  # 2 minutes
waited=0

while [ $waited -lt $max_wait ]; do
    sleep 5
    waited=$((waited + 5))
    
    postgres_health=$(docker-compose ps --filter "health=healthy" postgres 2>/dev/null || true)
    redis_health=$(docker-compose ps --filter "health=healthy" redis 2>/dev/null || true)
    elasticsearch_health=$(docker-compose ps --filter "health=healthy" elasticsearch 2>/dev/null || true)
    
    if [[ -n "$postgres_health" && -n "$redis_health" && -n "$elasticsearch_health" ]]; then
        echo -e "${GREEN}✅ Infrastructure services are ready${NC}"
        break
    fi
    
    if [ $waited -ge $max_wait ]; then
        echo -e "${YELLOW}⚠️  Timeout waiting for services to be healthy, continuing anyway...${NC}"
        break
    fi
    
    echo -e "${CYAN}⏳ Still waiting... ($waited/$max_wait seconds)${NC}"
done

# Start application services
echo -e "${YELLOW}Starting application services (Backend, Crawler, Frontend)...${NC}"
docker-compose up -d backend crawler frontend

# Wait for application services
echo -e "${YELLOW}⏳ Waiting for application services to be ready...${NC}"
sleep 30

# Check service status
echo -e "\n${BLUE}📊 Service Status:${NC}"
docker-compose ps

# Show service URLs
echo -e "\n${BLUE}🌐 Application URLs:${NC}"
echo -e "${GREEN}Frontend (Web UI):    http://localhost:3000${NC}"
echo -e "${GREEN}Backend API:          http://localhost:8000${NC}"
echo -e "${GREEN}API Health Check:     http://localhost:8000/api/health${NC}"
echo -e "${CYAN}PostgreSQL:           localhost:5432${NC}"
echo -e "${CYAN}Redis:                localhost:6379${NC}"
echo -e "${CYAN}Elasticsearch:        http://localhost:9200${NC}"

# Test API health
echo -e "\n${CYAN}🏥 Testing API health...${NC}"
if curl -f -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend API is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Backend API health check failed${NC}"
    echo -e "${CYAN}   The service might still be starting up...${NC}"
fi

if [ "$LOGS" = true ]; then
    echo -e "\n${CYAN}📋 Showing service logs...${NC}"
    docker-compose logs -f
else
    echo -e "\n${GREEN}🎉 Enterprise Web Crawler is starting up!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "${NC}  1. Open your browser to http://localhost:3000${NC}"
    echo -e "${NC}  2. Create a new crawl session${NC}"
    echo -e "${NC}  3. Monitor progress in real-time${NC}"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo -e "${NC}  View logs:        docker-compose logs -f${NC}"
    echo -e "${NC}  Stop services:    docker-compose down${NC}"
    echo -e "${NC}  Restart:          docker-compose restart${NC}"
    echo -e "${NC}  Status:           ./scripts/start-application.sh --status${NC}"
    echo ""
    echo -e "${CYAN}🔍 To view logs in real-time, run:${NC}"
    echo -e "${NC}   ./scripts/start-application.sh --logs${NC}"
fi