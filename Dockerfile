# Single image serving both the API and the compiled SPA from one origin.
# The frontend and backend are built in separate stages so a change to one
# does not invalidate the other's dependency layer.

# ── Frontend build ────────────────────────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ── Backend build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN npx tsc -p tsconfig.json

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
# Served by the Node process itself — see src/middleware/staticFiles.ts.
COPY --from=web /web/dist ./web
ENV WEB_ROOT=/app/web
EXPOSE 3000
CMD ["node", "dist/server.js"]
