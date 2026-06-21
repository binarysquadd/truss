# Truss

**Open-source, self-hostable Backend-as-a-Service console.** One dashboard over Postgres,
authentication, fine-grained authorization, and S3-compatible storage — so you get a
Supabase/Appwrite-style backend you fully own.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

> **Open core.** This repo is the single-instance app you self-host. The managed,
> multi-tenant **Truss Cloud** (provisioning, metering, billing) is a separate hosted service.

<p align="center">
  <img alt="Truss architecture: browser → dashboard → API → backing services (Postgres, Ory Kratos/Keto/Hydra/Oathkeeper, MinIO, Valkey, flagd)" src="docs/architecture.png" width="820">
</p>

## What's inside

- **Database** — Postgres SQL workbench (Monaco editor, **read-only by default**), schema browser, ERD, pgvector, full-text search, security/perf advisors.
- **Authentication** — email/password, magic links, social login, MFA (Ory Kratos).
- **Authorization** — fine-grained, relation-based permissions / RBAC (Ory Keto).
- **OAuth2 / OIDC** — be your own identity provider (Ory Hydra).
- **Storage** — S3-compatible buckets, presigned up/downloads (MinIO).
- **Cache / KV** — Redis-compatible in-memory cache, sessions, rate-limit counters (Valkey).
- **Plus** — realtime subscriptions, webhooks, database branching, backups/PITR, a client API surface, feature flags.

## Quickstart (self-host)

The whole stack — Postgres, Kratos (auth), Keto (authz), MinIO (storage), Valkey (cache),
flagd, the API, and the dashboard — comes up from one command. Two supported paths:

**Kubernetes (umbrella Helm chart)** — one `helm install`, no operators required:

```bash
helm install truss ./charts/truss -n truss --create-namespace \
  --set secrets.encryptionKey=$(openssl rand -hex 32) \
  --set secrets.dbPassword=$(openssl rand -hex 16) \
  --set secrets.minioSecretKey=$(openssl rand -hex 16) \
  --set secrets.valkeyPassword=$(openssl rand -hex 16)
# then: kubectl -n truss port-forward svc/truss-dashboard 3000:80  → http://localhost:3000
```

**First login:** on first boot Truss seeds a default admin (`admin@truss.local`) so you
can sign in right away. The password is printed once to the API logs:
`kubectl -n truss logs deploy/truss-api | grep "Default admin"` (Compose:
`docker compose logs truss-api | grep "Default admin"`). Change it immediately under
**Settings → Account**. Set `TRUSS_BOOTSTRAP_ADMIN_PASSWORD` for known creds, or
`TRUSS_BOOTSTRAP_ADMIN=false` to disable seeding and register the first user yourself.

Images are published at `ghcr.io/binarysquadd/truss-{api,dashboard}` (override `images.*`
to pin/replace). For production, set `publicUrl` + `corsAllowedOrigins` and front it with TLS.

**Docker Compose** — see [`selfhosted/README.md`](selfhosted/README.md):

```bash
cp .env.selfhosted.example .env.selfhosted   # fill in generated secrets
docker compose -f docker-compose.selfhosted.yml up -d
```

## Development

```bash
npm install
cp .env.example .env        # DATABASE_URL, KRATOS_*, KETO_*, MINIO_* (see the file)
make dev                    # api :8787 + dashboard :5173 + docs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the monorepo layout and conventions.

## Hardening (read before exposing to the internet)

- **`CORS_ALLOWED_ORIGINS`** — must be set to your dashboard origin(s). CORS fails closed;
  if unset, the browser app can't reach the API (this is intentional).
- **`ENCRYPTION_KEY`** — a random 32+ char string used to encrypt saved connection
  passwords. **If you lose it, those are unrecoverable.** Set it once and back it up.
- **`TRUSS_ADMIN_IDENTITY_IDS`** — admin-only features (DB roles, migrations, backups,
  authorization rules) are gated. To grant yourself admin: register your account, find your
  Kratos identity ID (`GET /.ory/kratos/sessions/whoami`, or the Authentication panel), set
  `TRUSS_ADMIN_IDENTITY_IDS=<your-id>` (comma-separated for more), and restart the API.
- Put the API behind TLS, run Postgres with backups (PITR), and don't run with dev defaults.

## Architecture & limits

Single-instance edition: **one organization / environment / project** per deployment.
Need many tenants, metering, or billing? That's Truss Cloud — or run multiple instances.

- Frontend: React 19 + Vite + Tailwind v4 + Monaco. Backend: Node + Express 5 + `pg`.
- Cloud-only UI (billing/org admin) ships disabled behind `VITE_IS_PLATFORM` (default off).

## Docs · Contributing · Security · License

- Docs: `apps/docs` (Astro Starlight)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [AGPL-3.0](LICENSE)
