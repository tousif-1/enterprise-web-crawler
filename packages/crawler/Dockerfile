# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install Puppeteer dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/crawler/package*.json ./packages/crawler/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS dev
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/crawler/package*.json ./packages/crawler/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/crawler ./packages/crawler
COPY tsconfig.json ./
COPY .eslintrc.js ./
COPY .prettierrc ./

# Build shared package
RUN cd packages/shared && npm run build

# Start development server
CMD ["npm", "run", "dev", "--workspace=@enterprise-web-crawler/crawler"]

# Production build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/crawler/package*.json ./packages/crawler/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/crawler ./packages/crawler
COPY tsconfig.json ./

# Build applications
RUN cd packages/shared && npm run build
RUN cd packages/crawler && npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/crawler/node_modules ./packages/crawler/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built applications
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/crawler/dist ./packages/crawler/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/crawler/package.json ./packages/crawler/

USER nodejs

# Health check (crawler service doesn't expose HTTP but we can check process)
HEALTHCHECK --interval=60s --timeout=10s --start-period=10s --retries=3 \
  CMD pgrep -f "node packages/crawler/dist/index.js" || exit 1

# Set resource limits via labels (for orchestration tools)
LABEL resource.memory="1g"
LABEL resource.cpu="1.0"

CMD ["node", "packages/crawler/dist/index.js"]