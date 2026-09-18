# Truss — Infrastructure Depth Roadmap

## Why this exists

Truss was built as a product — a self-hosted BaaS on top of Postgres.
Companies like Supabase, NeonDB, and PlanetScale build the infrastructure layer
underneath products like Truss. Getting hired at those companies requires
demonstrating that you understand what they actually build, not just what
sits on top of it.

This document tracks infrastructure features to add to Truss that close that gap.
Each one maps directly to something a real database infrastructure company builds.
Build it, understand it deeply, post about it.

---

## Status & strategy (updated 2026-09-18)

**SaaS is dismantled.** Truss will not chase users, the category is owned by
funded incumbents (Aurora/Cloud SQL, Neon, PlanetScale, Supabase) and the blocker
was never features, it was trust + distribution + brand, which a solo project
cannot beat. Truss stays **open-source, as a learning + R&D ground**. The KPI is
**hiring signal (depth per primitive + write-ups), not user count.**

**Parity reality:** we can build credible *learning-grade* versions of most
primitives; we cannot match the *guarantees* (SLA/durability/compliance/scale/
ecosystem). Aim for depth-per-primitive with real numbers and a war story, not
breadth-parity.

**No write/scaling UI.** Editing manifests / a CRD spec to scale is the correct,
skill-signaling interface. A UI over `kubectl` is product-shaped, low-signal work.
The only UI worth building is a **read-only topology/health view** (primary +
replicas, replication lag, last failover, PITR window, pgbouncer pool stats).

**Parked:** the `TrussProject` provisioning operator (revisit later as the operator
skill piece). **Cleanup owed:** the truss app-repo `deploy/` is a stale duplicate of
`shipyard/apps/truss/deploy` , dedupe so we maintain one copy.

---

## Features to build

### 1. Connection pooling — pgbouncer

**What it is:** Instead of application connections going directly to Postgres,
route them through a connection pool. Postgres has a hard limit on concurrent
connections (~100-200 before performance degrades). A pooler multiplexes thousands
of application connections onto a small set of actual Postgres connections.

**What Supabase does:** Ships pgbouncer by default in transaction mode. Every
project gets a pooled connection string alongside the direct one.

**What to build:** Deploy pgbouncer alongside Truss's Postgres. Expose a pooled
connection string to users. Add pool size config per tenant.

**What you'll learn:** Database connection lifecycle, transaction vs session vs
statement pooling modes, why connection exhaustion kills databases under load.

**Interview signal:** "I added pgbouncer to Truss and hit an edge case with
prepared statements in transaction mode — here's how I debugged it."

---

### 2. Read replicas — Postgres streaming replication

**What it is:** Postgres streaming replication sends WAL (Write-Ahead Log) from
a primary to one or more replicas in real time. Replicas are read-only copies.
Read-heavy queries get routed to replicas, writes go to primary.

**What Supabase/NeonDB does:** Every project has a primary + at least one replica.
Read replicas reduce load on primary and enable geographic distribution.

**What to build:** Set up Postgres streaming replication on the homelab. Add a
replica. Route read queries (SELECT) to the replica, write queries to primary.
Expose replica connection string to Truss users.

**What you'll learn:** WAL format, replication slots, replica lag, failover
promotion, the difference between synchronous and asynchronous replication.

**Interview signal:** "I set up streaming replication and measured replica lag
under write load. At 5,000 writes/min lag was 200ms. Here's why."

---

### 3. Realtime subscriptions — Postgres LISTEN/NOTIFY + logical replication

**What it is:** Stream database changes to connected clients in real time.
Two approaches: `LISTEN/NOTIFY` for simple pub/sub, logical replication for
full change data capture (CDC) — every INSERT/UPDATE/DELETE streamed as an event.

**What Supabase does:** Supabase Realtime is a CDC pipeline built on Postgres
logical replication. Clients subscribe to table changes over WebSocket.

**What to build:** Use Postgres logical replication to capture row-level changes.
Stream them over WebSocket to connected Truss clients. Start with LISTEN/NOTIFY
(simpler), then graduate to logical replication (full CDC).

**What you'll learn:** Postgres logical replication protocol, replication slots,
publication/subscription model, WAL decoding, WebSocket at scale.

**Interview signal:** "I built a CDC pipeline on top of Postgres logical
replication. Here's what happens to replication slots when consumers fall behind."

---

### 4. Row-level security enforcement at the Postgres layer

**What it is:** Postgres RLS lets you attach security policies directly to
tables. Instead of enforcing tenant isolation in application middleware, the
database itself rejects queries that cross tenant boundaries — even if the
application has a bug.

**What Supabase does:** Every Supabase project uses RLS. The auth layer sets
a Postgres session variable (`auth.uid()`) and table policies check it. No
application code can bypass it.

**What to build:** Add RLS policies to Truss's multi-tenant tables. Set session
variables on each connection based on the authenticated tenant. Remove equivalent
middleware checks and verify the database enforces isolation itself.

**What you'll learn:** Postgres security model (DAC vs RLS), session variables,
policy expressions, performance implications of RLS on large tables.

**Interview signal:** "I moved Truss's tenant isolation from middleware to
Postgres RLS. Here's the performance difference and why RLS can be surprising
on tables without the right indexes."

---

### 5. Database branching — copy-on-write snapshots

**What it is:** Create an instant copy of a database that diverges independently
from the original. NeonDB does this at the storage layer (true copy-on-write at
the page level). A simpler version uses `pg_dump` + restore or Postgres
`CREATE DATABASE ... TEMPLATE`.

**What NeonDB does:** Branches are instant because they share the same underlying
page storage. Only pages that change after branching are written twice.

**What to build:** Implement branching using `CREATE DATABASE ... TEMPLATE` for
small databases. For larger ones, use logical replication to fork at a specific
LSN (Log Sequence Number). Expose a "branch database" API endpoint in Truss.

**What you'll learn:** Postgres template databases, LSN-based point-in-time
recovery, the difference between logical and physical snapshots, why NeonDB's
storage-layer approach is fundamentally more efficient.

**Interview signal:** "I built basic database branching in Truss. It works for
small databases but hits limits at scale because of [specific reason]. Here's
why NeonDB's storage-layer approach solves that."

---

## Build order

| # | Feature | Status | Effort | Signals |
|---|---|---|---|---|
| 1 | Connection pooling (pgbouncer via CNPG Pooler) | ✅ **DONE 2026-09-18** | , | Supabase, Neon, PlanetScale |
| 2 | HA + automatic failover (CNPG `instances: 3`, streaming replication) | ▶ **NEXT** | 1 weekend | Aurora, Neon, all DB cos |
| 3 | PITR (WAL archiving + point-in-time restore drill) | TODO | 1 weekend | Aurora, all DB cos |
| 4 | Row-level security at the Postgres layer | TODO | 1 weekend | Supabase |
| 5 | Realtime / CDC (LISTEN/NOTIFY → logical replication → WS) | TODO | 2 weekends | Supabase |
| 6 | Scale-to-zero operator (idle-detect + suspend/resume) | TODO | 2 weekends | Neon |
| 7 | Database branching (basic: TEMPLATE / ZFS snapshot) | LATER | 2-3 weekends | Neon |
| , | Read-only topology/health dashboard | OPTIONAL | 1 weekend | observability |

**#1 (pgbouncer) shipped:** CNPG Pooler in transaction mode (20 backends / 1000
client conns); truss-api routed through it; hit and fixed the classic
`ignore_startup_parameters` (statement_timeout) transaction-mode gotcha. Ory stays
on `-rw` direct.

---

## What this does NOT cover

These are out of scope — not because they are unimportant but because they
require years of specialized work and would distract from the core roadmap:

- Storage-compute separation (NeonDB's actual architecture) — requires forking
  Postgres and rewriting the storage layer
- MySQL sharding (PlanetScale/Vitess) — completely different database engine
- WAL-level branching at page granularity — requires Postgres source changes
- Multi-region synchronous replication — operational complexity beyond solo scope

---

## When to build this

**Now (updated 2026-09-18):** the old "gate behind Kiln" rule is retired , we're
actively working the list above on Truss, one primitive at a time, deep, with a
write-up each. Next up is #2 (HA + failover).

Each feature above is 1-3 weekends of work. After Kiln is done, knock these
out one by one, post about each one, and the combination of Kiln (isolation
depth) + Truss (database infrastructure) becomes a genuinely strong portfolio
for Supabase, NeonDB, and similar roles.
