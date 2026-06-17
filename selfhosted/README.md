# Truss Self-Hosted Setup

Run the entire Truss platform on your own infrastructure with a single `docker compose` command.

## Prerequisites

- Docker Engine 24+ with Compose V2 (`docker compose` — not the legacy `docker-compose`)
- 2 GB RAM minimum (4 GB recommended)
- Ports 3000, 9000, 9001 available

## Quick Start

```bash
# 1. Copy and edit the environment file
cp .env.selfhosted.example .env.selfhosted

# 2. Generate real secrets (recommended for anything beyond local testing)
sed -i "s/change-me-to-a-random-64-char-hex-string/$(openssl rand -hex 32)/" .env.selfhosted
sed -i "s/change-me-cookie-secret-32chars\!/$(openssl rand -hex 16)/" .env.selfhosted
sed -i "s/change-me-cipher-secret-32chars\!/$(openssl rand -hex 16)/" .env.selfhosted

# 3. Start all services
docker compose -f docker-compose.selfhosted.yml --env-file .env.selfhosted up -d
```

Open **http://localhost:3000** in your browser. Register your first user account to get started.

## Architecture

```
                    :3000
                      |
               +-----------+
               |   Nginx   |  (truss-dashboard)
               | Dashboard |  Serves React SPA
               +-----+-----+
                     |
          +----------+----------+
          |                     |
    /api, /v1            /realtime (WS)
          |                     |
     +----+----+          +----+----+
     |Truss API|          |Truss API|
     | :8787   +----------+ :8787   |
     +----+----+               |
          |                    |
    +-----+------+------+-----+
    |            |            |
+---+---+  +----+---+  +----+---+
|Postgres|  | Kratos |  |  Keto  |
| :5432  |  | :4433  |  | :4466  |
+--------+  +--------+  +--------+
    |
+---+---+
| MinIO |
| :9000 |
+-------+
```

## Default Credentials

| Service   | Username / Access | Password     | URL                     |
|-----------|-------------------|--------------|-------------------------|
| Dashboard | (register first)  | (you choose) | http://localhost:3000    |
| MinIO     | minioadmin        | minioadmin   | http://localhost:9001    |
| Postgres  | truss             | truss        | localhost:5432 (not exposed by default) |

## Common Operations

### Stop / Start / Restart

```bash
# Stop all services (data is preserved in volumes)
docker compose -f docker-compose.selfhosted.yml --env-file .env.selfhosted down

# Restart
docker compose -f docker-compose.selfhosted.yml --env-file .env.selfhosted up -d

# Restart a single service
docker compose -f docker-compose.selfhosted.yml restart truss-api
```

### View Logs

```bash
# All services
docker compose -f docker-compose.selfhosted.yml logs -f

# Single service
docker compose -f docker-compose.selfhosted.yml logs -f truss-api
docker compose -f docker-compose.selfhosted.yml logs -f kratos
```

### Backup Postgres

```bash
docker compose -f docker-compose.selfhosted.yml exec postgres \
  pg_dump -U truss truss > backup_$(date +%Y%m%d).sql
```

### Backup MinIO

```bash
# Copy the entire MinIO data volume to a local directory
docker cp $(docker compose -f docker-compose.selfhosted.yml ps -q minio):/data ./minio_backup
```

### Restore Postgres

```bash
cat backup_20260323.sql | docker compose -f docker-compose.selfhosted.yml exec -T postgres \
  psql -U truss truss
```

## Exposing Postgres to Host

By default, Postgres is only accessible within the Docker network. To connect with external tools (pgAdmin, DBeaver), add a port mapping by creating a `docker-compose.override.yml`:

```yaml
services:
  postgres:
    ports:
      - "5432:5432"
```

## Adding Optional Services

### Ory Hydra (OAuth2 / OIDC)

Add to `docker-compose.selfhosted.yml`:

```yaml
  hydra-migrate:
    image: oryd/hydra:v2.2.0
    restart: "no"
    depends_on:
      postgres:
        condition: service_healthy
    command: migrate sql --yes postgres://truss:${DB_PASSWORD:-truss}@postgres:5432/truss?sslmode=disable&search_path=hydra

  hydra:
    image: oryd/hydra:v2.2.0
    restart: unless-stopped
    depends_on:
      hydra-migrate:
        condition: service_completed_successfully
    environment:
      DSN: postgres://truss:${DB_PASSWORD:-truss}@postgres:5432/truss?sslmode=disable&search_path=hydra
      URLS_SELF_ISSUER: http://localhost:4444
      URLS_CONSENT: http://localhost:3000/consent
      URLS_LOGIN: http://localhost:3000/login
    command: serve all --dev
    ports:
      - "4444:4444"
    expose:
      - "4445"
```

Then add to the `truss-api` environment:

```yaml
      HYDRA_PUBLIC_URL: http://hydra:4444
      HYDRA_ADMIN_URL: http://hydra:4445
```

### flagd (Feature Flags)

```yaml
  flagd:
    image: ghcr.io/open-feature/flagd:latest
    restart: unless-stopped
    command: start --uri file:/etc/flagd/flags.json
    volumes:
      - ./selfhosted/flags.json:/etc/flagd/flags.json:ro
    expose:
      - "8013"
```

Then add to the `truss-api` environment:

```yaml
      FLAGD_URL: http://flagd:8013
```

## Upgrading

```bash
git pull
docker compose -f docker-compose.selfhosted.yml --env-file .env.selfhosted build
docker compose -f docker-compose.selfhosted.yml --env-file .env.selfhosted up -d
```

Migrations run automatically on startup (via the `kratos-migrate` and `keto-migrate` init containers). Truss API migrations run at boot as well.

## Running Behind a Reverse Proxy (Caddy / Traefik / Nginx)

Set `TRUSS_PUBLIC_URL` in `.env.selfhosted` to your external URL (e.g., `https://truss.example.com`), then proxy traffic to port 3000. The dashboard Nginx handles everything from there.

For HTTPS with Caddy:

```
truss.example.com {
    reverse_proxy localhost:3000
}
```
