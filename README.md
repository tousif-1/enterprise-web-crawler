# Enterprise Web Crawler

An enterprise-grade web crawler designed for marketing site analysis with capabilities to identify broken links, accessibility issues (WCAG 2.2 AA compliance), and provide searchable indexed results.

## Project Structure

This is a monorepo containing the following packages:

- `packages/frontend` - React frontend application
- `packages/backend` - Express.js API server
- `packages/crawler` - Web crawler service with Puppeteer
- `packages/shared` - Shared types and utilities

## Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Git

## Quick Start

### Local Development with Docker

1. Clone the repository:
```bash
git clone <repository-url>
cd enterprise-web-crawler
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Start all services with Docker Compose:
```bash
npm run docker:up
```

4. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Elasticsearch: http://localhost:9200

### Local Development without Docker

1. Install dependencies:
```bash
npm install
```

2. Start infrastructure services (PostgreSQL, Redis, Elasticsearch):
```bash
docker-compose up postgres redis elasticsearch -d
```

3. Start development servers:
```bash
# Terminal 1 - Backend
npm run dev --workspace=@enterprise-web-crawler/backend

# Terminal 2 - Crawler
npm run dev --workspace=@enterprise-web-crawler/crawler

# Terminal 3 - Frontend
npm run dev --workspace=@enterprise-web-crawler/frontend
```

## Available Scripts

### Root Level
- `npm run build` - Build all packages
- `npm run dev` - Start all development servers
- `npm run test` - Run tests for all packages
- `npm run lint` - Lint all packages
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier
- `npm run docker:build` - Build Docker images
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services

### Package Level
Each package has its own scripts accessible via workspace commands:
```bash
npm run <script> --workspace=@enterprise-web-crawler/<package>
```

## Architecture

The system follows a microservices architecture:

- **Frontend**: React with TypeScript, Material-UI, Socket.io for real-time updates
- **Backend**: Express.js API gateway with WebSocket support
- **Crawler**: Puppeteer-based crawler with Axe-core for accessibility testing
- **Database**: PostgreSQL for structured data
- **Cache**: Redis for session management and job queues
- **Search**: Elasticsearch for full-text search and indexing

## Platform Support

- ✅ Mac (Intel/Apple Silicon)
- ✅ Windows 10/11
- ✅ Docker (Linux containers)
- ✅ AWS (ECS/EKS deployment ready)

## Development Guidelines

### Code Quality
- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- Jest/Vitest for testing

### Git Workflow
1. Create feature branches from `main`
2. Follow conventional commit messages
3. Ensure all tests pass before merging
4. Use pull requests for code review

## Deployment

### Docker Production Build
```bash
docker-compose -f docker-compose.prod.yml up --build
```

### AWS Deployment
Infrastructure as Code templates are provided in the `/infrastructure` directory for AWS deployment using ECS/EKS.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

[License information to be added]