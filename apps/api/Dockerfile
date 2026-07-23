FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY db ./db

EXPOSE 8787

USER node

# --import ./src/otel.js installs the OpenTelemetry providers (metrics always on;
# traces + OTLP push opt-in via OTEL_* env) before the app loads. Required: the
# /metrics endpoint and instruments depend on the global MeterProvider it sets up.
CMD ["node", "--import", "./src/otel.js", "src/index.js"]
