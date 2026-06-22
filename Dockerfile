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
# OTel bootstrap is loaded via --import (before the app) so it can patch http/express/pg.
# It is self-contained (only OpenTelemetry imports) and no-ops unless an exporter is configured.
COPY apps/api/src/otel.js ./otel.js

EXPOSE 8787

USER node

CMD ["node", "--import", "./otel.js", "dist/index.mjs"]
