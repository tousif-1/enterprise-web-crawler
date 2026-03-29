# Enterprise Web Crawler - Quick Start Guide

## 🚀 Running the Application

You have two options to run the Enterprise Web Crawler:

### Option 1: Docker (Recommended)

#### Prerequisites
- Docker Desktop installed and running
- At least 4GB RAM available
- Ports 3000, 8000, 5432, 6379, 9200 available

#### Steps

1. **Start Docker Desktop**
   - Make sure Docker Desktop is running on your system
   - You should see the Docker icon in your system tray

2. **Start the Application**
   ```powershell
   # Windows PowerShell
   .\scripts\start-app.ps1
   
   # Or manually with docker-compose
   docker-compose up -d
   ```

   ```bash
   # Linux/macOS
   ./scripts/start-application.sh
   
   # Or manually with docker-compose
   docker-compose up -d
   ```

3. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Health: http://localhost:8000/api/health

### Option 2: Manual Setup (Development)

If Docker is not available, you can run the services manually:

#### Prerequisites
- Node.js 18+ installed
- PostgreSQL 15+ running
- Redis 7+ running
- Elasticsearch 8+ running (optional, for search features)

#### Steps

1. **Install Dependencies**
   ```powershell
   # Install root dependencies
   npm install
   
   # Install package dependencies
   cd packages/backend && npm install && cd ../..
   cd packages/frontend && npm install && cd ../..
   cd packages/crawler && npm install && cd ../..
   cd packages/shared && npm install && cd ../..
   ```

2. **Setup Database**
   ```sql
   -- Connect to PostgreSQL and create database
   CREATE DATABASE webcrawler;
   CREATE USER webcrawler WITH PASSWORD 'webcrawler_password';
   GRANT ALL PRIVILEGES ON DATABASE webcrawler TO webcrawler;
   ```

3. **Configure Environment**
   ```powershell
   # Copy environment file
   Copy-Item .env.development .env
   
   # Edit .env file to match your local setup
   # Update database, Redis, and Elasticsearch URLs
   ```

4. **Run Database Migrations**
   ```powershell
   cd packages/backend
   npm run db:migrate
   cd ../..
   ```

5. **Start Services**
   
   **Terminal 1 - Backend:**
   ```powershell
   cd packages/backend
   npm run dev
   ```
   
   **Terminal 2 - Frontend:**
   ```powershell
   cd packages/frontend
   npm run dev
   ```
   
   **Terminal 3 - Crawler:**
   ```powershell
   cd packages/crawler
   npm run dev
   ```

## 🔧 Troubleshooting

### Docker Issues

1. **Docker Desktop not running**
   ```
   Error: The system cannot find the file specified
   ```
   **Solution:** Start Docker Desktop and wait for it to fully initialize

2. **Port conflicts**
   ```
   Error: Port already in use
   ```
   **Solution:** Stop other services using ports 3000, 8000, 5432, 6379, 9200

3. **Memory issues**
   ```
   Error: Container killed (OOMKilled)
   ```
   **Solution:** Increase Docker Desktop memory allocation to 4GB+

### Manual Setup Issues

1. **Database connection failed**
   - Verify PostgreSQL is running: `pg_isready`
   - Check connection string in `.env` file
   - Ensure database and user exist

2. **Redis connection failed**
   - Verify Redis is running: `redis-cli ping`
   - Check Redis URL in `.env` file

3. **Frontend build errors**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check Node.js version: `node --version` (should be 18+)

## 📊 Monitoring

### Service Health Checks

```powershell
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs crawler

# Follow logs in real-time
docker-compose logs -f
```

### API Health Check

```powershell
# Test backend health
curl http://localhost:8000/api/health

# Test frontend
curl http://localhost:3000
```

## 🛑 Stopping the Application

### Docker
```powershell
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Manual Setup
- Stop each terminal process (Ctrl+C)
- Stop PostgreSQL, Redis, Elasticsearch services

## 🎯 Using the Application

1. **Open the Web Interface**
   - Navigate to http://localhost:3000
   - You should see the Enterprise Web Crawler dashboard

2. **Create a Crawl Session**
   - Click "New Crawl Session"
   - Enter target URLs (e.g., https://example.com)
   - Configure crawl settings:
     - Max depth: 2-3 for testing
     - Concurrency: 2-5 for local testing
     - Enable accessibility analysis
   - Click "Start Crawl"

3. **Monitor Progress**
   - Watch real-time progress updates
   - View discovered issues
   - Check accessibility compliance scores

4. **View Results**
   - Browse crawled pages
   - Filter by issue type or severity
   - Export reports (PDF, CSV, JSON)

## 🔍 Example Crawl Configuration

For testing, try these settings:

```json
{
  "name": "Test Crawl",
  "urls": ["https://example.com"],
  "maxDepth": 2,
  "concurrency": 3,
  "respectRobots": true,
  "enableAccessibilityAnalysis": true,
  "wcagLevel": "AA",
  "excludePaths": ["/admin", "/private"]
}
```

## 📈 Performance Tips

### For Large Crawls (1000+ pages)
- Increase concurrency gradually (5-10)
- Monitor system resources
- Use Docker with adequate memory (8GB+)
- Consider running on a dedicated server

### For Accessibility Testing
- Enable accessibility analysis
- Set WCAG level to AA or AAA
- Review remediation guidance
- Export detailed reports

## 🆘 Getting Help

1. **Check Logs**
   ```powershell
   docker-compose logs -f backend
   ```

2. **Verify Configuration**
   ```powershell
   .\scripts\validate-integration-clean.ps1
   ```

3. **Run Health Checks**
   ```powershell
   curl http://localhost:8000/api/health
   ```

4. **Reset Everything**
   ```powershell
   docker-compose down -v
   docker-compose up -d --build
   ```

## 🎉 Success!

If everything is working correctly, you should see:
- ✅ Frontend accessible at http://localhost:3000
- ✅ Backend API responding at http://localhost:8000
- ✅ Database connected and migrations applied
- ✅ Real-time updates working via WebSocket
- ✅ Accessibility analysis functional

You're now ready to start crawling and analyzing websites for accessibility compliance!