#!/bin/bash

# Simple deployment script for Enterprise Web Crawler
# Quick setup for development environment

set -e

echo "🚀 Enterprise Web Crawler - Quick Deploy"
echo "========================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Setup environment
echo "📋 Setting up development environment..."
if [ -f ".env.development" ]; then
    cp .env.development .env
    echo "✅ Environment configured"
else
    cp .env.example .env
    echo "⚠️  Using example environment (please review .env file)"
fi

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up -d --build

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Health check
echo "🏥 Checking service health..."
max_attempts=10
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend service is healthy"
        break
    fi
    echo "   Attempt $attempt/$max_attempts: Waiting for backend..."
    sleep 5
    ((attempt++))
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Backend service failed to start properly"
    echo "📋 Check logs with: docker-compose logs"
    exit 1
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📱 Access your application:"
echo "   Frontend:    http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   Health:      http://localhost:8000/health"
echo ""
echo "📋 Useful commands:"
echo "   View logs:   docker-compose logs -f"
echo "   Stop:        docker-compose down"
echo "   Restart:     docker-compose restart"
echo "   Cleanup:     docker-compose down -v"
echo ""