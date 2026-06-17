import express from "express";
import path from "node:path";
import pg from "pg";
import { spawn } from "node:child_process";
import {
  getPool, getCustomerPool, getActiveDatabaseUrl, QUERY_TIMEOUT_MS,
  buildPool, setPool, setActiveDatabaseUrl,
  consumptionMetrics,
} from "../lib/state.js";
import { ensureInternalSchema, measureStorageSizeBytes, measureAuthMau, writeAuditLog } from "../lib/internal.js";
import { maskConnectionString } from "../lib/helpers.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "branches" });

export const router = express.Router();

// ─── Concurrent backup limit ───
const MAX_CONCURRENT_BACKUPS = 2;
let _activeBackups = 0;

// ─── Local helper: switch the global database connection ───

async function switchDatabaseConnection(nextDatabaseUrl) {
  const nextPool = buildPool(nextDatabaseUrl);
  await nextPool.query("select 1");
  const previousPool = getPool();
  setPool(nextPool);
  setActiveDatabaseUrl(nextDatabaseUrl);
  if (previousPool) previousPool.end().catch(() => {});
}

// ─── S4: Database Branching ───

router.get("/api/branches", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(
      `select b.*, pg_database_size(b.branch_db) as size_bytes
       from truss_internal.branches b
       where b.status = 'active' and b.tenant_id = $1
       order by b.created_at desc`,
      [tenantId]
    );
    return res.json({ branches: result.rows });
  } catch (error) {
    // pg_database_size may fail if branch DB doesn't exist; fallback without size
    try {
      const tenantId = req.tenant?.id || null;
      const result = await getPool().query(
        `select * from truss_internal.branches where status = 'active' and tenant_id = $1 order by created_at desc`,
        [tenantId]
      );
      return res.json({ branches: result.rows.map((b) => ({ ...b, size_bytes: 0 })) });
    } catch (err2) {
      return res.status(500).json({ error: err2.message });
    }
  }
});

router.post("/api/branches", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const label = (req.body?.label || "").trim().slice(0, 60) || `branch_${Date.now()}`;
  const ttlHours = parseInt(req.body?.ttlHours) || 0;
  const slug = label.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  const branchDb = `truss_branch_${slug}_${Date.now().toString(36)}`;

  try {
    await ensureInternalSchema();

    const tenantId = req.tenant?.id || null;

    const customerPool = getCustomerPool(req);
    const parentResult = await customerPool.query(`select current_database() as db`);
    const parentDb = parentResult.rows[0].db;

    // Terminate other connections to parent DB so TEMPLATE works
    await customerPool.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [parentDb]
    );

    // CREATE DATABASE ... TEMPLATE requires no other connections — use a fresh client
    const connStr = getActiveDatabaseUrl().replace(/\/[^/?]+(\?|$)/, `/postgres$1`);
    const tempClient = new pg.Client(connStr);
    await tempClient.connect();
    try {
      await tempClient.query(`CREATE DATABASE "${branchDb}" TEMPLATE "${parentDb}"`);
    } finally {
      await tempClient.end();
    }

    // Reconnect pool (it was terminated above)
    await switchDatabaseConnection(getActiveDatabaseUrl());
    await ensureInternalSchema();

    const result = await getPool().query(
      `insert into truss_internal.branches (parent_db, branch_db, label, ttl_hours, tenant_id)
       values ($1, $2, $3, $4, $5) returning *`,
      [parentDb, branchDb, label, ttlHours, tenantId]
    );
    writeAuditLog('dashboard', 'create', 'branch', result.rows[0].id, { label, branch_db: branchDb, parent_db: parentDb }, tenantId);
    trackFeature(tenantId, "branches", "create");
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    // Reconnect pool if it was dropped
    try { await switchDatabaseConnection(getActiveDatabaseUrl()); } catch {}
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/api/branches/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const branchResult = await getPool().query(
      `select * from truss_internal.branches where id = $1 and status = 'active' and tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (branchResult.rows.length === 0) return res.status(404).json({ error: "Branch not found." });
    const branch = branchResult.rows[0];

    // Drop the branch database via postgres db connection
    const connStr = getActiveDatabaseUrl().replace(/\/[^/?]+(\?|$)/, `/postgres$1`);
    const tempClient = new pg.Client(connStr);
    await tempClient.connect();
    try {
      // Terminate connections to the branch DB first
      await tempClient.query(
        `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`,
        [branch.branch_db]
      );
      await tempClient.query(`DROP DATABASE IF EXISTS "${branch.branch_db}"`);
    } finally {
      await tempClient.end();
    }

    await getPool().query(`update truss_internal.branches set status = 'deleted' where id = $1 and tenant_id = $2`, [req.params.id, tenantId]);
    writeAuditLog('dashboard', 'delete', 'branch', req.params.id, { label: branch.label, branch_db: branch.branch_db }, tenantId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/api/branches/:id/connection-string", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(
      `select * from truss_internal.branches where id = $1 and status = 'active' and tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Branch not found." });
    const branch = result.rows[0];
    const connStr = getActiveDatabaseUrl().replace(/\/[^/?]+(\?|$)/, `/${branch.branch_db}$1`);
    const masked = maskConnectionString(connStr);
    // Only reveal full connection string for admin users with ?reveal=true
    if (req.query.reveal === "true" && req.tenant?.isAdmin) {
      return res.json({ connectionString: connStr, maskedConnectionString: masked, branchDb: branch.branch_db });
    }
    return res.json({ connectionString: masked, maskedConnectionString: masked, branchDb: branch.branch_db });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── S5: Backup & Restore ───

router.get("/api/backups", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(
      `select * from truss_internal.backups where tenant_id = $1 order by created_at desc limit 50`,
      [tenantId]
    );
    return res.json({ backups: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/api/backups/snapshot", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  if (_activeBackups >= MAX_CONCURRENT_BACKUPS) {
    return res.status(429).json({ error: `Maximum ${MAX_CONCURRENT_BACKUPS} concurrent backups allowed. Please wait for a running backup to finish.` });
  }
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;

    // Limit backups per tenant: max 10 per day
    if (tenantId) {
      const recentBackups = await getPool().query(
        `SELECT count(*)::int AS cnt FROM truss_internal.backups WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
        [tenantId]
      );
      if (recentBackups.rows[0]?.cnt >= 10) {
        return res.status(429).json({ error: "Backup limit reached (10 per day). Try again tomorrow." });
      }
    }

    const customerPool = getCustomerPool(req);
    const dbResult = await customerPool.query(`select current_database() as db`);
    const dbName = dbResult.rows[0].db;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `truss_backup_${dbName}_${timestamp}.sql`;
    const backupDir = path.resolve("backups");

    // Ensure backup directory exists
    const { mkdir } = await import("node:fs/promises");
    await mkdir(backupDir, { recursive: true });

    const filePath = path.join(backupDir, filename);

    // Insert backup record
    const insertResult = await getPool().query(
      `insert into truss_internal.backups (filename, status, tenant_id) values ($1, 'running', $2) returning *`,
      [filename, tenantId]
    );
    const backupId = insertResult.rows[0].id;

    // Run pg_dump in background (password passed via PGPASSWORD env, never as CLI arg)
    const url = new URL(getActiveDatabaseUrl());
    const dumpArgs = ["-h", url.hostname, "-p", url.port || "5432", "-U", url.username, "-d", dbName, "-F", "p", "-f", filePath];
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    _activeBackups++;
    const child = spawn("pg_dump", dumpArgs, { env });

    child.on("close", async (code) => {
      _activeBackups--;
      try {
        if (code === 0) {
          const { stat } = await import("node:fs/promises");
          const fileInfo = await stat(filePath);
          await getPool().query(
            `update truss_internal.backups set status = 'completed', size_bytes = $1, completed_at = now() where id = $2`,
            [fileInfo.size, backupId]
          );
        } else {
          await getPool().query(`update truss_internal.backups set status = 'failed', completed_at = now() where id = $1`, [backupId]);
        }
      } catch {}
    });

    child.on("error", async () => {
      _activeBackups--;
      try {
        await getPool().query(`update truss_internal.backups set status = 'failed', completed_at = now() where id = $1`, [backupId]);
      } catch {}
    });

    return res.status(202).json({ backup: insertResult.rows[0], message: "Backup started." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/api/backups/:id/restore", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(
      `select * from truss_internal.backups where id = $1 and status = 'completed' and tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Backup not found or not completed." });
    const backup = result.rows[0];
    const backupDir = path.resolve("backups");
    const filePath = path.join(backupDir, backup.filename);

    const url = new URL(getActiveDatabaseUrl());
    const customerPool = getCustomerPool(req);
    const dbResult = await customerPool.query(`select current_database() as db`);
    const dbName = dbResult.rows[0].db;
    const restoreArgs = ["-h", url.hostname, "-p", url.port || "5432", "-U", url.username, "-d", dbName, "-f", filePath];
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const child = spawn("psql", restoreArgs, { env });

    child.on("close", (code) => {
      // Restore is fire-and-forget from the spawn perspective
      log.info({ filename: backup.filename, exitCode: code }, "Backup restore finished");
    });

    return res.status(202).json({ message: "Restore started.", backup });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/api/backups/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(`select * from truss_internal.backups where id = $1 and tenant_id = $2`, [req.params.id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Backup not found." });

    // Try to delete the file
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(path.join(path.resolve("backups"), result.rows[0].filename));
    } catch {}

    await getPool().query(`delete from truss_internal.backups where id = $1 and tenant_id = $2`, [req.params.id, tenantId]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── S6: Connection Pool Stats ───

router.get("/api/pool/stats", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const customerPool = getCustomerPool(req);
    const pgPoolStats = {
      totalCount: customerPool.totalCount,
      idleCount: customerPool.idleCount,
      waitingCount: customerPool.waitingCount,
    };

    // Try to get pg_stat_activity stats
    const activityResult = await customerPool.query(`
      select
        count(*) filter (where state = 'active') as active_connections,
        count(*) filter (where state = 'idle') as idle_connections,
        count(*) filter (where state = 'idle in transaction') as idle_in_transaction,
        count(*) as total_connections,
        (select setting::int from pg_settings where name = 'max_connections') as max_connections
      from pg_stat_activity
      where datname = current_database()
    `);

    return res.json({
      nodePool: pgPoolStats,
      postgres: activityResult.rows[0] || {},
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── S7: Consumption Metrics API ───

const _consumptionCache = new Map(); // keyed by tenantId
router.get("/api/consumption", async (req, res) => {
  const tenantId = req.tenant?.id || null;
  const cached = _consumptionCache.get(tenantId);
  if (cached && Date.now() - cached.ts < 60000) return res.json(cached.data);
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const customerPool = getCustomerPool(req);

    const [dbSize, storageSize, authMau, queryStats, branchCount] = await Promise.all([
      customerPool.query(`select pg_database_size(current_database()) as bytes`),
      measureStorageSizeBytes(),
      measureAuthMau(),
      customerPool.query(`
        select sum(calls) as total_queries, sum(rows) as total_rows
        from pg_stat_statements
      `).catch(() => ({ rows: [{ total_queries: null, total_rows: null }] })),
      getPool().query(`select count(*) as count from truss_internal.branches where status = 'active' and tenant_id = $1`, [tenantId]),
    ]);

    const tableCountResult = await customerPool.query(`
      select count(*) as count from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema', 'truss_internal')
    `);

    const data = {
      period: "current",
      db_size_bytes: Number(dbSize.rows[0]?.bytes || 0),
      storage_size_bytes: storageSize,
      auth_mau: authMau,
      total_queries: Number(queryStats.rows[0]?.total_queries || 0),
      total_rows_processed: Number(queryStats.rows[0]?.total_rows || 0),
      table_count: Number(tableCountResult.rows[0]?.count || 0),
      active_branches: Number(branchCount.rows[0]?.count || 0),
    };
    _consumptionCache.set(tenantId, { ts: Date.now(), data });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/api/consumption/history", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const result = await getPool().query(
      `select * from truss_internal.usage_snapshots
       where captured_at > now() - interval '1 day' * $1 and tenant_id = $2
       order by captured_at asc`,
      [days, tenantId]
    );
    return res.json({ snapshots: result.rows, days });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/consumption/live — real-time API consumption metrics (in-memory counters)
// Scoped per-tenant: only return perKey entries for keys belonging to the requesting tenant.
router.get("/api/consumption/live", async (req, res) => {
  const tenantId = req.tenant?.id || null;

  // Determine which API key IDs belong to this tenant
  let tenantKeyIds = null;
  if (tenantId && getPool()) {
    try {
      const { rows } = await getPool().query(
        `SELECT id FROM truss_internal.api_keys WHERE tenant_id = $1 AND revoked = false`,
        [tenantId]
      );
      tenantKeyIds = new Set(rows.map((r) => r.id));
    } catch { /* fall through — return all keys if lookup fails */ }
  }

  let tenantQueries = 0;
  let tenantBandwidth = 0;
  const perKey = [];
  for (const [keyId, m] of consumptionMetrics.perKey) {
    if (tenantKeyIds && !tenantKeyIds.has(keyId)) continue;
    perKey.push({ keyId, ...m });
    tenantQueries += m.count || 0;
    tenantBandwidth += m.bandwidth || 0;
  }

  const perEndpoint = [];
  for (const [path, m] of consumptionMetrics.perEndpoint) {
    perEndpoint.push({ path, ...m });
  }
  perEndpoint.sort((a, b) => b.count - a.count);

  return res.json({
    totalQueries: tenantKeyIds ? tenantQueries : consumptionMetrics.queries,
    totalBandwidth: tenantKeyIds ? tenantBandwidth : consumptionMetrics.bandwidth,
    startedAt: consumptionMetrics.startedAt,
    perKey,
    topEndpoints: perEndpoint.slice(0, 20),
  });
});
