# ── Stage 1: Bundle ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY apps/api/package.json ./package.json
RUN npm install && npm cache clean --force

COPY apps/api/src ./src
RUN npm run build:docker

# ── Stage 2: Runtime (no source) ──
FROM node:22-alpine

WORKDIR /app

COPY apps/api/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY apps/api/db ./db

EXPOSE 8787

USER node

CMD ["node", "dist/index.mjs"]
