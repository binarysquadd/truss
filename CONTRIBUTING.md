# Contributing to Truss

Hey -- thanks for being here. 👋

Truss is the open-source, self-hostable backend console: Postgres, auth, fine-grained
authz, OAuth2, and S3-style storage behind one dashboard you actually own. If you've ever
wanted a Supabase-shaped backend without renting someone else's control plane, you're in
the right repo. Issues, fixes, docs, and "this confused me" reports are all genuinely welcome
-- you don't need to be a maintainer or a Postgres wizard to help.

> **Where the money stuff went:** the hosted, multi-tenant service ("Truss Cloud" --
> billing, metering, provisioning) is a separate private layer. This repo is the
> single-instance core. So if you're looking for billing code here: there isn't any,
> on purpose. Keep it that way. 🙂

## The lay of the land (npm workspaces monorepo)

```
apps/
  dashboard/  @truss/dashboard — React + Vite console (the UI)
  api/        @truss/api       — Express + Node backend (plain JS, no TypeScript)
  docs/       @truss/docs      — Astro Starlight documentation
charts/truss/ — umbrella Helm chart (the whole stack, one install)
```

## Get it running (a few minutes)

```bash
git clone https://github.com/binarysquadd/truss && cd truss
cp .env.example .env      # DATABASE_URL, KRATOS_*, KETO_*, MINIO_* — see the README
make dev                  # api :8787 + dashboard :5173 + docs
```

You need Postgres + Ory Kratos/Keto/Hydra + MinIO reachable. Don't hand-wire those --
`docker compose -f docker-compose.selfhosted.yml up` (or the Helm chart) brings the whole
cast up for you. See the README's quickstart.

## House rules (so PRs land smoothly)

- **Dashboard**: keep it to the existing handful of files (`App.tsx`, `DatabasePanel.tsx`,
  `ModulePanels.tsx`, `types.tsx`, `editorConfig.ts`). New file? Make sure it earns its place.
  Shared config lives in `types.tsx` / `editorConfig.ts` -- never import from `App.tsx` (hello,
  circular dependency).
- **API**: backend code under `apps/api/src/` -- `lib/` for shared modules, `routes/` for routers.
  Plain JS, no TypeScript.
- **Keep the core a core.** No billing, plans, metering, or multi-tenant orchestration in this
  repo -- that's Truss Cloud's job. The core stays capped to one org / environment / project
  (gated by `TRUSS_MULTI_TENANT`). Please don't quietly lift that. 🙏
- **Security defaults are load-bearing.** The SQL workbench is read-only by default, CORS fails
  closed, admin routes are gated -- don't loosen these to make a demo easier.
- Run `npm run check` (build + tests) before you open a PR. ESLint covers `**/*.{ts,tsx}`;
  the server JS isn't linted, so be tidy by hand.

## Opening a PR

- Branch from `main`, keep it focused, and tell us **what** changed and **how you tested it**
  (a screenshot or a curl is worth a thousand "should work"s).
- Small and clear beats big and clever. We'd rather review three tidy PRs than one heroic one.
- By contributing, you agree your work is licensed under the repo's **AGPL-3.0** license.

## Cutting a release

Maintainers: see [RELEASING.md](RELEASING.md) (bump `VERSION` + `Chart.yaml`, tag `vX.Y.Z`,
push the tag -- CI builds the images, publishes the Helm chart, and drafts the release).

## Found a vulnerability?

Please **don't** open a public issue -- see [SECURITY.md](SECURITY.md) for how to report it
privately. We appreciate you. 💛
