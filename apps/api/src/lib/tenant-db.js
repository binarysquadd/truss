import { getPool, getPoolForDatabase, evictPool } from "./state.js";
import logger from "./logger.js";

const log = logger.child({ module: "tenant-db" });

// ─── Cache: tenant_id → db_name (60s TTL) ───

const _dbNameCache = new Map(); // Map<tenantId, { dbName, ts }>
const CACHE_TTL_MS = 60_000;

function getCachedDbName(tenantId) {
  const entry = _dbNameCache.get(tenantId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.dbName;
  return null;
}

function setCachedDbName(tenantId, dbName) {
  _dbNameCache.set(tenantId, { dbName, ts: Date.now() });
}

export function clearDbNameCache(tenantId) {
  if (tenantId) _dbNameCache.delete(tenantId);
  else _dbNameCache.clear();
}

// ─── Lookup ───

/** Get the database name for a tenant. Returns null if not provisioned. */
export async function getTenantDbName(tenantId) {
  if (!tenantId) return null;

  const cached = getCachedDbName(tenantId);
  if (cached) return cached;

  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `SELECT db_name FROM truss_internal.tenant_databases WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [tenantId]
    );
    const dbName = rows[0]?.db_name || null;
    if (dbName) setCachedDbName(tenantId, dbName);
    return dbName;
  } catch (err) {
    log.error({ err: err.message, tenantId }, "Failed to look up tenant database");
    return null;
  }
}

/** Get a connection pool for a tenant's database. Returns null if not provisioned. */
export async function getTenantPool(tenantId) {
  const dbName = await getTenantDbName(tenantId);
  if (!dbName) return null;
  return getPoolForDatabase(dbName);
}

// ─── Provisioning ───

/** Generate a short, safe database name from a tenant ID. */
function makeTenantDbName(tenantId) {
  // Use first 12 chars of tenant UUID (hex-safe), prefixed
  const short = tenantId.replace(/-/g, "").slice(0, 12).toLowerCase();
  return `truss_t_${short}`;
}

/** Provision a new database for a tenant. Returns the db_name. */
export async function provisionTenantDatabase(tenantId) {
  const pool = getPool();
  if (!pool) throw new Error("Platform database not available");

  // Check if already provisioned
  const existing = await getTenantDbName(tenantId);
  if (existing) {
    log.info({ tenantId, dbName: existing }, "Tenant database already provisioned");
    return existing;
  }

  const dbName = makeTenantDbName(tenantId);
  log.info({ tenantId, dbName }, "Provisioning tenant database");

  try {
    // CREATE DATABASE cannot run inside a transaction, use simple query
    // The database name is generated from a validated UUID, safe for interpolation
    await pool.query(`CREATE DATABASE "${dbName}"`);
    log.info({ dbName }, "Database created");
  } catch (err) {
    // 42P04 = database already exists — that's fine (idempotent)
    if (err.code === "42P04") {
      log.info({ dbName }, "Database already exists, continuing");
    } else {
      log.error({ err: err.message, dbName }, "Failed to create database");
      throw err;
    }
  }

  // Run baseline setup on the new database
  await runTenantBaseline(dbName);

  // Record in platform DB
  try {
    await pool.query(
      `INSERT INTO truss_internal.tenant_databases (tenant_id, db_name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (db_name) DO UPDATE SET status = 'active', tenant_id = $1`,
      [tenantId, dbName]
    );
  } catch (err) {
    log.error({ err: err.message, tenantId, dbName }, "Failed to record tenant database");
    throw err;
  }

  setCachedDbName(tenantId, dbName);
  log.info({ tenantId, dbName }, "Tenant database provisioned");
  return dbName;
}

/** Run baseline SQL on a fresh tenant database (extensions, config). */
async function runTenantBaseline(dbName) {
  const tenantPool = getPoolForDatabase(dbName);
  if (!tenantPool) throw new Error(`Could not get pool for ${dbName}`);

  try {
    await tenantPool.query(`
      -- Enable commonly-used extensions
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);
    // pgvector may not be available on all installations — try but don't fail
    try {
      await tenantPool.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);
    } catch {
      log.warn({ dbName }, "pgvector extension not available — skipping");
    }
    log.info({ dbName }, "Tenant baseline applied");
  } catch (err) {
    log.error({ err: err.message, dbName }, "Failed to apply tenant baseline");
    throw err;
  }
}

/** Soft-delete a tenant database (mark as deleted, evict pool). */
export async function dropTenantDatabase(tenantId) {
  const pool = getPool();
  if (!pool) return;

  const dbName = await getTenantDbName(tenantId);
  if (!dbName) return;

  log.info({ tenantId, dbName }, "Soft-deleting tenant database");

  // Evict pool from cache
  evictPool(dbName);
  clearDbNameCache(tenantId);

  // Mark as deleted (don't actually DROP — admin can recover)
  await pool.query(
    `UPDATE truss_internal.tenant_databases SET status = 'deleted' WHERE tenant_id = $1`,
    [tenantId]
  );
}

/** List all active tenant databases (for admin). */
export async function listTenantDatabases() {
  const pool = getPool();
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT td.*, t.email, t.display_name, t.plan
     FROM truss_internal.tenant_databases td
     LEFT JOIN truss_internal.tenants t ON t.id = td.tenant_id
     WHERE td.status = 'active'
     ORDER BY td.created_at`
  );
  return rows;
}
