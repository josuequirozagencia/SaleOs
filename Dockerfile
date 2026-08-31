FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --production=false || true
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "dist/server.js"]

