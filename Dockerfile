# Build stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

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

# Set environment credentials
ENV GOOGLE_APPLICATION_CREDENTIALS=service_account.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["npm", "run", "api"]

LABEL version="4"
