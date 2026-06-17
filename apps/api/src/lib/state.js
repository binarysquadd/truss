import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from monorepo root (single source of truth)
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const { Pool } = pg;

export const API_PORT = Number(process.env.API_PORT || 8787);
export const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 10000);
export const MAX_ROWS = Number(process.env.SQL_MAX_ROWS || 200);
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const DEFAULT_DATABASE_URL = DATABASE_URL;
export const KRATOS_PUBLIC_URL = (process.env.KRATOS_PUBLIC_URL || "").trim();
export const KRATOS_ADMIN_URL = (process.env.KRATOS_ADMIN_URL || "").trim();
export const KRATOS_IDENTITY_SCHEMA_ID = (process.env.KRATOS_IDENTITY_SCHEMA_ID || "default").trim();
export const KRATOS_ADMIN_TOKEN = (process.env.KRATOS_ADMIN_TOKEN || "").trim();
export const KRATOS_OIDC_PROVIDERS = (process.env.KRATOS_OIDC_PROVIDERS || "").trim();
export const KETO_READ_URL = (process.env.KETO_READ_URL || "").trim();
export const KETO_WRITE_URL = (process.env.KETO_WRITE_URL || "").trim();
export const KETO_ADMIN_TOKEN = (process.env.KETO_ADMIN_TOKEN || "").trim();
export const HYDRA_PUBLIC_URL = (process.env.HYDRA_PUBLIC_URL || "").trim();
export const HYDRA_ADMIN_URL = (process.env.HYDRA_ADMIN_URL || "").trim();
export const HYDRA_ADMIN_TOKEN = (process.env.HYDRA_ADMIN_TOKEN || "").trim();
export const OATHKEEPER_PROXY_URL = (process.env.OATHKEEPER_PROXY_URL || "").trim();
export const OATHKEEPER_ADMIN_URL = (process.env.OATHKEEPER_ADMIN_URL || "").trim();
export const OATHKEEPER_ADMIN_TOKEN = (process.env.OATHKEEPER_ADMIN_TOKEN || "").trim();
export const MINIO_CONSOLE_URL = (process.env.MINIO_CONSOLE_URL || "").trim();
export const MINIO_S3_ENDPOINT = (process.env.MINIO_S3_ENDPOINT || "").trim();
export const MINIO_ACCESS_KEY = (process.env.MINIO_ACCESS_KEY || "").trim();
export const MINIO_SECRET_KEY = (process.env.MINIO_SECRET_KEY || "").trim();
export const MINIO_REGION = (process.env.MINIO_REGION || "us-east-1").trim();
export const MINIO_FORCE_PATH_STYLE = (process.env.MINIO_FORCE_PATH_STYLE || "true").trim().toLowerCase() !== "false";


export const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "alter", "drop", "truncate", "create",
  "grant", "revoke", "copy", "vacuum", "reindex", "cluster", "refresh",
  "call", "do", "merge",
  "dblink", "dblink_exec", "lo_import", "lo_export",
  "pg_read_file", "pg_write_file", "pg_read_binary_file",
];

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

// ─── Mutable singletons ───

let _pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, query_timeout: QUERY_TIMEOUT_MS, statement_timeout: QUERY_TIMEOUT_MS, max: 20 })
  : null;
let _activeDatabaseUrl = DATABASE_URL;
let _s3Client = null;

export function getPool() { return _pool; }
export function setPool(p) { _pool = p; }
export function getActiveDatabaseUrl() { return _activeDatabaseUrl; }
export function setActiveDatabaseUrl(url) { _activeDatabaseUrl = url; }
export function getS3ClientInstance() { return _s3Client; }
export function setS3ClientInstance(c) { _s3Client = c; }

export function buildPool(connectionString) {
  return new Pool({ connectionString, query_timeout: QUERY_TIMEOUT_MS, statement_timeout: QUERY_TIMEOUT_MS, max: 20 });
}

// Database connection pools — tenant DBs + branch DBs (LRU-bounded)
export const dbPools = new Map();
export const branchPools = dbPools; // backwards compat alias
const MAX_DB_POOLS = Number(process.env.MAX_DB_POOLS || 50);
const VALID_DB_NAME = /^[a-zA-Z0-9_-]+$/;

export function getPoolForDatabase(dbName) {
  // Validate database name to prevent injection
  if (!dbName || !VALID_DB_NAME.test(dbName)) return _pool;

  if (dbPools.has(dbName)) {
    const entry = dbPools.get(dbName);
    entry.lastUsed = Date.now();
    return entry.pool;
  }
  try {
    const url = new URL(_activeDatabaseUrl);
    url.pathname = `/${dbName}`;
    const p = buildPool(url.toString());

    // Evict least recently used pool if at capacity
    if (dbPools.size >= MAX_DB_POOLS) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [key, entry] of dbPools) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const evicted = dbPools.get(oldestKey);
        dbPools.delete(oldestKey);
        evicted.pool.end().catch(() => {});
      }
    }

    dbPools.set(dbName, { pool: p, lastUsed: Date.now() });
    return p;
  } catch {
    return _pool;
  }
}

// ─── Tenant pool helpers ───

/** Get the appropriate pool for customer-facing queries. Falls back to platform pool if tenant hasn't provisioned yet. */
export function getCustomerPool(req) {
  return req.tenantPool || _pool;
}

/** Evict a named database pool from the cache (e.g., on tenant deletion or suspension). */
export function evictPool(dbName) {
  if (dbPools.has(dbName)) {
    const entry = dbPools.get(dbName);
    dbPools.delete(dbName);
    entry.pool.end().catch(() => {});
    return true;
  }
  return false;
}

// ─── Consumption Metrics — in-memory counters ───

export const consumptionMetrics = {
  queries: 0,
  bandwidth: 0,
  perKey: new Map(),
  perEndpoint: new Map(),
  startedAt: new Date().toISOString(),
};
