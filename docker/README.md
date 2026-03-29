# Docker Deployment Guide

This guide covers containerized deployment of the Enterprise Web Crawler across different platforms and environments.

## Quick Start

### Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Docker Compose** v2.0+
- **Git** for cloning the repository
- **Make** (optional, for using Makefile commands)

### Platform-Specific Setup

#### Windows
```powershell
# Using PowerShell
.\scripts\deploy.ps1 -Environment development

# Or using Make (if available)
make deploy-windows
```

#### macOS/Linux
```bash
# Using deployment script
chmod +x scripts/deploy.sh
./scripts/deploy.sh -e development

# Or using Make
make deploy-mac    # macOS
make deploy-linux  # Linux

# Or quick start
make dev
```

## Environment Configurations

### Development Environment
- **Purpose**: Local development with hot reloading
- **Configuration**: `.env.development`
- **Services**: All services with development settings
- **Volumes**: Source code mounted for live editing

```bash
# Start development environment
make dev

# Or manually
docker-compose up -d
```

**Access Points:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Database: localhost:5432
- Redis: localhost:6379
- Elasticsearch: localhost:9200

### Production Environment
- **Purpose**: Production deployment with optimized builds
- **Configuration**: `.env.production`
- **Services**: Multi-stage builds, no development dependencies
- **Security**: Non-root users, resource limits

```bash
# Start production environment
make prod

# Or manually
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Access Points:**
- Application: http://localhost:80

### Test Environment
- **Purpose**: Automated testing in isolated environment
- **Configuration**: `.env.test`
- **Services**: Separate test databases and services
- **Cleanup**: Automatic cleanup after tests

```bash
# Run tests
make test

# Or manually
docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
```

## Docker Images

### Multi-Stage Builds

All services use multi-stage Docker builds for optimization:

1. **Base Stage**: Common Node.js setup
2. **Dependencies Stage**: Install production dependencies
3. **Development Stage**: Install all dependencies + dev tools
4. **Builder Stage**: Compile TypeScript and build assets
5. **Production Stage**: Minimal runtime with compiled code

### Image Sizes (Approximate)
- **Backend**: ~200MB (production), ~400MB (development)
- **Crawler**: ~300MB (production), ~500MB (development)
- **Frontend**: ~50MB (production), ~300MB (development)

## Resource Management

### Resource Limits

#### Development Environment
```yaml
Backend:  CPU: 0.5, Memory: 512MB
Crawler:  CPU: 1.0, Memory: 1GB
Frontend: CPU: 0.25, Memory: 256MB
```

#### Production Environment
```yaml
Backend:  CPU: 1.0, Memory: 1GB (2 replicas)
Crawler:  CPU: 2.0, Memory: 2GB (3 replicas)
Frontend: CPU: 0.5, Memory: 512MB (2 replicas)
```

### Health Checks

All services include comprehensive health checks:

- **Backend**: HTTP health endpoint (`/health`)
- **Crawler**: Process monitoring
- **Frontend**: HTTP availability check
- **Databases**: Service-specific health commands

## Networking

### Network Configuration
- **Network**: `webcrawler-network` (bridge)
- **Subnet**: `172.20.0.0/16`
- **DNS**: Automatic service discovery

### Port Mapping
```
Development:
- Frontend: 3000 → 3000
- Backend: 8000 → 8000
- PostgreSQL: 5432 → 5432
- Redis: 6379 → 6379
- Elasticsearch: 9200 → 9200

Production:
- Frontend: 80 → 80
- Backend: Internal only
- Databases: Internal only
```

## Data Persistence

### Volumes
- `postgres_data`: PostgreSQL database files
- `redis_data`: Redis persistence
- `elasticsearch_data`: Elasticsearch indices
- `*_node_modules`: Node.js dependencies (development)

### Backup Strategy
```bash
# Database backup
make backup

# Manual backup
docker-compose exec postgres pg_dump -U webcrawler webcrawler > backup.sql

# Restore
docker-compose exec -T postgres psql -U webcrawler webcrawler < backup.sql
```

## Security

### Production Security Features
- **Non-root users**: All services run as non-root
- **Resource limits**: CPU and memory constraints
- **Network isolation**: Internal service communication
- **Secret management**: Environment-based configuration
- **Health monitoring**: Automatic restart on failure

### Security Checklist
- [ ] Change default passwords in production
- [ ] Set strong JWT secrets
- [ ] Configure HTTPS (reverse proxy)
- [ ] Enable database SSL
- [ ] Set up log monitoring
- [ ] Configure backup encryption

## Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs [service-name]

# Check resource usage
docker stats
```

#### Database Connection Issues
```bash
# Check database health
docker-compose exec postgres pg_isready -U webcrawler

# Reset database
make db-reset

# Check network connectivity
docker-compose exec backend ping postgres
```

#### Performance Issues
```bash
# Monitor resource usage
make monitor

# Check container limits
docker inspect webcrawler-backend | grep -A 10 Resources

# Scale services (production)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale crawler=5
```

### Log Management
```bash
# View all logs
make logs

# View specific service logs
docker-compose logs -f backend

# Log rotation (production)
docker-compose logs --tail=1000 backend > backend.log
```

## Platform-Specific Notes

### Windows
- **Docker Desktop**: Ensure WSL2 backend is enabled
- **File Sharing**: Configure shared drives in Docker Desktop
- **Performance**: Use WSL2 for better performance
- **Paths**: Scripts handle Windows path conversion automatically

### macOS
- **Docker Desktop**: Allocate sufficient resources (4GB+ RAM)
- **File Sharing**: Default sharing should work
- **Performance**: Consider using Docker Desktop with VirtioFS

### Linux
- **Docker Engine**: Install Docker CE and Docker Compose
- **Permissions**: Add user to docker group
- **Resources**: No virtualization overhead

## Monitoring and Maintenance

### Health Monitoring
```bash
# Check service health
make health

# Continuous monitoring
watch -n 30 'make health'
```

### Maintenance Tasks
```bash
# Update images
docker-compose pull
docker-compose up -d

# Clean unused resources
docker system prune -f

# Update dependencies
docker-compose build --no-cache
```

### Performance Tuning
```bash
# Adjust resource limits in docker-compose files
# Monitor with:
docker stats --no-stream

# Scale services based on load:
docker-compose up -d --scale crawler=3
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: |
          chmod +x scripts/deploy.sh
          ./scripts/deploy.sh -e production -s
```

### Jenkins Pipeline
```groovy
pipeline {
    agent any
    stages {
        stage('Deploy') {
            steps {
                sh 'chmod +x scripts/deploy.sh'
                sh './scripts/deploy.sh -e production'
            }
        }
    }
}
```

## Support

For deployment issues:
1. Check this documentation
2. Review logs: `make logs`
3. Check resource usage: `make monitor`
4. Verify prerequisites are met
5. Try clean deployment: `make clean && make dev`