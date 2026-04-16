# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for bcrypt
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including dev - needed for prisma CLI and nest build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy entire node_modules from builder (includes prisma CLI v5.x and all deps)
COPY --from=builder /app/node_modules ./node_modules

# Copy prisma schema (needed for db push at runtime)
COPY --from=builder /app/prisma ./prisma

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads

# Create entrypoint script inline (avoids Windows CRLF issues)
RUN printf '#!/bin/sh\nset -e\necho "==> Running database migrations..."\nnpx prisma db push --skip-generate --accept-data-loss 2>&1 || { echo "Retry in 5s..."; sleep 5; npx prisma db push --skip-generate --accept-data-loss; }\necho "==> Starting application..."\nexec node dist/src/main.js\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
