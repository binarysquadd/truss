# Truss Architecture & Infrastructure

> Last updated: 2026-03-25

## System Overview

```
                         ┌─────────────────────────────────────┐
                         │         Cloudflare Pages (free)      │
                         │  ┌───────────┐ ┌──────┐ ┌────────┐  │
    Users ──────────────>│  │ Dashboard │ │ Docs │ │  WWW   │  │
                         │  │ :5173     │ │:5175 │ │ :5176  │  │
                         │  └─────┬─────┘ └──────┘ └────────┘  │
                         └────────┼────────────────────────────┘
                                  │ fetch(VITE_API_BASE_URL)
                                  ▼
                    ┌─────────────────────────────────┐
                    │  Hetzner VPS (~$20-40/mo)        │
                    │                                  │
                    │  ┌────────────────────────┐      │
                    │  │  Truss API (Express)   │      │
                    │  │  Port 8787             │      │
                    │  └──────────┬─────────────┘      │
                    │             │                     │
                    │  ┌──────┐ ┌┴─────┐ ┌──────┐      │
                    │  │Kratos│ │ Keto │ │Hydra │      │
                    │  │:4433 │ │:4466 │ │:4444 │      │
                    │  └──────┘ └──────┘ └──────┘      │
                    │  ┌──────────┐ ┌───────────┐      │
                    │  │Oathkeeper│ │PostgreSQL  │      │
                    │  │  :4455   │ │  :5432     │      │
                    │  └──────────┘ └───────────┘      │
                    │  ┌───────────┐                    │
                    │  │  MinIO    │                    │
                    │  │  :9000    │                    │
                    │  └───────────┘                    │
                    └──────────────────────────────────┘
```

| Component | Role |
|-----------|------|
| **Truss API** | Express 5 backend — JSON API, WebSocket, Swagger UI |
| **PostgreSQL** | Platform DB + per-tenant isolated databases + Hydra DB |
| **Ory Kratos** | Authentication / identity (public :4433, admin proxied) |
| **Ory Keto** | Authorization / permissions (read :4466, write proxied) |
| **Ory Hydra** | OAuth2 / OIDC (public :4444, admin :4445, `hydra` schema) |
| **Ory Oathkeeper** | API Gateway (proxy :4455, admin :4456, stateless) |
| **MinIO** | S3-compatible object storage (:9000) |
| **Cloudflare Pages** | Static hosting for Dashboard, Admin, Docs, WWW |

---

## API Design

### Two-Layer Model

**Layer 1 -- Management API** (Dashboard / CI/CD calls). Session cookie or service_role key.

```
POST/GET/PATCH/DELETE  /manage/v1/projects
POST/GET/DELETE        /manage/v1/projects/:id/branches
POST/GET/DELETE        /manage/v1/projects/:id/databases
POST/GET/DELETE        /manage/v1/projects/:id/roles
POST/GET/DELETE        /manage/v1/projects/:id/api-keys
POST                   /manage/v1/sql/query
GET                    /manage/v1/sql/tables, /table-details, /diagnostics
GET/POST/PATCH         /manage/v1/auth/*
GET/POST/DELETE        /manage/v1/storage/*
GET                    /manage/v1/billing/usage, /plan, /consumption
GET/POST/PUT/DELETE    /api/flags/*
```

**Layer 2 -- Client API** (end-user apps call). API key auth (anon or service_role).

```
POST   /v1/auth/signup, /login, /logout, /refresh, /recover
GET    /v1/auth/me
POST   /v1/auth/oauth/:provider
GET/POST/PATCH/DELETE  /v1/db/:table
POST                   /v1/db/rpc/:function
POST   /v1/sql              (service_role only)
POST   /v1/sql/transaction  (service_role only)
POST   /v1/storage/:bucket/upload
GET    /v1/storage/:bucket/:path
DELETE /v1/storage/:bucket/:path
GET    /v1/realtime          (WebSocket)
POST   /api/flags/evaluate
POST   /api/flags/evaluate/bulk
```

### Auth Model

```
Client API:
  Header: apikey: <anon_key>           -- public, rate-limited, respects RLS
  Header: apikey: <service_key>        -- full access, bypasses RLS
  Header: Authorization: Bearer <jwt>  -- identifies end-user for RLS

Management API:
  Cookie: truss_session=<session>      -- dashboard login
  Header: Authorization: Bearer <pat>  -- personal access token for CI/CD
```

### Implementation Status

Modular Express 5 at `apps/api/src/`:
- **`index.js`** -- entry point, middleware, routes, WebSocket, Swagger UI
- **`lib/`** -- state, helpers, api-keys, internal (schema bootstrap + settings store + audit log), s3, kratos, realtime, session, csrf, observability, hydra, oathkeeper, demo-seed, email, tenant-db
- **`routes/`** -- sql, client-api, auth, storage, branches, features, keto, realtime, vectors, search, webhooks, projects, hydra, oathkeeper, connections, orgs, admin-analytics, sample-app, dev
- **300+ endpoints** total (Client API complete, Management API 29 endpoints, Dashboard API ~149 endpoints)
- **Swagger UI** at `/v1/docs`, OpenAPI JSON at `/v1/openapi.json`

TODO: background jobs (branch TTL, backup scheduling, retention cleanup), usage alert threshold evaluation.

---

## Database Layout

```
PostgreSQL Instance (single server)
|
+-- Platform Database ("sampledb" -- DATABASE_URL)
|   |
|   +-- truss_internal schema          <-- Platform metadata (shared, tenant_id scoped)
|   |   +-- tenants                    -- Customer accounts (1 row per signup)
|   |   +-- tenant_databases           -- Maps tenant_id -> database name
|   |   +-- projects                   -- Customer projects (schema + bucket refs)
|   |   +-- api_keys                   -- API keys (anon + service_role per project)
|   |   +-- orgs / org_members         -- Organizations & team membership
|   |   +-- subscriptions              -- Lemon Squeezy subscription state
|   |   +-- payment_events             -- Payment webhook history
|   |   +-- billing_config             -- Key-value settings per tenant
|   |   +-- billing_periods            -- Monthly usage windows
|   |   +-- active_boosters            -- Booster pack quantities
|   |   +-- usage_snapshots            -- Periodic resource measurements
|   |   +-- alert_history              -- Billing alert dedup tracking
|   |   +-- saved_queries              -- SQL workbench saved queries
|   |   +-- audit_logs                 -- All system events
|   |   +-- branches                   -- Database branch metadata
|   |   +-- backups                    -- Backup metadata + filenames
|   |   +-- webhooks / webhook_logs    -- Webhook configs + delivery logs
|   |   +-- realtime_subscriptions     -- Active pg_notify subscriptions
|   |   +-- opl_versions              -- Keto OPL version history
|   |   +-- waitlist                   -- Landing page signups
|   |   \-- registration_invitations   -- Invite-only registration tokens
|   |
|   \-- public schema                  <-- Empty (platform DB has no user tables)
|
+-- truss_t_aabbccdd1122               <-- Tenant A's ISOLATED database
|   +-- public schema                  -- Default user tables
|   +-- project_myapp_ab12 schema      -- Project-scoped tables
|   \-- (extensions: uuid-ossp, pg_trgm, pgcrypto, vector)
|
+-- truss_t_eeff00112233               <-- Tenant B's ISOLATED database
|   \-- ...
|
\-- hydra                              <-- Hydra's own database (OAuth2 state)
```

## Storage Layout (MinIO)

```
MinIO Instance (single server, S3-compatible)
|
+-- t-aabb-myapp-ab12/                 <-- Tenant A, Project "myapp" bucket
|   +-- uploads/photo.jpg
|   \-- documents/report.pdf
|
+-- t-eeff-webapp-cd34/                <-- Tenant B, Project "webapp" bucket
|
\-- (bucket ownership enforced via truss_internal.projects WHERE tenant_id)
```

---

## Shared Services (Ory Stack)

All tenants share these services. Isolation is enforced at the application layer:

| Service | Isolation Method | How |
|---------|-----------------|-----|
| **Kratos** (Auth) | App-layer mapping | Maps `identity_id -> tenant_id` in `truss_internal.tenants` |
| **Keto** (AuthZ) | Namespace prefixing | All namespaces prefixed with `t_{tenantId}__` |
| **Hydra** (OAuth2) | Client metadata | `tenant_id` stored in client metadata, all queries filter by it |
| **Oathkeeper** (Gateway) | Admin-only | Gateway rules are global platform config |

---

## Tenant Isolation

| Layer | Method | Enforced By |
|-------|--------|-------------|
| **Database** | Separate database per tenant | `provisionTenantDatabase()` + `getTenantPool()` |
| **Storage** | Bucket ownership check | `assertBucketOwnership()` queries projects table |
| **API routes** (`/api/*`) | Session middleware | `sessionMiddleware` -> `resolveTenantPool` |
| **Client API** (`/v1/*`) | API key middleware | `apiKeyAuth` -> resolves `tenant_id` -> `getTenantPool()` |
| **AuthZ (Keto)** | Namespace prefix | `t_{tenantId}__` prefix on all operations |
| **OAuth2 (Hydra)** | Client metadata | `clientBelongsToTenant()` checks metadata.tenant_id |
| **Realtime** | Channel-tenant map | `channelTenantMap` + WS tagged with tenantId |
| **Webhooks** | Query scoping | All queries include `WHERE tenant_id = $1` |
| **Billing** | Query scoping | All queries include `WHERE tenant_id = $1` |

---

## Connection Pool Architecture

```javascript
getPool()              // Platform database (truss_internal schema, max 20 connections)
getCustomerPool(req)   // req.tenantPool || getPool() (fallback to platform)
getTenantPool(id)      // Lazy-creates pool to truss_t_* database (LRU cache, max 50 pools)
getPoolForDatabase(db) // Generic pool factory with LRU eviction
```

---

## Customer Onboarding Flow

**Step 1 -- Signup.** `POST /api/auth/register` -> Kratos creates identity -> session cookie set. No DB writes yet.

**Step 2 -- First Dashboard Load.** Session middleware validates with Kratos -> auto-INSERT tenant row + billing_config (plan: starter).

**Step 3 -- Create First Project.** `POST /api/projects/provision` -> `CREATE DATABASE "truss_t_<12hex>"` with extensions -> create schema -> create MinIO bucket -> generate anon + service_role API keys -> persist to `truss_internal.projects`.

**Step 4 -- Client API Calls.** End-user app sends `apikey` header -> `apiKeyAuth` resolves tenant -> query executes in tenant's isolated database.

**Step 5 -- Plan Upgrade.** Redirect to Lemon Squeezy checkout -> webhook fires -> subscription record + billing_config updated -> quota limits increase immediately.

---

## Deployment

### Current State

| Component | Platform | URL |
|-----------|----------|-----|
| Dashboard | CF Pages | app.truss.binarysquad.org |
| Landing page | CF Pages | truss.binarysquad.org |
| Admin | CF Pages | admin.truss.binarysquad.org |
| Docs | CF Pages | docs.truss.binarysquad.org |
| API + Ory stack + Postgres + MinIO | Coolify/Docker on Hetzner | api.truss.binarysquad.org |

Demo mode runs on the same API instance (`TRUSS_DEMO_MODE=true` or per-request `x-demo: true` header).

### Cloudflare Pages Config

All projects use **root directory `/`** (monorepo root -- npm workspaces need it) and **`NODE_VERSION=20`** (avoids Node 24 type-stripping issues).

**Dashboard** (`truss`):
- Build: `npm run build -w @truss/dashboard`
- Output: `apps/dashboard/dist`
- Env: `VITE_API_BASE_URL=https://<api-host>`

**Admin** (`truss-admin`):
- Build: `npm run build -w @truss/admin`
- Output: `apps/admin/dist`
- Env: `VITE_API_BASE_URL=https://<api-host>`, `VITE_DASHBOARD_URL=https://app.truss.binarysquad.org`

**Docs** (`truss-docs`):
- Build: `npm run build -w @truss/docs`
- Output: `apps/docs/dist`
- Env: `NODE_VERSION=20` only

**Landing Page** (`truss-www`):
- Build: `npm run build -w @truss/www`
- Output: `apps/www/dist`
- Env: `NODE_VERSION=20` only

### API Docker Config

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev
COPY apps/api/src ./src
COPY apps/api/db ./db
EXPOSE 8787
CMD ["node", "src/index.js"]
```

Two Dockerfiles: `apps/api/Dockerfile` (API-only) and root `Dockerfile` (used by Coolify which clones full repo). Both produce the same ~100MB image.

### Key Deployment Notes

1. Dashboard & Admin need `VITE_API_BASE_URL` -- without it they default to relative `/api/*` which won't resolve on CF Pages.
2. Dashboard and Admin may need `public/_redirects` with `/* /index.html 200` for SPA fallback on page refresh.
3. The API must allow CORS from `*.pages.dev` origins (or custom domains).
4. Docs & WWW are fully static -- no API calls needed.

---

## Scaling Roadmap

### Current: Single VPS (0-50 tenants)

Everything runs on one Hetzner VPS (~$20-40/mo). The API server is stateless except for:
- `consumptionMetrics` in-memory bandwidth counter (move to Postgres for multi-instance)
- `realtimeClients` WebSocket connections (per-instance by nature)
- `_pool` / `branchPools` connection pools (per-instance, correct behavior)

Ory sessions are database-backed -- any API instance can validate via Kratos `/sessions/whoami`. No sticky sessions needed.

### Phase 0: 2-VPS Split (when VPS 1 hits 70% sustained load)

**VPS 1 (App tier):** Truss API, Ory Kratos/Keto/Hydra/Oathkeeper, Coolify.
**VPS 2 (Data tier):** PostgreSQL, MinIO, PgBouncer (optional).

Migration: `pg_dump`/`pg_restore` for Postgres, `mc mirror` for MinIO, then update env vars (`DATABASE_URL`, `MINIO_S3_ENDPOINT`) to point at VPS 2 private IP. No code changes required.

If PgBouncer is added: one 5-line change in `buildPool()` to use pooled connection for queries and direct connection for migrations/DDL.

Load balancing via Cloudflare Load Balancing ($5/mo) with health checks on `/api/health` when a second API instance is needed (~100+ concurrent tenants).

### Phase 1: Docker MVP (per-tenant provisioning)

Single VPS, dockerode talking to Docker socket. Restate durable workflow provisions per-tenant: Docker network -> Postgres container -> MinIO bucket -> Kratos config -> Caddy route -> API keys. Saga pattern for rollback on failure.

### Phase 2: Terraform + Automated VPS (30-100 tenants)

Terraform for Hetzner VPS provisioning (2-3 servers). Cloud-init installs Docker + Coolify agent. Backup automation via cron + `mc mirror`.

### Phase 3: K3s + kro (100+ concurrent tenants)

| Layer | Tool |
|-------|------|
| Infrastructure | K3s (lightweight K8s, ~512MB RAM) |
| GitOps | Flux CD (auto-restores cluster from Git) |
| Workflow engine | Restate |
| Resource template | kro (one CRD provisions Postgres + MinIO + Kratos) |
| Database operator | Zalando Postgres Operator |
| Storage operator | MinIO Operator |
| Routing | Caddy |

Full cluster recreate in ~4 minutes: `terraform apply` -> `k3sup install` -> `flux bootstrap` -> state restored from Git.

**Cost at scale (3-node cluster, 50-100 tenants):** ~$92-100/mo (3x 4GB/2vCPU nodes + 100GB storage + load balancer).

### Database Replication Strategy

- **0-50 tenants:** Single Postgres, daily `pg_dump` to MinIO, WAL archiving for PITR.
- **50-200 tenants:** Primary-replica. Route read-only queries to replica via `getReadPool()`.
- **200+ tenants:** Per-tenant Postgres instances. Shared management DB on dedicated instance. This is where K3s + Zalando Operator makes sense.

---

## Known Limitations

1. All services on single VPS -- single point of failure
2. No automated backups -- daily/PITR cron not yet implemented
3. No IaC -- Coolify is click-ops, not declarative
4. Bandwidth tracking is global -- not scoped per tenant
5. Billing cron snapshots are global -- should iterate tenants
6. Demo instance runs on platform DB -- not in its own isolated database
7. Go migration deferred -- Express 5 handles current load; plan is Chi + pgx + zerolog when performance demands it
