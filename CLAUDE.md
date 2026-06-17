# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Truss?

Truss is an open-source BaaS (Backend-as-a-Service) console for self-hosters. It provides a unified dashboard for Postgres (SQL workbench with Monaco editor), Ory Kratos (auth/identity), Ory Keto (authorization/RBAC), and MinIO (S3-compatible storage). Features include pgvector, full-text search, webhooks, realtime subscriptions, database branching, backups/PITR, and a client API surface.

## Commands

```bash
npm run dev          # Start dashboard (Vite :5173) + API (Express :8787)
npm run dev:dashboard # Dashboard only
npm run dev:api      # API only (node --watch)
npm run build        # Build the dashboard

# Database migrations (node-pg-migrate, CJS files in apps/api/db/migrations/)
npm run migrate:create -- <name>
npm run migrate:up
npm run migrate:down
npm run migrate:redo
```

## Monorepo Structure

npm workspaces monorepo. Each app is independently deployable:

```
apps/
  dashboard/   — @truss/dashboard (React + Vite, port 5173) — the console UI
  docs/        — @truss/docs (Astro Starlight, port 5175) — documentation
  api/         — @truss/api (Express + Node.js, port 8787) — the backend (Docker)
```

The dashboard is a static SPA (`VITE_API_BASE_URL` points it at the API). The API serves
JSON only. Both ship as Docker images (see `selfhosted/` + the umbrella Helm chart).

Cloud-only surfaces (the admin UI, the marketing/pricing site, billing) live in the private
**truss-cloud** repo, not here. Cloud-only dashboard features are gated behind `IS_PLATFORM`
(`VITE_IS_PLATFORM`), default off.

## Architecture

**Dashboard** — keep files few and focused:

- `apps/dashboard/src/App.tsx` (~4700 lines) — Main app: state, callbacks, effects, layout shell, nav, Home/SQL panels
- `apps/dashboard/src/DatabasePanel.tsx` (~3600 lines) — Database module rendering (all database sub-views including pgvector)
- `apps/dashboard/src/ModulePanels.tsx` (~4600 lines) — Auth, AuthZ, Storage, Realtime, Edge, Search, Webhooks, Billing, Settings panels
- `apps/dashboard/src/types.tsx` (~750 lines) — All type definitions, constants, utility functions
- `apps/dashboard/src/editorConfig.ts` — Monaco theme definitions (truss-dark/truss-light) and shared editor options
- `apps/dashboard/src/overrides.css` — CSS overrides loaded outside Tailwind's @layer system (cursor, selection fixes)

**API** — modular Express backend:

- `apps/api/src/index.js` — Entry point: Express setup, middleware, route mounting, WebSocket, startup
- `apps/api/src/lib/` — Shared modules (state, helpers, billing, s3, kratos, realtime, etc.)
- `apps/api/src/routes/` — 15 route files (sql, client-api, auth, storage, billing, etc.)
- `apps/api/db/migrations/` — CJS migration files for `truss_internal` schema

**Panel extraction pattern**: Panel files export render functions (e.g. `renderDatabaseMain(s)`) that receive a state bag `_s` containing all App component state variables and callbacks. The `_s` object is built in App.tsx and passed to panel functions in `renderMainPanel()` and `renderPaneB()`.

The dashboard is a single-page app. Navigation uses a `PrimaryNav` type: `"home" | "database" | "sql" | "authn" | "authz" | "storage" | "edge" | "realtime" | "search" | "webhooks" | "billing" | "settings"`. There is no router library — navigation state is managed via React useState.

The backend API runs on port 8787. Vite proxies `/api` requests to the backend during development.

## Tech Stack

- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Monaco Editor + ReactFlow (ERD)
- Backend: Node.js + Express 5 + pg (no TypeScript, plain JS)
- Icons: @phosphor-icons/react (deprecation hints on all icons are pre-existing — ignore them)
- ESLint covers only `**/*.{ts,tsx}` — the server JS is not linted

## Internal Schema

Truss auto-provisions a `truss_internal` schema with tables: `saved_queries`, `audit_logs`, `billing_config` (key-value settings store), `usage_snapshots`, `api_keys`, `branches`, `backups`, `realtime_subscriptions`, `webhooks`, `webhook_logs`. Settings are stored as key-value pairs in `billing_config` via `getSettingsConfig()` / `upsertSettingsKey(key, value)` helpers.

## CSS Architecture

- `apps/dashboard/src/index.css` — Tailwind v4 `@import "tailwindcss"` + app theme vars + light-mode overrides
- `apps/dashboard/src/overrides.css` — Imported separately in `main.tsx` AFTER `index.css` to stay outside Tailwind's `@layer` system
- Tailwind v4 wraps all CSS in the same file into `@layer` — even `!important` rules inside layers lose to higher-priority layers
- To override Tailwind reliably: put CSS in a separate file imported independently

## Color System

The app uses a **centralized accent palette** defined in `apps/dashboard/src/index.css` via Tailwind v4 `@theme`. The single source of truth is the `--color-accent-*` scale (50–950) anchored on deep wine `#9f1239` from the landing page. Changing the palette means editing ~11 hex values in index.css + 4 constants in `apps/dashboard/src/editorConfig.ts`.

**Color roles** — never mix these up:
- **Accent (`accent-*`)**: Brand color. Buttons, focus rings, active states, interactive selections, links, highlights
- **Emerald (`emerald-*`)**: Success/health/status. Green is always green — never replace with accent. Used for: connected status, active badges, health dots, toggle on-state, progress bars, verified indicators, CheckCircle icons, HTTP 2xx
- **Red/Danger (`red-*`)**: Errors, destructive actions, warnings. True red (`#ef4444`+) — visually distinct from the wine accent. Used for: delete buttons, error messages, danger confirmations
- **Amber (`amber-*`)**: Caution/pending states. Used for: pending badges, warnings, anon key highlights

## Typography & Readability Standards

**CRITICAL: These minimums are enforced across ALL Truss surfaces (landing page, dashboard, admin, docs). Based on WCAG 2.1, Apple HIG, and Material Design guidelines.**

### Font Size Minimums
- **Body text / paragraphs**: minimum 15px, recommended 16–18px
- **Card descriptions**: minimum 14px
- **List items (features, specs, pricing)**: minimum 14px
- **FAQ answers**: minimum 15px
- **Navigation links**: minimum 14px
- **Labels / captions**: minimum 12px
- **Monospace labels (uppercase)**: minimum 10px

### Color Contrast (WCAG AA = 4.5:1 minimum)

| Token | Hex | Contrast on cream (#faf9f6) | Use |
|-------|-----|----------------------------|-----|
| `--ink` | `#1a1a1a` | ~17.5:1 | Headings, primary text |
| `--ink2` | `#374151` | ~10:1 | Body text, descriptions, list items |
| `--ink3` | `#6b7280` | ~5.5:1 | Muted labels, metadata only |

**Never use `--ink3` below 12px font size.** Never add CSS `opacity` to text colors — use a dedicated hex value instead. Example: `opacity: .7` on `#888` = effective `#bbb` = 2.5:1 contrast = **unreadable**.

### Font Weight by Size
- **16px+**: weight 400 (regular) is fine
- **14–15px**: weight 450 minimum (prevents "wispy" text)
- **12–13px**: weight 500 minimum

### Disabled/Missing/Inactive States
Never reduce opacity on text. Instead use a dedicated muted color (`#9ca3af` for missing items, `#6b7280` for disabled) that still meets ~3.5:1 minimum contrast. Pair with visual indicators (strikethrough, italic, hollow dots) — not opacity.

### Line Height
- Body text: 1.5 minimum, 1.65–1.75 recommended
- List items: 1.5 minimum, 1.6 recommended
- Headings: 1.1–1.2

## Light Mode / Dark Mode Design Language

The app writes **dark-first Tailwind classes** (e.g., `bg-slate-900`, `text-slate-100`, `border-slate-800`) and remaps them to light equivalents via `:root[data-theme="light"]` CSS overrides in `src/index.css`. Theme is toggled via `data-theme` attribute on `<html>`.

**CRITICAL: When adding ANY new UI component, you MUST ensure light-mode compatibility:**

1. **Every dark background class needs a light override.** If you use `bg-slate-950`, `bg-slate-900`, `bg-slate-900/40`, `bg-red-950/20`, `bg-amber-950/30`, etc. — check that `src/index.css` has a corresponding `:root[data-theme="light"] .bg-*` rule. If not, add one.
2. **Every dark border class needs a light override.** `border-slate-800`, `border-slate-700`, `border-red-900/50`, `border-accent-600/40` etc. all need light counterparts.
3. **Every light-on-dark text class needs a light override.** `text-slate-100` through `text-slate-400` are light text on dark bg — they must be remapped to dark text on light bg. Same for colored text like `text-red-300`, `text-amber-300/80`, `text-cyan-400`.
4. **Hover states need overrides too.** `hover:bg-slate-800`, `hover:bg-red-950/30`, `hover:bg-slate-800/30` etc.
5. **Modal backdrops** (`bg-slate-950/90`, `bg-slate-950/80`) should be semi-transparent in light mode too — use `rgba(15, 23, 42, 0.5)`.

**Light-mode override color mapping cheat sheet:**
- Dark panels (`bg-slate-950/*`, `bg-slate-900/*`) → `#ffffff` (white)
- Mid panels (`bg-slate-800/*`) → `#e2e8f0` (slate-200)
- Hover on panels → `#f1f5f9` (slate-100)
- Dark borders (`border-slate-800`, `border-slate-700`) → `#cbd5e1` (slate-300)
- Headings (`text-slate-100`, `-200`) → `#0f172a` (slate-900) + font-weight 600
- Body text (`text-slate-300`) → `#1e293b` (slate-800) + font-weight 500
- Muted text (`text-slate-400`) → `#475569` (slate-600)
- Labels (`text-slate-500`) → `#64748b` (slate-500)
- Red backgrounds (`bg-red-950/*`) → `#fef2f2` (red-50)
- Amber backgrounds (`bg-amber-950/*`) → `#fffbeb` (amber-50)
- Accent backgrounds (`bg-accent-*/5–15`) → `#fff1f2` (accent-50)
- Emerald backgrounds (`bg-emerald-*/5–20`) → `#ecfdf5` (emerald-50)
- Inputs/selects → `color: #0f172a`

## Monaco Editor

Both themes defined in `apps/dashboard/src/editorConfig.ts` — `truss-dark` and `truss-light`. The `editorTheme` value is computed in App.tsx based on `themeMode` and passed through the state bag. Never put Monaco color overrides with `!important` in CSS — let the theme definitions handle colors.

## Environment

Requires `.env` (copy from `.env.example`). Key vars: `DATABASE_URL`, `KRATOS_*` (auth), `KETO_*` (authz), `MINIO_*` (storage). The SQL workbench is read-only by default (SELECT/WITH/EXPLAIN only — mutations are blocked server-side).

## Icon Design Language

All icons use `@phosphor-icons/react` with these rules:

- **Weight**: Always `weight="regular"` — no duotone, no fill, no bold
- **Size**: `18` for nav buttons (Pane A, Pane B, settings, billing), inline content icons can be smaller (13-15) where appropriate
- **No wrappers**: Icons render bare — no background circles, no tinted containers
- **No colors on icons**: Icons inherit text color from their parent button/container. Never add accent colors (`text-emerald-400`, etc.) to nav icons. Exception: status indicators in content panels (e.g. integration health cards) may use color
- **No duplicates**: Every nav item must have a unique icon. Check existing mappings before adding new ones

## Naming Standard — Domain vs Technical Names

The app wraps multiple open-source tools (Ory Kratos, Ory Keto, Ory Hydra, MinIO, pgvector, etc.). User-facing labels must use **domain names** (what the feature does), not **technical names** (what tool powers it). Technical names are reserved for developer/admin contexts.

| Context | Rule | Examples |
|---------|------|---------|
| **Landing page** (`www/`) | Domain names only. Sell the capability. | "Authentication", "Fine-Grained Permissions", "OAuth2 / OIDC", "S3 Storage" |
| **Nav labels & breadcrumbs** | Short domain labels, 1-2 words | "Authentication", "Authorization", "OAuth2", "Storage" |
| **Home page health indicators** | Domain name | "Auth", "Permissions", "OAuth2", "Storage", "Database" |
| **Panel titles** | Domain name as primary heading | "OAuth2 / OpenID Connect", "Authorization Overview" |
| **Panel status/subtitle** | Technical name OK as secondary detail | "Powered by Ory Keto", "Provider: Ory Kratos" |
| **SDK snippets & docs** | Technical names required — devs need them | "Ory Kratos", "Ory Keto", "MinIO S3 SDK" |
| **Settings/config panels** | Technical names OK — admin context | "File Storage (MinIO)", "SMTP (used by Ory Kratos)" |
| **Server errors/API** | Technical names OK — debugging context | "KETO_READ_URL not configured" |
| **Code internals** | Technical shorthand, no restrictions | `kratos`, `keto`, `hydra`, `minio` |

**Service mapping:**
- Ory Kratos → "Authentication" / "Auth"
- Ory Keto → "Authorization" / "Permissions"
- Ory Hydra → "OAuth2" / "OAuth2 / OIDC"
- Ory Oathkeeper → "API Gateway"
- MinIO → "Storage"
- PostgreSQL → "Database"
- pgvector → "Vectors" (sub-view of Database)
- pg_cron → "Cron Jobs" (sub-view of Database)
- flagd → "Feature Flags"

**Never use "Zanzibar" in user-facing UI.** Use "relation-based access control (ReBAC)" or "fine-grained permissions" instead. "Zanzibar" is an internal model name, not a feature name users understand.

## Coding Conventions

- Keep the dashboard split to these files (App.tsx, DatabasePanel.tsx, ModulePanels.tsx, types.tsx, editorConfig.ts) — don't create more unless necessary
- Shared config between panel files goes in standalone files (editorConfig.ts, types.tsx) — never import from App.tsx in panel files (circular dependency)
- All backend code goes in `apps/api/src/` (lib/ for shared modules, routes/ for Express routers)
- Keep solutions minimal and ship fast (indie hacker style)
- Pre-existing lint warnings about unused `loadSavedQueries`, `saveSavedQueries`, `isSavedQueriesLoading` can be ignored
- Auto-load data in render: use `setTimeout(() => loadX(), 0)` + a dedicated `xxxLoaded` boolean flag to prevent infinite re-fetch loops

## Security — Dependency Management

Run `npm audit` before every release. Fix all high/critical before shipping. Accepted known risks are documented below.

### Rules for adding new dependencies

- Check `npm audit` immediately after `npm install <pkg>` — don't let new vulns accumulate
- Prefer packages with active maintenance (recent commits, quick CVE response time)
- Avoid packages that bundle their own copies of security-sensitive libs (DOMPurify, xml parsers) — you can't override bundled deps via npm `overrides`
- Never pin to an old major version just because it "works" — unpinned vulns compound over time

### Known accepted risks (cannot fix without breaking changes)

| Package | Via | Severity | Why unfixable | Action |
|---------|-----|----------|---------------|--------|
| `dompurify` | `monaco-editor` → `@monaco-editor/react` | Moderate | `monaco-editor` pins `dompurify@3.2.7` exactly; npm `overrides` in workspace root cannot override a pinned transitive dep | Wait for `monaco-editor` to bump its pinned dompurify past 3.3.3 |

### Packages to keep updated (were vulnerable, now fixed)

- `nodemailer` — upgrade from 6.x to 8.x resolved DoS, SMTP injection, and domain confusion CVEs. Our `createTransport`/`sendMail` API usage is unchanged between versions.
- `vite` — path traversal and file read CVEs; always keep on latest minor
- `astro` / `@astrojs/starlight` — upgraded from astro 5→6, starlight 0.33→0.39 (May 2026). Required adding `docsLoader()` in `src/content.config.ts` for the new Content Layer API. Also keep on latest minor within current major.
- `dompurify` (direct usage) — multiple XSS/prototype pollution CVEs; always keep on latest
- `path-to-regexp` — ReDoS via sequential optional groups; used by Express 5 internally
- `picomatch` — ReDoS via extglob quantifiers; used by vite/rollup file watching
