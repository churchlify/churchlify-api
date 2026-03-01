# Build stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies required by native modules (mediasoup needs python3, pip, and build tools)
RUN apk add --no-cache python3 py3-pip make g++ gcc

# Copy only package files
COPY package*.json ./

# Install dependencies with production flag and clean cache
RUN npm ci --only=production && \
    npm cache clean --force

# Production stage
FROM node:22-alpine

WORKDIR /usr/src/app

# Copy built node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application files (excluding what's in .dockerignore)
COPY . .

# Remove unnecessary files
RUN rm -f removeIndexes.js seeder.js *.json docker-compose.yml

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

# Note: Credentials should be injected via secrets or mounted volumes, not hardcoded
CMD ["npm", "run", "api"]

LABEL version="5"
