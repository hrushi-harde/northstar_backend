# ─────────────────────────────────────────────────────────────
# Stage 1 — install dependencies & generate Prisma client
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

# Copy Prisma schema so postinstall (prisma generate) can run
COPY prisma ./prisma

# Install production dependencies only + run postinstall (prisma generate)
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────
# Stage 2 — production image
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling (graceful shutdown)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy installed node_modules (with generated Prisma client) from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY src ./src
COPY prisma ./prisma
COPY package.json ./

# Own everything as the non-root user
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# dumb-init ensures SIGTERM is forwarded to Node so graceful shutdown works
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
