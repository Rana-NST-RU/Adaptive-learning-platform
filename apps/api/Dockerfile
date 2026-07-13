# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder
# Install ALL dependencies and compile NestJS TypeScript → dist/
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root manifests first (better layer caching)
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install all deps (including devDependencies for build tools)
RUN npm ci --workspace=apps/api

# Copy source files
COPY apps/api ./apps/api

# Generate Prisma client
RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma

# Compile NestJS
RUN npm run build --workspace=apps/api


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runner
# Copy only the production artifacts; no devDependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal forwarding
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

# Copy workspace root manifests again (for workspaces resolution)
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install ONLY production deps
RUN npm ci --workspace=apps/api --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy Prisma schema & generated client
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Use dumb-init to handle PID 1 signal propagation correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main"]
