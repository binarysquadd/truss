# Truss Feature Reference

> Last updated: 2026-03-25. 166 features across 6 categories.
> Coverage score: 166/195 = 85% (28 features impossible due to Ory OSS limits, 1 needs paid SMS gateway).

---

## Score

| Category | Done | N/A | Total | Coverage |
|----------|:----:|:---:|:-----:|:--------:|
| Authentication | 44 | 2 | 46 | 96% |
| Authorization | 20 | 6 | 26 | 77% |
| OAuth2 / OIDC | 38 | 10 | 48 | 79% |
| API Gateway | 27 | 10 | 37 | 73% |
| Platform | 23 | 0 | 24 | 96% |
| Feature Flags | 14 | 0 | 14 | 100% |
| **Total** | **166** | **28** | **195** | **85%** |

The remaining 1 buildable feature (SMS OTP) requires a paid SMS gateway (Twilio). The 28 N/A features are hard limits of the Ory open-source stack.

## 1. Authentication (44 features)

Powered by Ory Kratos. Competes with: Clerk, Auth0, Firebase Auth, Supabase Auth, WorkOS.

### Login Methods (8)

| Feature | Details |
|---------|---------|
| Email + password | Standard credential login with Kratos flows |
| TOTP MFA | Authenticator app (Google Authenticator, Authy) -- setup, verify, remove |
| WebAuthn MFA | Security keys (YubiKey, etc.) -- setup, verify, remove |
| Recovery codes | Backup codes -- generate, confirm, revoke |
| Passkeys | Passwordless FIDO2/WebAuthn assertion flow |
| Email OTP | Passwordless 2-step code verification |
| Magic link | Email link login via Kratos `link` strategy |
| Social / OIDC login | 18 providers (Google, GitHub, Apple, Microsoft, etc.) with brand icons |

### Identity Management (12)

| Feature | Details |
|---------|---------|
| User CRUD | Full create/read/update/delete with admin API + dashboard UI |
| Server-side search | Search by email, name, or credentials identifier |
| Cursor-based pagination | Kratos Link header parsing for infinite scroll |
| Batch operations | Activate, deactivate, or delete up to 100 users at once |
| User state management | Active/inactive toggle with visual status chips |
| Custom metadata | JSON editor for both public and admin metadata per user |
| Multiple identity schemas | Schema list viewer with traits table and raw JSON |
| User import | CSV/JSON upload with hashed password support |
| User export | Download users as CSV or JSON |
| Admin impersonation | Create session as another user for debugging |
| User bans / blocklist | Ban with state + metadata flag, red chip indicator, ban/unban actions |
| Invite-only registration | Restrict sign-ups to invited users |

### Session Management (7)

| Feature | Details |
|---------|---------|
| Session listing | Per-user session list with device info |
| Session revocation | Revoke single session or all sessions for a user |
| Session lifespan config | Configurable TTL displayed in security dashboard |
| Device/browser tracking | IP address + parsed user agent (browser, OS) |
| Login history | Full history with IP, user agent, success/fail status |
| Force re-authentication | Revoke all sessions to force re-login |
| Session extend | Admin can extend active sessions via API |

### Security (5)

| Feature | Details |
|---------|---------|
| Breached password detection | Have I Been Pwned (HIBP) integration |
| Password policy | Minimum length, similarity check, configurable rules |
| MFA enforcement | Policy to require highest available authentication level |
| Account enumeration protection | Kratos-native protection against user enumeration |
| Brute force protection | Flow TTL limits to throttle automated attacks |

### Account Recovery & Verification (3)

| Feature | Details |
|---------|---------|
| Email verification | Admin-triggered verification flow via Kratos |
| Password recovery | Admin-triggered recovery email + one-time recovery link generation |
| Recovery link/code generation | Direct API for generating recovery links (1h expiry) |

### Hooks & Events (3)

| Feature | Details |
|---------|---------|
| Auth webhooks | Configure webhooks for login, register, recovery, verification, logout events -- with HMAC-SHA256 signing and test-fire |
| Custom email templates | Template editor with variable substitution (verification, recovery, welcome) |
| Session hook | Auto-login after registration (configured in Kratos) |

### Developer Experience (4)

| Feature | Details |
|---------|---------|
| Prebuilt UI components | Copy-paste React login form, Flask route, Go handler snippets |
| SDK snippets | 6 auth flows x 4 languages (JavaScript, Python, Go, cURL) |
| Auth overview dashboard | Stats cards (users, logins 24h, failed logins) + recent activity feed |
| Audit log | Filterable by action type, search, date range -- with pagination |

**Competitors**: 46 total features tracked, 44 DONE, 2 N/A (SAML -- Enterprise License only, LDAP -- not in Kratos OSS).

---

## 2. Authorization (20 features)

Powered by Ory Keto (Zanzibar model). Competes with: Auth0 FGA, SpiceDB/Authzed, Permit.io, Cerbos.

### Core Permission Engine (7)

| Feature | Details |
|---------|---------|
| Relationship tuple CRUD | Create, delete, list tuples (tenant-scoped) |
| Permission check | "Is user X allowed to do Y on resource Z?" |
| Permission expand | Show full access tree (union/intersection/leaf nodes) |
| Reverse lookup | "Who can access resource X?" |
| Batch tuple operations | Bulk select + delete |
| Tuple import/export | JSON upload/download |
| Namespace listing | Tenant-scoped namespace browser |

### Access Control Models (3)

| Feature | Details |
|---------|---------|
| RBAC | Role matrix grid with Kratos user picker + assign modal |
| ReBAC | Relationship-based access control (core Keto model) |
| ACL | Direct tuple assignments for access control lists |

### Dashboard & Tools (10)

| Feature | Details |
|---------|---------|
| Permission checker playground | Interactive check + expand + tree visualization |
| Role management UI | Visual matrix grid with user assignment |
| Namespace browser | List namespaces with OPL reference |
| Relationship graph | ReactFlow visualization of subjects -> objects |
| OPL editor | Monaco editor with TypeScript syntax highlighting + Keto API validation |
| OPL version history | Save snapshots, restore previous versions, line-level diff viewer |
| Model templates | Pre-built OPL patterns (RBAC, Multi-Tenant, Google Docs sharing) |
| Permission check audit trail | All permission checks logged to audit_logs |
| Batch check API | Check up to 50 permissions in a single REST call |
| SDK snippets | JS, Python, Go, cURL examples |

**Competitors**: 26 total features tracked, 20 DONE, 6 N/A (ABAC, consistency tokens, conditional relationships, watch API, LookupResources, SQL data filtering -- all Keto limitations).

---

## 3. OAuth2 / OIDC (38 features)

Powered by Ory Hydra. Competes with: Auth0, Okta, Keycloak, AWS Cognito, FusionAuth.

### Grant Types (7)

| Feature | Details |
|---------|---------|
| Authorization Code | Standard OAuth2 flow via Hydra |
| Authorization Code + PKCE | S256 challenge for public clients |
| Client Credentials | Machine-to-machine authentication |
| Device Authorization (RFC 8628) | Smart TV / CLI device code flow |
| Refresh Token | With rotation + reuse detection |
| Implicit | Available (deprecated per OAuth 2.1) |
| Hybrid Flow | `code id_token` and `code token` response types |

### OIDC (8)

| Feature | Details |
|---------|---------|
| OIDC Discovery | Pretty-viewer with clickable endpoints, supported values, raw JSON |
| ID Tokens | RS256-signed JWTs |
| UserInfo endpoint | Proxied from Hydra |
| Custom claims | Editor for ID token + access token claims with template variable resolution |
| Pairwise subject identifiers | Per-client configuration |
| Front-channel logout | Per-client logout URI configuration |
| Back-channel logout | Per-client logout URI configuration |
| RP-Initiated logout | Revoke login + consent sessions |

### Client Management (10)

| Feature | Details |
|---------|---------|
| Client CRUD | Full create/edit/delete (tenant-scoped) |
| Public vs confidential toggle | `token_endpoint_auth_method` selector |
| Grant type selector | Checkbox UI for allowed grant types |
| Redirect URI manager | Add/remove list with validation |
| Client secret rotation | Generate new secret + copy to clipboard |
| Per-client token TTLs | Configurable access/refresh/ID token lifespans |
| Skip consent toggle | First-party apps auto-approve consent |
| Scope restrictions | Per-client allowed scopes |
| Audience management | Per-client audience configuration |
| Dynamic client registration | RFC 7591 status display in discovery viewer |

### Token Management (4)

| Feature | Details |
|---------|---------|
| Token introspection (RFC 7662) | API + interactive UI form |
| Token revocation (RFC 7009) | Revoke access and refresh tokens |
| JWT access tokens | Opt-in `jwt` strategy toggle per client |
| Flush inactive tokens | Admin endpoint to clean up expired tokens |

### JWK Management (3)

| Feature | Details |
|---------|---------|
| JWKS viewer | Key listing with algorithm, kid, creation date |
| Key creation/rotation | Create keys with 7 algorithm options (RS256, RS384, RS512, ES256, ES384, ES512, EdDSA) |
| Key deletion | Remove individual keys from key sets |

### Consent / Login Bridge (4)

| Feature | Details |
|---------|---------|
| Kratos -> Hydra login bridge | Full bridge endpoints: login challenge, consent challenge, accept, reject |
| Consent screen | Standalone UI with scope checkboxes, client identity display, approve/deny, remember toggle |
| Consent session listing | Search by subject, view granted scopes per client |
| Consent session revocation | Revoke per-client or all consent for a subject |

### Developer Tools (4)

| Feature | Details |
|---------|---------|
| JWT debugger/decoder | Client-side decode with expiry detection + claims display |
| OAuth2 flow tester | Interactive walkthrough: Auth Code + PKCE, Client Credentials, Device Authorization |
| SDK snippets | Auth code, client credentials, cURL examples |
| OIDC discovery viewer | Formatted endpoints, supported values, raw JSON with copy |

**Competitors**: 48 total features tracked, 38 DONE, 10 N/A (JWT Bearer Grant, Token Exchange, CIBA, PAR, RAR, DPoP, mTLS, FAPI -- all Hydra limitations).

---

## 4. API Gateway (27 features)

Powered by Ory Oathkeeper. Competes with: Kong, Traefik, NGINX, Cloudflare Access, Pomerium.

### Rule Management (6)

| Feature | Details |
|---------|---------|
| Rule CRUD | Full create/edit/delete with form-based editor |
| Rule editor | Pipeline fields UI (match, authenticator, authorizer, mutator, upstream) |
| Visual pipeline builder | ReactFlow diagram: Match -> Authenticate -> Authorize -> Mutate -> Upstream |
| Rule import/export | JSON download |
| Rule testing | Live HTTP request tester |
| Rule dry-run | Client-side URL pattern matching simulator |

### Authenticators (8)

| Handler | Description |
|---------|------------|
| `noop` | Pass-through, no authentication |
| `cookie_session` | Validate Kratos session cookies |
| `bearer_token` | Validate Kratos bearer tokens |
| `oauth2_introspection` | Validate tokens via Hydra introspection |
| `oauth2_client_credentials` | Client credentials authentication |
| `jwt` | JWKS-based JWT validation |
| `anonymous` | Allow unauthenticated access |
| `unauthorized` | Reject all requests |

### Authorizers (5)

| Handler | Description |
|---------|------------|
| `allow` | Allow all authenticated requests |
| `deny` | Deny all requests |
| `keto_engine_acp_ory` | Check permissions via Keto (ReBAC) |
| `remote` | HTTP callout to external authorization service |
| `remote_json` | Structured HTTP callout with JSON body |

### Mutators (5)

| Handler | Description |
|---------|------------|
| `noop` | Pass-through, no mutation |
| `header` | Inject headers (X-User-Id, X-User-Email, etc.) |
| `id_token` | Mint OIDC JWT for upstream |
| `cookie` | Set cookies on proxied requests |
| `hydrator` | Enrich requests via external API call |

### Dashboard & Observability (3)

| Feature | Details |
|---------|---------|
| Pipeline visualizer | ReactFlow diagram of all rules with color-coded pipeline stages |
| Request flow debugger | Trace a URL through the pipeline -- shows which rule matches and full handler chain |
| Pipeline handler reference | Documentation for all 18 handler types with example configs |

**Competitors**: 37 total features tracked, 27 DONE, 10 N/A (rate limiting, load balancing, circuit breaker, mTLS, gRPC, WAF, geo-blocking, SAML -- all Oathkeeper limitations).

---

## 5. Platform (23 features)

### Database (7)

| Feature | Details |
|---------|---------|
| SQL workbench | Monaco editor with syntax highlighting, autocomplete, query history |
| ERD visualization | ReactFlow entity-relationship diagrams with draggable nodes |
| Full-text search | PostgreSQL `tsvector` / `tsquery` with ranked results |
| pgvector | AI embeddings -- create indexes, similarity search, vector operations |
| Database branching | Create isolated database branches for testing |
| Backups / PITR | Point-in-time recovery with backup management |
| Database extensions | 33 curated PostgreSQL extensions (9 categories) with toggle UI and CASCADE support |

### Storage (4)

| Feature | Details |
|---------|---------|
| S3 storage | MinIO-powered S3-compatible object storage |
| Bucket management | Create, configure, delete buckets |
| Object browser | Upload, download, delete files with metadata |
| Bucket policies | Access control policies per bucket |

### Infrastructure (7)

| Feature | Details |
|---------|---------|
| Tenant isolation | Database-per-tenant architecture |
| API keys management | Create, revoke, scope API keys |
| Billing / usage metering | Lemon Squeezy integration with plan enforcement |
| Prometheus metrics | Scrape metrics from all Ory services |
| Realtime subscriptions | WebSocket-based change notifications |
| Webhooks | User-defined webhooks with delivery logs |
| Light / dark mode | Full theme support with CSS variable system |

### Self-Hosting (3)

| Feature | Details |
|---------|---------|
| Docker Compose deployment | Full-stack `docker-compose.selfhosted.yml` with Postgres, Kratos, Keto, Hydra, Oathkeeper, MinIO, Valkey, flagd, API, and dashboard |
| Cache / KV (Valkey) | Redis-compatible in-memory cache, sessions, rate-limit counters; keyspace browser + stats in the dashboard, `/api/cache/*` API |
| Single-command setup | `docker compose up` -- auto-bootstraps org, project, and API key on first boot |
| Runtime mode flag | Same codebase for SaaS and self-hosted (`TRUSS_SELF_HOSTED=true` skips billing, quotas, multi-tenant) |

### Security & Trial (3)

| Feature | Details |
|---------|---------|
| 14-day reverse trial | Full Pro plan for 14 days, auto-downgrade to Starter on expiry, no credit card required |
| Disposable email blocking | 121K+ disposable email domains blocked at registration |
| Trial expiry enforcement | Blocks mutations for expired trials across both dashboard API and client API (/v1/*), allows reads |

### Developer Tools (3)

| Feature | Details |
|---------|---------|
| Client API (REST) | Full REST API surface for all platform features |
| Admin SPA | Separate admin dashboard for platform management |
| Audit logging | Cross-module audit trail with filtering (action, search, date range) |

---

## 6. Feature Flags (14 features)

Powered by flagd (CNCF/OpenFeature). Competes with: LaunchDarkly, Unleash, Flagsmith, Flipt, Firebase Remote Config.

### Flag Management (8)

| Feature | Details |
|---------|---------|
| Flag CRUD | Boolean, string, number, and object flag types with full create/read/update/delete |
| ENABLED/DISABLED state toggle | One-click flag state toggle across all environments |
| JsonLogic targeting rules | Attribute, string, and semver operators for fine-grained user targeting |
| Percentage rollouts | Sticky bucketing via deterministic MurmurHash for gradual rollouts |
| Multi-variant A/B/C/n testing | Weighted variant distribution for experimentation |
| Reusable segments | Shared targeting rules via flagd's `$evaluators` mechanism |
| Per-environment configs | Separate flag configurations for dev, staging, and production |
| Environment promotion | Promote flag configs from one environment to another |

### Evaluation & Observability (3)

| Feature | Details |
|---------|---------|
| Live evaluation playground | Test flag evaluation with custom context attributes in real time |
| Evaluation history logging | Full log of flag evaluations with context and results |
| flagd health monitoring | Connection status and health checks for the flagd service |

### Developer Experience (3)

| Feature | Details |
|---------|---------|
| SDK snippets | Code examples for JS, Node, React, Go, Python, and Java |
| Audit trail | All flag changes logged to the cross-module audit_logs table |
| OpenFeature SDK compatibility | Standard OpenFeature SDKs for 15+ languages -- no proprietary SDK needed |

### Architecture

```
Dashboard (React)  -->  Truss API (Express, routes/flags.js)  -->  flagd (evaluation engine)
                        - CRUD flags/segments/envs in Postgres      - Reads flags.flagd.json
                        - On change: sync JSON config to flagd      - JsonLogic targeting
                        - Proxy evaluation requests to flagd        - gRPC + HTTP on port 8013
                        - Audit trail + webhooks on changes         - Metrics on port 8014
                                                                         ^
                                                              OpenFeature SDKs (client apps)
```

### Database Schema

**`truss_internal.feature_flags`**: id, flag_key (unique), name, description, flag_type (boolean/string/number/object), state (ENABLED/DISABLED), variants (JSONB), default_variant, targeting (JSONB, JsonLogic), metadata (JSONB), tags (TEXT[]), tenant_id, created_at, updated_at, created_by.

**`truss_internal.flag_segments`**: id, segment_key (unique), name, description, rules (JSONB, JsonLogic), tenant_id, created_at, updated_at, created_by.

**`truss_internal.flag_environments`**: id, flag_id (FK), environment, state, targeting (JSONB), rollout_pct (0-100), updated_at, updated_by. Unique on (flag_id, environment).

**`truss_internal.flag_evaluation_log`**: id, flag_key, environment, context (JSONB), variant, reason (STATIC/TARGETING_MATCH/DEFAULT/ERROR), duration_ms, evaluated_at, tenant_id.

### flagd Sync Format

On any flag/segment change, the API regenerates a JSON config file (`flags.flagd.json`) containing `$evaluators` (shared segments) and `flags` (with state, variants, defaultVariant, targeting rules). flagd watches this file and auto-reloads on change. Targeting uses JsonLogic with `$ref` to reference shared evaluators, `fractional` for percentage rollouts, and `sem_ver`/`starts_with`/`ends_with` custom operators.

### API Routes (23 endpoints)

**Flags**: GET /api/flags, GET /api/flags/:key, POST /api/flags, PUT /api/flags/:key, DELETE /api/flags/:key, PATCH /api/flags/:key/toggle, PATCH /api/flags/bulk

**Segments**: GET /api/flags/segments, GET /api/flags/segments/:key, POST /api/flags/segments, PUT /api/flags/segments/:key, DELETE /api/flags/segments/:key

**Environments**: GET /api/flags/:key/environments, PUT /api/flags/:key/environments/:env, POST /api/flags/:key/promote

**Evaluation**: POST /api/flags/evaluate, POST /api/flags/evaluate/bulk, GET /api/flags/evaluation-log

**System**: GET /api/flags/status, POST /api/flags/sync, GET /api/flags/activity, GET /api/flags/sdk-snippets

### Comparison: Truss vs Unleash OSS

Feature parity on core (flag types, rollouts, targeting, segments, per-env states, CRUD API). Truss wins on: integrated dashboard (not separate app), OpenFeature standard SDKs (15+ languages, not proprietary), sem_ver targeting (free vs Unleash Enterprise), flag dependencies (free via JsonLogic nesting), OpenTelemetry traces (flagd native), evaluation playground, and unified platform integration (auth/billing/tenants in one).

---

## What's NOT Included (28 features)

These features are impossible with the open-source Ory stack or require external paid services:

### Authentication (2 N/A)

- **SAML SSO** -- Ory Enterprise License only
- **LDAP / Active Directory** -- Not in Kratos OSS

### Authorization (6 N/A)

- **ABAC (attribute conditions)** -- Not in Keto (SpiceDB caveats or Cerbos feature)
- **Consistency tokens** -- SpiceDB only (ZedTokens)
- **Conditional/caveated relationships** -- SpiceDB/OpenFGA only
- **Watch/streaming API** -- Not in Keto
- **LookupResources (computed)** -- Keto List doesn't expand subject sets
- **SQL data filtering from permissions** -- Cerbos/Oso feature

### OAuth2 / OIDC (10 N/A)

- **JWT Bearer Grant (RFC 7523)** -- Not in Hydra
- **Token Exchange (RFC 8693)** -- Not in Hydra
- **CIBA** -- Not in Hydra
- **PAR, RAR, DPoP, mTLS, FAPI** -- Not in Hydra (5 features)

### API Gateway (10 N/A)

- **Rate limiting, load balancing, circuit breaker** -- Not in Oathkeeper (use Traefik/NGINX)
- **mTLS, gRPC, WAF, geo-blocking, SAML** -- Not in Oathkeeper (5 features)

### Buildable but not done (1)

- **SMS OTP** -- Needs Twilio or equivalent paid SMS gateway

---

## Competitive Positioning

### What Truss Has That No Competitor Offers (as a unified package)

1. **Full Ory stack with a UI** -- No one ships Kratos + Keto + Hydra + Oathkeeper with a management dashboard. We are the only one.
2. **Authorization UI on top of Zanzibar** -- Every Zanzibar dashboard (Authzed, Permit.io) is paid. Ours is the first open-source one.
3. **OAuth2 console for Hydra** -- Hydra is intentionally headless. We fill the exact gap.
4. **Database + Auth + AuthZ + Storage in one** -- Supabase has DB + Auth + Storage but no AuthZ and no OAuth2 server. We have everything.
5. **Self-hosted with no cloud dependency** -- Unlike Clerk, Auth0, Permit.io, WorkOS -- everything runs on the user's infra.

### Where We Lose (and should acknowledge it)

| Gap | Who Wins | Our Response |
|-----|----------|-------------|
| SAML SSO | Auth0, Okta, Keycloak | "Enterprise tier" / use Ory Enterprise License |
| Advanced OAuth2 (PAR/DPoP/FAPI) | Keycloak, Auth0, Okta | "Not needed for 95% of apps" |
| Attribute-based conditions on permissions | SpiceDB, OpenFGA, Cerbos | "Use code-level checks for complex ABAC" |
| Managed service (zero ops) | Clerk, Auth0, Supabase | "Self-hosted = full control + no per-MAU pricing" |
| Bot detection / CAPTCHA | Clerk, Auth0 | "Add Cloudflare Turnstile at proxy layer" |

### AuthZ Competitor Deep-Dive

**Authzed (SpiceDB)**: WebAssembly playground (client-side SpiceDB), LSP + VS Code extension, Check Watches (live assertions during editing), Materialize API (sync permissions to customer DB).

**Permit.io**: Embeddable UI Elements (user mgmt, audit logs, approval flows), no-code + code parity (UI actions auto-generate Terraform/Rego), visual relationship graph for ReBAC, GitOps-native.

**Oso Cloud**: 100% decision logging with explain traces, interactive step-through policy debugger, data snapshotting + request replay (time-travel debugging), Polar DSL (purpose-built for authz).

**Auth0 FGA (OpenFGA)**: Open-source core, pre-populated sample stores for learning, multi-region active-active, shareable playground links.

**WorkOS FGA**: Tight integration with WorkOS auth (SSO, SCIM, directory sync), incremental adoption from RBAC to FGA, two-layer JWT + API approach.

Truss matches ~80% of what matters for a self-hosted dashboard. The N/A items are hard Keto limitations that would require switching to SpiceDB.
