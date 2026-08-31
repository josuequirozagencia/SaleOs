# Backend Dockerfile — production image for the SalesOS API.
# Build: docker build -f server/Dockerfile -t salesos-api .
# Run:   docker run -p 3001:3001 --env-file server/.env salesos-api

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Compile the backend (TS → JS). The server uses only Node built-ins, so the
# compiled output has no runtime dependencies.
RUN npx tsc -p server/tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/package.json ./
# The server uses only Node built-ins (http, crypto) — no runtime deps needed.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "dist/server.js"]
