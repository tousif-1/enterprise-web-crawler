# Enterprise Web Crawler - Makefile
# Cross-platform deployment and management commands

.PHONY: help dev prod test build clean logs health install

# Default target
help: ## Show this help message
	@echo "Enterprise Web Crawler - Available Commands"
	@echo "=========================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development environment
dev: ## Start development environment
	@echo "🚀 Starting development environment..."
	@cp .env.development .env 2>/dev/null || cp .env.example .env
	@docker-compose up -d --build
	@echo "✅ Development environment started"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:8000"

# Production environment
prod: ## Start production environment
	@echo "🚀 Starting production environment..."
	@cp .env.production .env 2>/dev/null || (echo "❌ .env.production not found" && exit 1)
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
	@echo "✅ Production environment started"
	@echo "   Application: http://localhost:80"

# Test environment
test: ## Run tests in containerized environment
	@echo "🧪 Running tests..."
	@cp .env.test .env 2>/dev/null || cp .env.example .env
	@docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres-test redis-test elasticsearch-test
	@sleep 20
	@docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm backend npm run test -- --run
	@docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm crawler npm run test -- --run
	@docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm frontend npm run test -- --run
	@docker-compose -f docker-compose.yml -f docker-compose.test.yml down -v
	@echo "✅ Tests completed"

# Build images only
build: ## Build Docker images without starting services
	@echo "🔨 Building Docker images..."
	@docker-compose build --no-cache
	@echo "✅ Images built successfully"

# Clean up containers and volumes
clean: ## Stop services and remove containers/volumes
	@echo "🧹 Cleaning up..."
	@docker-compose down -v --remove-orphans
	@docker system prune -f
	@echo "✅ Cleanup completed"

# View logs
logs: ## View logs from all services
	@docker-compose logs -f

# Health check
health: ## Check service health
	@echo "🏥 Checking service health..."
	@curl -f http://localhost:8000/health || echo "❌ Backend not healthy"
	@curl -f http://localhost:3000/ > /dev/null 2>&1 && echo "✅ Frontend healthy" || echo "❌ Frontend not healthy"

# Install dependencies locally (for development)
install: ## Install dependencies locally
	@echo "📦 Installing dependencies..."
	@npm install
	@echo "✅ Dependencies installed"

# Quick start (alias for dev)
start: dev ## Quick start development environment (alias for dev)

# Stop services
stop: ## Stop all services
	@echo "🛑 Stopping services..."
	@docker-compose down
	@echo "✅ Services stopped"

# Restart services
restart: ## Restart all services
	@echo "🔄 Restarting services..."
	@docker-compose restart
	@echo "✅ Services restarted"

# Database operations
db-migrate: ## Run database migrations
	@echo "🗄️  Running database migrations..."
	@docker-compose exec backend npm run db:migrate
	@echo "✅ Migrations completed"

db-seed: ## Seed database with sample data
	@echo "🌱 Seeding database..."
	@docker-compose exec backend npm run db:seed
	@echo "✅ Database seeded"

db-reset: ## Reset database (migrate + seed)
	@echo "🔄 Resetting database..."
	@docker-compose exec backend npm run db:seed:reset
	@echo "✅ Database reset completed"

# Backup and restore
backup: ## Backup database
	@echo "💾 Creating database backup..."
	@docker-compose exec postgres pg_dump -U webcrawler webcrawler > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup created"

# Platform-specific deployment
deploy-mac: ## Deploy on macOS
	@chmod +x scripts/deploy.sh
	@./scripts/deploy.sh -e development

deploy-windows: ## Deploy on Windows
	@powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -Environment development

deploy-linux: ## Deploy on Linux
	@chmod +x scripts/deploy.sh
	@./scripts/deploy.sh -e development

# Production deployment
deploy-prod: ## Deploy production environment
	@echo "🚀 Deploying production environment..."
	@chmod +x scripts/deploy.sh 2>/dev/null || true
	@./scripts/deploy.sh -e production 2>/dev/null || powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -Environment production

# Development helpers
dev-backend: ## Start only backend services for development
	@docker-compose up -d postgres redis elasticsearch backend

dev-frontend: ## Start only frontend for development
	@docker-compose up -d frontend

dev-crawler: ## Start only crawler for development
	@docker-compose up -d postgres redis crawler

# Monitoring
monitor: ## Show resource usage
	@echo "📊 Resource Usage:"
	@docker stats --no-stream

ps: ## Show running containers
	@docker-compose ps