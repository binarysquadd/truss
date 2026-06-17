import { getPool, FORBIDDEN_KEYWORDS } from "./state.js";

// ─── Connection helpers ───

export function maskConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "invalid DATABASE_URL";
  }
}

export function fingerprintConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    const protocol = url.protocol.replace(":", "");
    const user = decodeURIComponent(url.username || "");
    const host = url.hostname || "";
    const port = url.port || "5432";
    const database = url.pathname.replace(/^\/+/, "") || "postgres";
    const sslmode = url.searchParams.get("sslmode") || "";
    const sslPart = sslmode ? `?sslmode=${sslmode}` : "";
    return `${protocol}://${user}@${host}:${port}/${database}${sslPart}`;
  } catch {
    return "invalid";
  }
}

export async function getConnectionInfo() {
  const pool = getPool();
  if (!pool) return null;
  const info = await pool.query(`
    select
      current_database() as database_name,
      current_user as db_user,
      inet_server_addr() as server_addr,
      inet_server_port() as server_port,
      version() as pg_version,
      pg_postmaster_start_time() as started_at,
      (select count(*) from pg_stat_activity)::int as active_connections
  `);
  return info.rows[0] || null;
}

// ─── SQL validation ───

export function validateReadOnlySql(sql) {
  const trimmed = sql.trim();
  if (!trimmed) return "Query is required.";
  const single = trimmed.replace(/;\s*$/, "");
  if (single.includes(";")) return "Only one statement is allowed.";
  if (!/^(select|with|explain)\b/i.test(single)) return "Only read-only queries are allowed (SELECT/WITH/EXPLAIN).";
  const forbiddenRegex = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`, "i");
  if (forbiddenRegex.test(single)) return "Query contains blocked keyword(s).";
  // Block pg_sleep to prevent resource exhaustion
  if (/\bpg_sleep\b/i.test(single)) return "pg_sleep is not allowed.";
  return null;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export function isValidIdentifier(name) {
  return typeof name === "string" && IDENT_RE.test(name);
}

export function quoteIdent(identifier) {
  const value = String(identifier || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid identifier: ${value}`);
  return `"${value.replace(/"/g, '""')}"`;
}

// ─── Network helpers ───

export async function fetchWithTimeout(url, init = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkUrlReachable(url, expectedStatuses = [200, 204, 301, 302, 307, 308, 401, 403]) {
  if (!url) return { configured: false, reachable: false, message: "Not configured" };
  try {
    const response = await fetchWithTimeout(url);
    return {
      configured: true,
      reachable: expectedStatuses.includes(response.status),
      status: response.status,
      message: expectedStatuses.includes(response.status) ? "Reachable" : `Unexpected status ${response.status}`,
    };
  } catch (error) {
    return { configured: true, reachable: false, message: error instanceof Error ? error.message : "Network error" };
  }
}

// ─── Migration helpers ───

import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { MIGRATIONS_DIR } from "./state.js";

export async function listMigrationFiles() {
  try {
    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(cjs|js|mjs|ts|sql)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function migrationBaseName(name) {
  return String(name || "").replace(/\.(cjs|js|mjs|ts|sql)$/i, "");
}

export async function getAppliedMigrations() {
  const pool = getPool();
  if (!pool) return [];
  try {
    const result = await pool.query(`select name, run_on from public.pgmigrations order by run_on asc`);
    return result.rows.map((row) => ({ ...row, base_name: migrationBaseName(row.name) }));
  } catch {
    return [];
  }
}

export async function runNodePgMigrate(commandArgs, databaseUrl) {
  return new Promise((resolve, reject) => {
    const args = ["node-pg-migrate", ...commandArgs];
    const child = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr, ok: true });
      else reject(new Error(stderr || stdout || `Migration failed with exit code ${code}`));
    });
  });
}
