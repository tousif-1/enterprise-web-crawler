# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS dev
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY .eslintrc.js ./
COPY .prettierrc ./

# Build shared package
RUN cd packages/shared && npm run build

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--workspace=@enterprise-web-crawler/frontend"]

# Production build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

# Build applications
RUN cd packages/shared && npm run build
RUN cd packages/frontend && npm run build

# Production stage
FROM nginx:alpine AS production

# Create non-root user for nginx
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -D -H -u 1001 -h /var/cache/nginx -s /sbin/nologin -G nodejs -g nodejs nodejs

# Copy built application
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/nginx.conf

# Set proper permissions
RUN chown -R nodejs:nodejs /usr/share/nginx/html && \
    chown -R nodejs:nodejs /var/cache/nginx && \
    chown -R nodejs:nodejs /var/log/nginx && \
    chown -R nodejs:nodejs /etc/nginx/conf.d

# Switch to non-root user
USER nodejs

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Set resource limits via labels (for orchestration tools)
LABEL resource.memory="256m"
LABEL resource.cpu="0.25"

CMD ["nginx", "-g", "daemon off;"]