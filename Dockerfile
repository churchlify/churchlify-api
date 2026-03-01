# Build stage - use Debian-based image for mediasoup compilation requirements
FROM node:22-bookworm AS builder

WORKDIR /usr/src/app

# Install build dependencies required by mediasoup (needs kernel headers, libffi, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    gcc \
    linux-headers-generic \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files
COPY package*.json ./

# Install dependencies with production flag and clean cache
RUN npm ci --only=production && \
    npm cache clean --force

# Production stage - use Debian-slim for mediasoup binary compatibility
FROM node:22-bookworm-slim

WORKDIR /usr/src/app

# Copy built node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application files (excluding what's in .dockerignore)
COPY . .

# Remove unnecessary files (but keep package.json and package-lock.json)
RUN rm -f removeIndexes.js seeder.js docker-compose.yml \
    && rm -f service_account.json churchlify-firebase-adminsdk-*.json \
    && rm -rf .git .github .vscode .idea test __tests__

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -g nodejs -u 1001 -m -s /bin/bash nodejs

# Create logs directory with proper permissions for nodejs user
RUN mkdir -p logs && chown -R nodejs:nodejs /usr/src/app

USER nodejs

EXPOSE 3000

# Note: Credentials should be injected via secrets or mounted volumes, not hardcoded
CMD ["npm", "run", "api"]

LABEL version="5"
