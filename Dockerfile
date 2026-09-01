FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
