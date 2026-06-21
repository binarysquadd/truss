import express from "express";
import { getPool, getCustomerPool, getActiveDatabaseUrl, QUERY_TIMEOUT_MS, API_PORT, consumptionMetrics } from "../lib/state.js";
import { generateApiKey, apiKeyAuth } from "../lib/api-keys.js";
import { ensureInternalSchema, getSettingsConfig, writeAuditLog } from "../lib/internal.js";
import { maskConnectionString, getConnectionInfo, checkUrlReachable, quoteIdent } from "../lib/helpers.js";
import { kratosAdminRequest } from "../lib/kratos.js";
import { hydraAdminRequest } from "../lib/hydra.js";
import { getS3Client } from "../lib/s3.js";
import { realtimeClients, realtimeChannels, realtimeEventLog, getRealtimeListener, webhookTriggers } from "../lib/realtime.js";
import { KRATOS_PUBLIC_URL, KETO_READ_URL, MINIO_S3_ENDPOINT, HYDRA_PUBLIC_URL, HYDRA_ADMIN_URL, OATHKEEPER_ADMIN_URL, OATHKEEPER_PROXY_URL } from "../lib/state.js";
import { oathkeeperAdminRequest } from "../lib/oathkeeper.js";
import { isConfigured as isCacheConfigured } from "../lib/cache.js";
import { ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import logger from "../lib/logger.js";
import { logSecurityEvent } from "../lib/observability.js";
import { sendApiKeyNotification } from "../lib/email.js";

const log = logger.child({ module: "client-api" });

export const router = express.Router();

// ─── Helpers ───

// RLS passthrough: set JWT claims so Postgres RLS policies can read them.
// IMPORTANT: JWT signature verification MUST happen in the auth middleware (apiKeyAuth)
// BEFORE this function is called. We only decode the payload here to pass claims to
// Postgres session vars. If the request has no verified tenant, we skip setting claims
// entirely to avoid trusting unverified JWTs.
async function applyRlsContext(client, req) {
  // Guard: only set RLS claims when the request has been authenticated (tenant resolved)
  if (!req.tenant && !req.apiKey) return;
  const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (jwt && req.apiKey.keyType === "anon") {
    // Decode payload — signature was already verified by auth middleware upstream
    try {
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(payload)]);
      if (payload.sub) await client.query(`SELECT set_config('request.jwt.sub', $1, true)`, [payload.sub]);
      await client.query(`SET ROLE authenticated`);
    } catch {}
  } else if (req.apiKey.keyType === "service_role") {
    // service_role bypasses RLS — uses a dedicated role (must be created during setup: CREATE ROLE truss_service NOLOGIN; GRANT ... TO truss_service;)
    try { await client.query(`SET LOCAL role = 'truss_service'`); } catch {}
  }
}

function parseFilter(key, value) {
  const ops = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE", is: "IS" };
  const m = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/);
  if (!m) return null;
  const op = ops[m[1]];
  let val = m[2];
  if (m[1] === "is") {
    if (val === "null") val = null;
    else if (val === "true") val = true;
    else if (val === "false") val = false;
    else return null;
    return { sql: `${quoteIdent(key)} IS ${val === null ? "NULL" : val}`, param: null };
  }
  if (m[1] === "like" || m[1] === "ilike") val = val.replace(/\*/g, "%");
  return { sql: `${quoteIdent(key)} ${op}`, param: val };
}

function parseInFilter(key, value) {
  const m = value.match(/^in\.\((.+)\)$/);
  if (!m) return null;
  const items = m[1].split(",").map((s) => s.trim());
  return { key, items };
}

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ─── API Key management endpoints (dashboard) ───

router.get("/api/keys", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getCustomerPool(req).query(
      `select id, key_type, key_prefix, label, created_at, last_used_at, revoked, rate_limit
       from truss_internal.api_keys
       where tenant_id = $1
       order by created_at desc`,
      [tenantId]
    );
    return res.json({ keys: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list API keys." });
  }
});

router.post("/api/keys", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const keyType = req.body?.keyType === "service_role" ? "service_role" : "anon";
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 100) : "";
  const rateLimit = req.body?.rate_limit != null ? Math.max(1, Math.min(100000, parseInt(req.body.rate_limit, 10) || 0)) || null : null;
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    // Reject key creation without a concrete tenant — a null tenant_id would
    // create an orphaned, unscoped key usable across tenant boundaries.
    if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

    // Cap API keys at 20 per tenant
    const keyCount = await getCustomerPool(req).query(
      `SELECT count(*)::int AS count FROM truss_internal.api_keys WHERE tenant_id = $1 AND NOT revoked`,
      [tenantId]
    );
    if (keyCount.rows[0]?.count >= 20) {
      return res.status(400).json({ error: "Maximum of 20 API keys per account. Revoke unused keys first." });
    }

    const { fullKey, prefix, hash } = generateApiKey(keyType);
    const result = await getCustomerPool(req).query(
      `insert into truss_internal.api_keys (key_type, key_prefix, key_hash, label, tenant_id, rate_limit)
       values ($1, $2, $3, $4, $5, $6)
       returning id, key_type, key_prefix, label, created_at, rate_limit`,
      [keyType, prefix, hash, label, tenantId, rateLimit]
    );
    writeAuditLog('dashboard', 'create', 'api_key', result.rows[0].id, { key_type: keyType, label, rate_limit: rateLimit }, tenantId);
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    logSecurityEvent("api_key.created", { label, keyType }, ip, tenantId);
    log.info({ keyId: result.rows[0].id, keyType, label }, "API key created");
    return res.json({ key: result.rows[0], secret: fullKey });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : "unknown" }, "failed to create API key");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create API key." });
  }
});

router.delete("/api/keys/:id", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized." });
    const delResult = await getCustomerPool(req).query(`update truss_internal.api_keys set revoked = true where id = $1 and tenant_id = $2`, [req.params.id, tenantId]);
    if (delResult.rowCount === 0) return res.status(404).json({ error: "Key not found." });
    writeAuditLog('dashboard', 'delete', 'api_key', req.params.id, {}, tenantId);
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    logSecurityEvent("api_key.revoked", { keyId: req.params.id }, ip, tenantId);
    log.info({ keyId: req.params.id }, "API key revoked");
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to revoke API key." });
  }
});

router.patch("/api/keys/:id", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const rawLimit = req.body?.rate_limit;
    // null or 0 means "use plan default"
    const rateLimit = rawLimit != null && rawLimit !== 0 && rawLimit !== ""
      ? Math.max(1, Math.min(100000, parseInt(rawLimit, 10) || 0)) || null
      : null;
    const result = await getCustomerPool(req).query(
      `update truss_internal.api_keys set rate_limit = $1 where id = $2 and tenant_id = $3 returning id, rate_limit`,
      [rateLimit, req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Key not found." });
    writeAuditLog('dashboard', 'update', 'api_key', req.params.id, { rate_limit: rateLimit }, tenantId);
    return res.json({ ok: true, rate_limit: result.rows[0].rate_limit });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update API key." });
  }
});

// ─── Client API: SQL-over-HTTP (/v1/sql) ───

// Blocklist for dangerous SQL operations in /v1/sql
const SQL_BLOCKLIST = /\b(COPY\b|pg_read_file|pg_write_file|pg_read_binary_file|lo_import|lo_export|dblink|dblink_exec|CREATE\s+EXTENSION|ALTER\s+SYSTEM|pg_terminate_backend|pg_cancel_backend)\b/i;

router.post("/v1/sql", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  if (req.apiKey.keyType !== "service_role") {
    return res.status(403).json({ error: "SQL-over-HTTP requires a service_role key." });
  }
  const sql = typeof req.body?.sql === "string" ? req.body.sql.trim() : "";
  if (!sql) return res.status(400).json({ error: "sql is required." });
  // Block dangerous operations
  if (SQL_BLOCKLIST.test(sql)) {
    return res.status(403).json({ error: "Query contains a blocked operation (COPY, pg_read_file, CREATE EXTENSION, ALTER SYSTEM, etc.)." });
  }
  const params = Array.isArray(req.body?.params) ? req.body.params : [];
  const timeout = Math.min(Number(req.body?.timeout) || QUERY_TIMEOUT_MS, 30000);
  const rowLimit = Math.min(Number(req.body?.row_limit) || 10000, 50000);
  // Use a dedicated client (connect/release) instead of pool.query for isolation
  const client = await getCustomerPool(req).connect();
  try {
    // Enforce statement timeout per-query
    await client.query(`SET statement_timeout = '30s'`);
    // Wrap with row limit if not already limited
    const limitedSql = /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${rowLimit}`;
    const result = await client.query({
      text: limitedSql,
      values: params,
      query_timeout: timeout,
    });
    // Resolve OID to type name
    const typeMap = {};
    if (result.fields?.length) {
      const oids = [...new Set(result.fields.map((f) => f.dataTypeID))];
      try {
        const typeResult = await client.query(`SELECT oid, typname FROM pg_type WHERE oid = ANY($1)`, [oids]);
        for (const t of typeResult.rows) typeMap[t.oid] = t.typname;
      } catch {}
    }
    const columns = result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID, typeName: typeMap[f.dataTypeID] || null })) || [];
    return res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      columns,
      command: result.command,
      rowLimitApplied: !/\blimit\b/i.test(sql),
    });
  } catch (error) {
    const pgError = error;
    return res.status(400).json({
      error: pgError.message || "Query failed.",
      code: pgError.code || null,
      detail: pgError.detail || null,
      hint: pgError.hint || null,
      position: pgError.position || null,
    });
  } finally {
    client.release();
  }
});

router.post("/v1/sql/transaction", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  if (req.apiKey.keyType !== "service_role") {
    return res.status(403).json({ error: "Transactions require a service_role key." });
  }
  const statements = Array.isArray(req.body?.statements) ? req.body.statements : [];
  if (statements.length === 0) return res.status(400).json({ error: "statements array is required." });
  if (statements.length > 20) return res.status(400).json({ error: "Maximum 20 statements per transaction." });
  // Blocklist check: reject entire transaction if any statement contains dangerous operations
  for (const stmt of statements) {
    const sql = typeof stmt.sql === "string" ? stmt.sql.trim() : "";
    if (sql && SQL_BLOCKLIST.test(sql)) {
      return res.status(400).json({ error: "Transaction contains a blocked operation (COPY, pg_read_file, CREATE EXTENSION, ALTER SYSTEM, etc.)." });
    }
  }
  const client = await getCustomerPool(req).connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}'`);
    const results = [];
    for (const stmt of statements) {
      const sql = typeof stmt.sql === "string" ? stmt.sql.trim() : "";
      if (!sql) { results.push({ error: "Empty statement skipped." }); continue; }
      const params = Array.isArray(stmt.params) ? stmt.params : [];
      const result = await client.query(sql, params);
      results.push({
        rows: result.rows,
        rowCount: result.rowCount,
        columns: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })) || [],
        command: result.command,
      });
    }
    await client.query("COMMIT");
    return res.json({ results });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const pgError = error;
    return res.status(400).json({
      error: pgError.message || "Transaction failed.",
      code: pgError.code || null,
      detail: pgError.detail || null,
    });
  } finally {
    client.release();
  }
});

// ─── Client API: Auto-REST Data API (/v1/db) — PostgREST-style ───

// GET /v1/db/:table — Select rows
router.get("/v1/db/:table", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const table = req.params.table;
  if (!TABLE_NAME_RE.test(table)) return res.status(400).json({ error: "Invalid table name." });

  const selectCols = req.query.select ? req.query.select.split(",").map((c) => quoteIdent(c.trim())).join(", ") : "*";
  const orderBy = req.query.order
    ? req.query.order.split(",").map((o) => {
        const [col, dir] = o.split(".");
        return `${quoteIdent(col)} ${dir === "desc" ? "DESC" : "ASC"}`;
      }).join(", ")
    : null;
  const limit = Math.min(parseInt(req.query.limit) || 1000, 10000);
  const offset = parseInt(req.query.offset) || 0;

  const conditions = [];
  const params = [];
  let paramIdx = 1;
  for (const [key, value] of Object.entries(req.query)) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const inF = parseInFilter(key, value);
    if (inF) {
      const placeholders = inF.items.map((_, i) => `$${paramIdx + i}`).join(", ");
      conditions.push(`${quoteIdent(key)} IN (${placeholders})`);
      params.push(...inF.items);
      paramIdx += inF.items.length;
      continue;
    }
    const f = parseFilter(key, value);
    if (f) {
      if (f.param === null) {
        conditions.push(f.sql);
      } else {
        conditions.push(`${f.sql} $${paramIdx++}`);
        params.push(f.param);
      }
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause = orderBy ? `ORDER BY ${orderBy}` : "";
  const sql = `SELECT ${selectCols} FROM ${quoteIdent(table)} ${where} ${orderClause} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  try {
    const result = await getCustomerPool(req).query(sql, params);
    res.set("Content-Range", `${offset}-${offset + result.rows.length}/*`);
    return res.json(result.rows);
  } catch (error) {
    return res.status(400).json({ error: error.message, code: error.code || null });
  }
});

// POST /v1/db/:table — Insert row(s)
router.post("/v1/db/:table", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const table = req.params.table;
  if (!TABLE_NAME_RE.test(table)) return res.status(400).json({ error: "Invalid table name." });


  const rows = Array.isArray(req.body) ? req.body : [req.body];
  if (rows.length === 0) return res.status(400).json({ error: "Request body required." });

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return res.status(400).json({ error: "No columns provided." });

  const params = [];
  let paramIdx = 1;
  const valueGroups = rows.map((row) => {
    const placeholders = columns.map((col) => { params.push(row[col] ?? null); return `$${paramIdx++}`; });
    return `(${placeholders.join(", ")})`;
  });

  const colList = columns.map((c) => quoteIdent(c)).join(", ");
  const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${valueGroups.join(", ")} RETURNING *`;

  try {
    const result = await getCustomerPool(req).query(sql, params);
    return res.status(201).json(result.rows);
  } catch (error) {
    return res.status(400).json({ error: error.message, code: error.code || null });
  }
});

// PATCH /v1/db/:table — Update rows matching filters
router.patch("/v1/db/:table", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const table = req.params.table;
  if (!TABLE_NAME_RE.test(table)) return res.status(400).json({ error: "Invalid table name." });


  const updates = req.body;
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Request body with update fields required." });
  }

  const params = [];
  let paramIdx = 1;
  const setClauses = Object.entries(updates).map(([col, val]) => { params.push(val); return `${quoteIdent(col)} = $${paramIdx++}`; });

  const conditions = [];
  for (const [key, value] of Object.entries(req.query)) {
    const f = parseFilter(key, value);
    if (f) {
      if (f.param === null) conditions.push(f.sql);
      else { conditions.push(`${f.sql} $${paramIdx++}`); params.push(f.param); }
    }
    const inF = parseInFilter(key, value);
    if (inF) {
      const placeholders = inF.items.map((_, i) => `$${paramIdx + i}`).join(", ");
      conditions.push(`${quoteIdent(key)} IN (${placeholders})`);
      params.push(...inF.items);
      paramIdx += inF.items.length;
    }
  }

  if (conditions.length === 0) return res.status(400).json({ error: "Filter required for updates (e.g. ?id=eq.123)." });

  const sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(", ")} WHERE ${conditions.join(" AND ")} RETURNING *`;

  try {
    const result = await getCustomerPool(req).query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    return res.status(400).json({ error: error.message, code: error.code || null });
  }
});

// DELETE /v1/db/:table — Delete rows matching filters
router.delete("/v1/db/:table", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const table = req.params.table;
  if (!TABLE_NAME_RE.test(table)) return res.status(400).json({ error: "Invalid table name." });

  const conditions = [];
  const params = [];
  let paramIdx = 1;
  for (const [key, value] of Object.entries(req.query)) {
    const f = parseFilter(key, value);
    if (f) {
      if (f.param === null) conditions.push(f.sql);
      else { conditions.push(`${f.sql} $${paramIdx++}`); params.push(f.param); }
    }
    const inF = parseInFilter(key, value);
    if (inF) {
      const placeholders = inF.items.map((_, i) => `$${paramIdx + i}`).join(", ");
      conditions.push(`${quoteIdent(key)} IN (${placeholders})`);
      params.push(...inF.items);
      paramIdx += inF.items.length;
    }
  }

  if (conditions.length === 0) return res.status(400).json({ error: "Filter required for deletes (e.g. ?id=eq.123)." });

  const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${conditions.join(" AND ")} RETURNING *`;

  try {
    const result = await getCustomerPool(req).query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    return res.status(400).json({ error: error.message, code: error.code || null });
  }
});

// POST /v1/db/rpc/:function — Call a Postgres function
router.post("/v1/db/rpc/:function", apiKeyAuth, async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const funcName = req.params.function;
  if (!TABLE_NAME_RE.test(funcName)) return res.status(400).json({ error: "Invalid function name." });


  const args = req.body || {};
  const keys = Object.keys(args);
  const params = keys.map((k) => args[k]);
  const placeholders = keys.map((k, i) => `${quoteIdent(k)} := $${i + 1}`).join(", ");

  const sql = `SELECT * FROM ${quoteIdent(funcName)}(${placeholders})`;

  const client = await getCustomerPool(req).connect();
  try {
    // Wrap in transaction so SET LOCAL is scoped to this request only
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '15000'");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return res.json(result.rows);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({ error: error.message, code: error.code || null });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGEMENT API — /v1/* endpoints for LLMs, bots, CLI, and external tools
// All management endpoints require service_role key
// ═══════════════════════════════════════════════════════════════════════════════

function requireServiceRole(req, res, next) {
  if (req.apiKey.keyType !== "service_role") {
    return res.status(403).json({ error: "Management API requires a service_role key.", code: "INSUFFICIENT_PERMISSIONS" });
  }
  next();
}

// ─── GET /v1/status — Comprehensive platform overview (GitHub /user equivalent) ───

router.get("/v1/status", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    const config = await getSettingsConfig(tenantId);

    const [dbSizeResult, tableCount, schemaCount, projectCount, keyCount, branchCount, backupCount, webhookCount, realtimeSubs] = await Promise.all([
      pool.query(`SELECT pg_database_size(current_database()) AS size_bytes`),
      pool.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')`),
      pool.query(`SELECT count(*)::int AS count FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')`),
      getPool().query(`SELECT count(*)::int AS count FROM truss_internal.projects WHERE status != 'deleted' AND tenant_id = $1`, [tenantId]),
      getPool().query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE revoked = false)::int AS active FROM truss_internal.api_keys WHERE tenant_id = $1`, [tenantId]),
      getPool().query(`SELECT count(*)::int AS count FROM truss_internal.branches WHERE status = 'active' AND tenant_id = $1`, [tenantId]),
      getPool().query(`SELECT count(*)::int AS count FROM truss_internal.backups WHERE tenant_id = $1`, [tenantId]),
      getPool().query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE active = true)::int AS active FROM truss_internal.webhooks WHERE tenant_id = $1`, [tenantId]),
      getPool().query(`SELECT count(*)::int AS count FROM truss_internal.realtime_subscriptions WHERE active = true AND tenant_id = $1`, [tenantId]),
    ]);

    const dbSizeBytes = Number(dbSizeResult.rows[0]?.size_bytes || 0);

    return res.json({
      platform: {
        name: config.project_name || "Truss",
        version: "1.0.0",
      },
      database: {
        size_bytes: dbSizeBytes,
        size_gb: Number((dbSizeBytes / 1024 ** 3).toFixed(3)),
        table_count: tableCount.rows[0]?.count || 0,
        schema_count: schemaCount.rows[0]?.count || 0,
      },
      plan: {
        key: "self-hosted", name: "Self-hosted",
        limits: { db_size_gb: -1, storage_size_gb: -1, auth_mau: -1 },
      },
      resources: {
        projects: { total: projectCount.rows[0]?.count || 0 },
        api_keys: { total: keyCount.rows[0]?.total || 0, active: keyCount.rows[0]?.active || 0 },
        branches: { active: branchCount.rows[0]?.count || 0 },
        backups: { total: backupCount.rows[0]?.count || 0 },
        webhooks: { total: webhookCount.rows[0]?.total || 0, active: webhookCount.rows[0]?.active || 0 },
        realtime_subscriptions: { active: realtimeSubs.rows[0]?.count || 0 },
      },
      integrations: {
        auth: { configured: Boolean(KRATOS_PUBLIC_URL) },
        authz: { configured: Boolean(KETO_READ_URL) },
        oauth2: { configured: Boolean(HYDRA_PUBLIC_URL || HYDRA_ADMIN_URL) },
        gateway: { configured: Boolean(OATHKEEPER_PROXY_URL || OATHKEEPER_ADMIN_URL) },
        storage: { configured: Boolean(MINIO_S3_ENDPOINT) },
        cache: { configured: isCacheConfigured() },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch status." });
  }
});

// ─── GET /v1/projects — List all projects ───

router.get("/v1/projects", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const status = req.query.status || null;
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    let sql = `SELECT * FROM truss_internal.projects WHERE status != 'deleted' AND tenant_id = $1`;
    const params = [tenantId];
    if (status && ["provisioning", "active", "paused"].includes(status)) { sql += ` AND status = $${params.length + 1}`; params.push(status); }
    sql += ` ORDER BY created_at DESC`;
    const result = await pool.query(sql, params);
    const projects = result.rows.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, region: p.region, db_mode: p.db_mode, status: p.status,
      schema_name: p.schema_name, bucket_name: p.bucket_name, api_url: p.api_url,
      created_at: p.created_at, updated_at: p.updated_at,
    }));
    return res.json({ total_count: projects.length, projects });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list projects." });
  }
});

// ─── GET /v1/projects/:id — Full project detail with everything ───

router.get("/v1/projects/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    const result = await pool.query(`SELECT * FROM truss_internal.projects WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found." });
    const p = result.rows[0];

    const [keys, tables, webhooks] = await Promise.all([
      pool.query(`SELECT id, key_type, key_prefix, label, created_at, last_used_at, revoked FROM truss_internal.api_keys WHERE project_id = $1 ORDER BY created_at DESC`, [p.id]),
      pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`, [p.schema_name]),
      pool.query(`SELECT id, name, table_schema, table_name, events, url, active, fail_count, last_fired_at, created_at FROM truss_internal.webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]),
    ]);

    let bucketInfo = null;
    try {
      const s3 = getS3Client();
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: p.bucket_name, MaxKeys: 1 }));
      bucketInfo = { name: p.bucket_name, exists: true, key_count: listed.KeyCount || 0 };
    } catch { bucketInfo = { name: p.bucket_name, exists: false, key_count: 0 }; }

    return res.json({
      id: p.id, name: p.name, slug: p.slug, region: p.region, db_mode: p.db_mode, status: p.status,
      schema_name: p.schema_name, bucket_name: p.bucket_name, api_url: p.api_url,
      connection_string: p.db_connection_string ? maskConnectionString(p.db_connection_string) : null,
      created_at: p.created_at, updated_at: p.updated_at,
      api_keys: keys.rows,
      tables: tables.rows.map((t) => t.table_name),
      storage: bucketInfo,
      webhooks: { total: webhooks.rows.length, items: webhooks.rows },
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get project." });
  }
});

// ─── PATCH /v1/projects/:id — Update project ───

router.patch("/v1/projects/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const sets = [];
    const vals = [];
    let idx = 1;
    if (typeof req.body?.name === "string") { sets.push(`name = $${idx++}`); vals.push(req.body.name.trim()); }
    if (typeof req.body?.status === "string" && ["active", "paused"].includes(req.body.status)) {
      sets.push(`status = $${idx++}`); vals.push(req.body.status);
    }
    if (sets.length === 0) return res.status(400).json({ error: "No valid fields. Accepted: name, status (active|paused)." });
    sets.push(`updated_at = now()`);
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    vals.push(req.params.id);
    vals.push(tenantId);
    const result = await pool.query(`UPDATE truss_internal.projects SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} AND status != 'deleted' RETURNING *`, vals);
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found." });
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update project." });
  }
});

// ─── GET /v1/keys — List API keys with usage stats ───

router.get("/v1/keys", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const projectId = req.query.project_id || null;
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    let sql = `SELECT id, key_type, key_prefix, label, project_id, created_at, last_used_at, revoked FROM truss_internal.api_keys WHERE tenant_id = $1`;
    const params = [tenantId];
    if (projectId) { sql += ` AND project_id = $${params.length + 1}`; params.push(projectId); }
    sql += ` ORDER BY created_at DESC`;
    const result = await pool.query(sql, params);

    const keys = result.rows.map((k) => {
      const usage = consumptionMetrics.perKey.get(k.id);
      return { ...k, usage: usage ? { queries: usage.queries, bandwidth_bytes: usage.bandwidth, last_seen: usage.lastSeen } : { queries: 0, bandwidth_bytes: 0, last_seen: null } };
    });
    return res.json({ total_count: keys.length, keys });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list keys." });
  }
});

// ─── POST /v1/keys — Create API key ───

router.post("/v1/keys", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const keyType = req.body?.key_type === "service_role" ? "service_role" : "anon";
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 100) : "";
  const projectId = typeof req.body?.project_id === "string" ? req.body.project_id : null;
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;

    // Cap at 20 non-revoked keys per tenant (same as dashboard)
    if (tenantId) {
      const keyCount = await pool.query(
        `SELECT count(*)::int AS cnt FROM truss_internal.api_keys WHERE tenant_id = $1 AND revoked = false`,
        [tenantId]
      );
      if (keyCount.rows[0]?.cnt >= 20) {
        return res.status(400).json({ error: "API key limit reached (20 per tenant). Revoke unused keys first." });
      }
    }

    const { fullKey, prefix, hash } = generateApiKey(keyType);
    const result = await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, key_type, key_prefix, label, project_id, created_at`,
      [keyType, prefix, hash, label, projectId, tenantId]
    );
    writeAuditLog(req.apiKey?.id || 'api', 'create', 'api_key', result.rows[0].id, { key_type: keyType, label, project_id: projectId });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    logSecurityEvent("api_key.created", { label, keyType }, ip, tenantId);
    if (req.tenant?.email) {
      sendApiKeyNotification({ to: req.tenant.email, displayName: req.tenant.displayName, action: "created", keyLabel: label, keyPrefix: prefix }).catch(() => {});
    }
    return res.status(201).json({ key: result.rows[0], secret: fullKey });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create key." });
  }
});

// ─── DELETE /v1/keys/:id — Revoke API key ───

router.delete("/v1/keys/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || req.apiKey?.tenantId || null;
    const result = await pool.query(`UPDATE truss_internal.api_keys SET revoked = true WHERE id = $1 AND tenant_id = $2 RETURNING id, key_type, key_prefix, label, revoked`, [req.params.id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Key not found." });
    writeAuditLog(req.apiKey?.id || 'api', 'delete', 'api_key', req.params.id, { key_type: result.rows[0].key_type });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    logSecurityEvent("api_key.revoked", { keyId: req.params.id }, ip, tenantId);
    if (req.tenant?.email) {
      sendApiKeyNotification({ to: req.tenant.email, displayName: req.tenant.displayName, action: "revoked", keyLabel: result.rows[0].label || "", keyPrefix: result.rows[0].key_prefix || "" }).catch(() => {});
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to revoke key." });
  }
});

// ─── POST /v1/keys/:id/rotate — Rotate API key (revoke old, create new) ───

router.post("/v1/keys/:id/rotate", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    // Scope to the caller's tenant to prevent cross-tenant key takeover.
    const tenantId = req.apiKey?.tenantId || null;
    if (!tenantId) return res.status(401).json({ error: "Unauthorized." });
    const old = await pool.query(`SELECT id, key_type, label, project_id FROM truss_internal.api_keys WHERE id = $1 AND tenant_id = $2 AND revoked = false`, [req.params.id, tenantId]);
    if (old.rows.length === 0) return res.status(404).json({ error: "Key not found or already revoked." });
    const { key_type, label, project_id } = old.rows[0];
    await pool.query(`UPDATE truss_internal.api_keys SET revoked = true WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    const { fullKey, prefix, hash } = generateApiKey(key_type);
    const result = await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, key_type, key_prefix, label, project_id, created_at`,
      [key_type, prefix, hash, label, project_id, tenantId]
    );
    writeAuditLog(req.apiKey?.id || 'api', 'rotate', 'api_key', result.rows[0].id, { old_key_id: req.params.id, key_type: key_type });
    return res.status(201).json({ old_key_id: req.params.id, old_key_revoked: true, new_key: result.rows[0], secret: fullKey });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to rotate key." });
  }
});

// ─── GET /v1/database/schema — Full database schema ───

router.get("/v1/database/schema", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const schemaFilter = req.query.schema || null;
  const filterParams = schemaFilter ? [schemaFilter] : [];
  const filterClause = schemaFilter ? "AND t.table_schema = $1" : "";
  const filterClauseSimple = schemaFilter ? "AND table_schema = $1" : "";
  const filterClausePg = schemaFilter ? "AND schemaname = $1" : "";
  try {
    const [tablesResult, columnsResult, fkResult, pkResult, indexResult, sizeResult] = await Promise.all([
      pool.query(`SELECT t.table_schema, t.table_name,
        (SELECT count(*)::int FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count,
        pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::bigint AS size_bytes,
        (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) AS estimated_rows
        FROM information_schema.tables t WHERE t.table_type = 'BASE TABLE' AND t.table_schema NOT IN ('pg_catalog','information_schema') ${filterClause} ORDER BY t.table_schema, t.table_name`, filterParams),
      pool.query(`SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position, character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ${filterClauseSimple} ORDER BY table_schema, table_name, ordinal_position`, filterParams),
      pool.query(`SELECT tc.table_schema, tc.table_name, kcu.column_name AS source_column, ccu.table_schema AS target_schema, ccu.table_name AS target_table, ccu.column_name AS target_column, tc.constraint_name
        FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema NOT IN ('pg_catalog','information_schema') ${filterClause.replace("t.", "tc.")}`, filterParams),
      pool.query(`SELECT tc.table_schema, tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema NOT IN ('pg_catalog','information_schema') ${filterClause.replace("t.", "tc.")}`, filterParams),
      pool.query(`SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ${filterClausePg}`, filterParams),
      pool.query(`SELECT pg_database_size(current_database()) AS total_bytes`),
    ]);

    const tableMap = new Map();
    for (const t of tablesResult.rows) {
      const key = `${t.table_schema}.${t.table_name}`;
      tableMap.set(key, { schema: t.table_schema, name: t.table_name, column_count: t.column_count, size_bytes: Number(t.size_bytes || 0), estimated_rows: Number(t.estimated_rows || 0), columns: [], primary_keys: [], foreign_keys: [], indexes: [] });
    }
    for (const c of columnsResult.rows) {
      const tbl = tableMap.get(`${c.table_schema}.${c.table_name}`);
      if (tbl) tbl.columns.push({ name: c.column_name, data_type: c.data_type, udt_name: c.udt_name, nullable: c.is_nullable === "YES", default_value: c.column_default, position: c.ordinal_position, max_length: c.character_maximum_length, precision: c.numeric_precision, scale: c.numeric_scale });
    }
    for (const pk of pkResult.rows) {
      const tbl = tableMap.get(`${pk.table_schema}.${pk.table_name}`);
      if (tbl) tbl.primary_keys.push(pk.column_name);
    }
    for (const fk of fkResult.rows) {
      const tbl = tableMap.get(`${fk.table_schema}.${fk.table_name}`);
      if (tbl) tbl.foreign_keys.push({ column: fk.source_column, references_schema: fk.target_schema, references_table: fk.target_table, references_column: fk.target_column, constraint_name: fk.constraint_name });
    }
    for (const idx of indexResult.rows) {
      const tbl = tableMap.get(`${idx.schemaname}.${idx.tablename}`);
      if (tbl) tbl.indexes.push({ name: idx.indexname, definition: idx.indexdef });
    }

    return res.json({ total_size_bytes: Number(sizeResult.rows[0]?.total_bytes || 0), table_count: tablesResult.rows.length, tables: Array.from(tableMap.values()) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch schema." });
  }
});

// ─── GET /v1/database/tables/:schema/:table — Single table detail ───

router.get("/v1/database/tables/:schema/:table", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { schema, table } = req.params;
  try {
    const [cols, idxs, fks, pks, size, triggers, policies, rowEst] = await Promise.all([
      pool.query(`SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position, character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, table]),
      pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`, [schema, table]),
      pool.query(`SELECT kcu.column_name AS source_column, ccu.table_schema AS target_schema, ccu.table_name AS target_table, ccu.column_name AS target_column, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`, [schema, table]),
      pool.query(`SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2`, [schema, table]),
      pool.query(`SELECT pg_total_relation_size(quote_ident($1) || '.' || quote_ident($2))::bigint AS size_bytes`, [schema, table]),
      pool.query(`SELECT trigger_name, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_schema = $1 AND event_object_table = $2`, [schema, table]),
      pool.query(`SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = $1 AND tablename = $2`, [schema, table]),
      pool.query(`SELECT reltuples::bigint AS estimated_rows FROM pg_class WHERE oid = (quote_ident($1) || '.' || quote_ident($2))::regclass`, [schema, table]),
    ]);
    if (cols.rows.length === 0) return res.status(404).json({ error: `Table ${schema}.${table} not found.` });
    return res.json({
      schema, table, size_bytes: Number(size.rows[0]?.size_bytes || 0), estimated_rows: Number(rowEst.rows[0]?.estimated_rows || 0),
      columns: cols.rows.map((c) => ({ name: c.column_name, data_type: c.data_type, udt_name: c.udt_name, nullable: c.is_nullable === "YES", default_value: c.column_default, position: c.ordinal_position, max_length: c.character_maximum_length, is_primary_key: pks.rows.some((pk) => pk.column_name === c.column_name) })),
      primary_keys: pks.rows.map((pk) => pk.column_name),
      foreign_keys: fks.rows.map((fk) => ({ column: fk.source_column, references: `${fk.target_schema}.${fk.target_table}.${fk.target_column}`, constraint_name: fk.constraint_name })),
      indexes: idxs.rows.map((i) => ({ name: i.indexname, definition: i.indexdef })),
      triggers: triggers.rows.map((t) => ({ name: t.trigger_name, timing: t.action_timing, event: t.event_manipulation, statement: t.action_statement })),
      rls_policies: policies.rows.map((p) => ({ name: p.policyname, permissive: p.permissive, roles: p.roles, command: p.cmd, using: p.qual, check: p.with_check })),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch table detail." });
  }
});

// ─── GET /v1/branches — List branches with connection info ───

router.get("/v1/branches", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const branchTenantId = req.apiKey?.tenantId || req.tenant?.id;
    const result = await pool.query(`SELECT id, parent_db, branch_db, label, status, ttl_hours, created_at FROM truss_internal.branches WHERE status = 'active' AND tenant_id = $1 ORDER BY created_at DESC`, [branchTenantId]);
    const branches = [];
    for (const b of result.rows) {
      let sizeBytes = 0;
      try { const s = await pool.query(`SELECT pg_database_size($1) AS bytes`, [b.branch_db]); sizeBytes = Number(s.rows[0]?.bytes || 0); } catch {}
      const dbUrl = getActiveDatabaseUrl();
      branches.push({ ...b, size_bytes: sizeBytes, connection_string: dbUrl ? maskConnectionString(dbUrl.replace(/\/[^/?]+(\?|$)/, `/${b.branch_db}$1`)) : null });
    }
    return res.json({ total_count: branches.length, branches });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list branches." });
  }
});

// ─── GET /v1/backups — List backups ───

router.get("/v1/backups", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const backupTenantId = req.apiKey?.tenantId || req.tenant?.id;
    const result = await pool.query(`SELECT id, filename, size_bytes, status, created_at, completed_at FROM truss_internal.backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`, [backupTenantId]);
    return res.json({ total_count: result.rows.length, backups: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list backups." });
  }
});

// ─── GET /v1/webhooks — List webhooks with delivery stats ───

router.get("/v1/webhooks", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.apiKey?.tenantId || req.tenant?.id;
    const result = await pool.query(`
      SELECT w.*,
        (SELECT count(*)::int FROM truss_internal.webhook_logs wl WHERE wl.webhook_id = w.id) AS total_deliveries,
        (SELECT count(*)::int FROM truss_internal.webhook_logs wl WHERE wl.webhook_id = w.id AND wl.status_code BETWEEN 200 AND 299) AS successful_deliveries,
        (SELECT round(avg(wl.latency_ms))::int FROM truss_internal.webhook_logs wl WHERE wl.webhook_id = w.id) AS avg_latency_ms
      FROM truss_internal.webhooks w WHERE w.tenant_id = $1 ORDER BY w.created_at DESC
    `, [tenantId]);
    return res.json({ total_count: result.rows.length, webhooks: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list webhooks." });
  }
});

// ─── GET /v1/webhooks/:id — Single webhook with recent logs ───

router.get("/v1/webhooks/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const whTenantId = req.apiKey?.tenantId || req.tenant?.id;
    const wh = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [req.params.id, whTenantId]);
    if (wh.rows.length === 0) return res.status(404).json({ error: "Webhook not found." });
    const [stats, logs] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status_code BETWEEN 200 AND 299)::int AS successful, round(avg(latency_ms))::int AS avg_latency_ms FROM truss_internal.webhook_logs WHERE webhook_id = $1`, [req.params.id]),
      pool.query(`SELECT id, event_type, status_code, latency_ms, created_at FROM truss_internal.webhook_logs WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 20`, [req.params.id]),
    ]);
    return res.json({ ...wh.rows[0], delivery_stats: stats.rows[0] || { total: 0, successful: 0, avg_latency_ms: null }, recent_logs: logs.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get webhook." });
  }
});

// ─── GET /v1/realtime — Realtime engine status + subscriptions ───

router.get("/v1/realtime", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const realtimeTenantId = req.apiKey?.tenantId || req.tenant?.id;
    const subs = await pool.query(`SELECT id, schema_name, table_name, active, created_at FROM truss_internal.realtime_subscriptions WHERE active = true AND tenant_id = $1 ORDER BY created_at DESC`, [realtimeTenantId]);
    return res.json({
      listener_connected: Boolean(getRealtimeListener()),
      ws_clients: realtimeClients.size, active_channels: [...realtimeChannels],
      event_log_size: realtimeEventLog.length, recent_events: realtimeEventLog.slice(0, 10),
      subscriptions: subs.rows,
      webhook_triggers: [...webhookTriggers.entries()].map(([id, ch]) => ({ webhook_id: id, channel: ch })),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get realtime status." });
  }
});

// ─── GET /v1/storage/buckets — List buckets with stats ───

router.get("/v1/storage/buckets", apiKeyAuth, requireServiceRole, async (_req, res) => {
  try {
    const s3 = getS3Client();
    const bucketsResp = await s3.send(new ListBucketsCommand({}));
    const buckets = [];
    for (const b of bucketsResp.Buckets || []) {
      let objectCount = 0, totalSize = 0, token;
      do {
        const listed = await s3.send(new ListObjectsV2Command({ Bucket: b.Name, ContinuationToken: token, MaxKeys: 1000 }));
        for (const obj of listed.Contents || []) { objectCount++; totalSize += obj.Size || 0; }
        token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (token);
      buckets.push({ name: b.Name, created_at: b.CreationDate, object_count: objectCount, total_size_bytes: totalSize });
    }
    return res.json({ total_count: buckets.length, buckets });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Storage not configured." });
  }
});

// ─── GET /v1/auth/identities — List identities ───

router.get("/v1/auth/identities", apiKeyAuth, requireServiceRole, async (req, res) => {
  try {
    const pageSize = Math.min(Number(req.query.page_size) || 50, 250);
    const pageToken = req.query.page_token || "";
    let url = `/admin/identities?page_size=${pageSize}`;
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;
    const identities = await kratosAdminRequest(url);
    return res.json({ total_count: Array.isArray(identities) ? identities.length : 0, identities: identities || [] });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Auth service not available." });
  }
});

// ─── GET /v1/auth/identities/:id — Single identity ───

router.get("/v1/auth/identities/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  try {
    const identity = await kratosAdminRequest(`/admin/identities/${req.params.id}?include_credential=oidc`);
    return res.json(identity);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get identity." });
  }
});

// ─── GET /v1/modules — Module configuration ───

router.get("/v1/modules", apiKeyAuth, requireServiceRole, async (_req, res) => {
  // Flat-pack billing: all modules always enabled
  const modules = { database: true, authn: true, authz: true, storage: true, oauth2: true, gateway: true, edge: true, realtime: true, search: true, webhooks: true };
  return res.json({ modules, available: ["database", "authn", "authz", "storage", "edge", "realtime", "search", "webhooks", "oauth2", "gateway"] });
});

// ─── GET /v1/metrics — Live consumption metrics ───

router.get("/v1/metrics", apiKeyAuth, requireServiceRole, (_req, res) => {
  const perKey = [];
  for (const [keyId, data] of consumptionMetrics.perKey) perKey.push({ key_id: keyId, ...data });
  const perEndpoint = [];
  for (const [path, data] of consumptionMetrics.perEndpoint) perEndpoint.push({ path, ...data });
  perEndpoint.sort((a, b) => b.count - a.count);
  return res.json({ total_queries: consumptionMetrics.queries, total_bandwidth_bytes: consumptionMetrics.bandwidth, tracking_since: consumptionMetrics.startedAt, per_key: perKey, per_endpoint: perEndpoint.slice(0, 50) });
});

// ─── GET /v1/audit-logs — Searchable audit logs ───

router.get("/v1/audit-logs", apiKeyAuth, requireServiceRole, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const action = req.query.action || null;
  const resourceType = req.query.resource_type || null;
  const since = req.query.since || null;
  try {
    await ensureInternalSchema();
    const conditions = [];
    const params = [];
    let idx = 1;
    if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
    if (resourceType) { conditions.push(`resource_type = $${idx++}`); params.push(resourceType); }
    if (since) { conditions.push(`created_at >= $${idx++}`); params.push(since); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const result = await pool.query(`SELECT id, actor, action, resource_type, resource_id, payload, created_at FROM truss_internal.audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx}`, params);
    const countParams = params.slice(0, -1);
    const countResult = await pool.query(`SELECT count(*)::int AS total FROM truss_internal.audit_logs ${where}`, countParams);
    return res.json({ total_count: countResult.rows[0]?.total || 0, logs: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch audit logs." });
  }
});

// ─── OAuth2 (Hydra) Management API ───

router.get("/v1/oauth2/clients", apiKeyAuth, requireServiceRole, async (_req, res) => {
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "Hydra is not configured." });
  try {
    const clients = await hydraAdminRequest("/admin/clients");
    return res.json({
      total_count: clients.length,
      clients: clients.map(c => ({
        client_id: c.client_id,
        client_name: c.client_name,
        grant_types: c.grant_types,
        response_types: c.response_types,
        scope: c.scope,
        redirect_uris: c.redirect_uris,
        token_endpoint_auth_method: c.token_endpoint_auth_method,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch OAuth2 clients." });
  }
});

router.post("/v1/oauth2/clients", apiKeyAuth, requireServiceRole, async (req, res) => {
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "Hydra is not configured." });
  try {
    const client = await hydraAdminRequest("/admin/clients", { method: "POST", body: req.body });
    return res.status(201).json(client);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create OAuth2 client." });
  }
});

router.delete("/v1/oauth2/clients/:id", apiKeyAuth, requireServiceRole, async (req, res) => {
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "Hydra is not configured." });
  try {
    await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`, { method: "DELETE" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete OAuth2 client." });
  }
});

router.get("/v1/oauth2/discovery", apiKeyAuth, async (_req, res) => {
  if (!HYDRA_PUBLIC_URL) return res.status(503).json({ error: "Hydra is not configured." });
  try {
    const r = await fetch(`${HYDRA_PUBLIC_URL}/.well-known/openid-configuration`);
    return res.json(await r.json());
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Hydra unreachable." });
  }
});

// ─── Gateway (Oathkeeper) ───

router.get("/v1/gateway/health", apiKeyAuth, async (_req, res) => {
  if (!OATHKEEPER_ADMIN_URL && !OATHKEEPER_PROXY_URL) return res.status(503).json({ error: "Oathkeeper is not configured." });
  try {
    const adminBase = OATHKEEPER_ADMIN_URL || OATHKEEPER_PROXY_URL;
    const r = await fetch(`${adminBase}/health/alive`);
    const data = await r.json();
    return res.json({ health: data, adminConfigured: !!OATHKEEPER_ADMIN_URL, proxyUrl: OATHKEEPER_PROXY_URL || null });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Oathkeeper unreachable." });
  }
});

router.get("/v1/gateway/rules", apiKeyAuth, requireServiceRole, async (_req, res) => {
  try {
    const rules = await oathkeeperAdminRequest("/rules");
    return res.json(Array.isArray(rules) ? rules : []);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch rules." });
  }
});
