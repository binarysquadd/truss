import express from "express";
import { getCustomerPool } from "../lib/state.js";
import { writeAuditLog } from "../lib/internal.js";
import logger from "../lib/logger.js";
import { logSecurityEvent, trackFeature } from "../lib/observability.js";
import { adminMiddleware } from "../lib/session.js";

const log = logger.child({ module: "extensions" });
export const router = express.Router();

// ─── Curated extensions we surface in the dashboard ───
const CURATED_EXTENSIONS = [
  // Search & Text
  { name: "pg_trgm", category: "Search & Text", description: "Text similarity measurement and index searching based on trigrams" },
  { name: "fuzzystrmatch", category: "Search & Text", description: "Determine similarities and distance between strings" },
  { name: "unaccent", category: "Search & Text", description: "Text search dictionary that removes accents" },
  { name: "citext", category: "Search & Text", description: "Data type for case-insensitive character strings" },
  // Data Types
  { name: "hstore", category: "Data Types", description: "Data type for storing sets of (key, value) pairs" },
  { name: "ltree", category: "Data Types", description: "Data type for hierarchical tree-like structures" },
  { name: "cube", category: "Data Types", description: "Data type for multidimensional cubes" },
  { name: "seg", category: "Data Types", description: "Data type for representing line segments or floating-point intervals" },
  { name: "isn", category: "Data Types", description: "Data types for international product numbering standards (ISBN, ISSN, EAN)" },
  { name: "intarray", category: "Data Types", description: "Functions, operators, and index support for 1-D arrays of integers" },
  // Indexing
  { name: "btree_gin", category: "Indexing", description: "Support for indexing common datatypes in GIN" },
  { name: "btree_gist", category: "Indexing", description: "Support for indexing common datatypes in GiST" },
  { name: "bloom", category: "Indexing", description: "Bloom access method — signature file based index" },
  // Security
  { name: "pgcrypto", category: "Security", description: "Cryptographic functions: hashing, encryption, random bytes" },
  { name: "sslinfo", category: "Security", description: "Information about SSL certificates for current connection" },
  // Utilities
  { name: "uuid-ossp", category: "Utilities", description: "Generate universally unique identifiers (UUIDs)" },
  { name: "tablefunc", category: "Utilities", description: "Functions that manipulate whole tables, including crosstab" },
  { name: "moddatetime", category: "Utilities", description: "Functions for tracking last modification time" },
  { name: "lo", category: "Utilities", description: "Large Object maintenance" },
  { name: "tcn", category: "Utilities", description: "Triggered change notifications" },
  // Performance
  { name: "pg_stat_statements", category: "Performance", description: "Track planning and execution statistics of all SQL statements" },
  { name: "pg_prewarm", category: "Performance", description: "Prewarm relation data into buffer cache" },
  { name: "pg_buffercache", category: "Performance", description: "Examine the shared buffer cache" },
  { name: "pgstattuple", category: "Performance", description: "Show tuple-level statistics" },
  { name: "pgrowlocks", category: "Performance", description: "Show row-level locking information" },
  // Geospatial
  { name: "earthdistance", category: "Geospatial", description: "Calculate great-circle distances on the surface of the Earth" },
  // Federation
  { name: "postgres_fdw", category: "Federation", description: "Foreign-data wrapper for remote PostgreSQL servers" },
  { name: "dblink", category: "Federation", description: "Connect to other PostgreSQL databases from within a database" },
  // Diagnostics
  { name: "pageinspect", category: "Diagnostics", description: "Inspect the contents of database pages at a low level" },
  { name: "pg_visibility", category: "Diagnostics", description: "Examine the visibility map and page-level visibility info" },
  { name: "pg_freespacemap", category: "Diagnostics", description: "Examine the free space map (FSM)" },
  { name: "amcheck", category: "Diagnostics", description: "Functions for verifying relation integrity" },
  { name: "pg_walinspect", category: "Diagnostics", description: "Functions to inspect contents of PostgreSQL Write-Ahead Log" },
];

/** Quote a SQL identifier — supports names with hyphens (e.g. uuid-ossp) */
function quoteExtIdent(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

// ─── GET /api/extensions — list curated extensions with installed status ───
router.get("/api/extensions", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    // Get all available extensions on this Postgres
    const { rows: available } = await pool.query(
      `SELECT name, default_version, comment FROM pg_available_extensions ORDER BY name`
    );
    // Get currently installed extensions
    const { rows: installed } = await pool.query(
      `SELECT extname, extversion FROM pg_extension`
    );
    const installedMap = Object.fromEntries(installed.map(e => [e.extname, e.extversion]));
    const availableMap = Object.fromEntries(available.map(e => [e.name, { version: e.default_version, comment: e.comment }]));

    // Build response: curated list with status
    const extensions = CURATED_EXTENSIONS
      .filter(ext => availableMap[ext.name]) // only show extensions that are actually available on this Postgres
      .map(ext => ({
        name: ext.name,
        category: ext.category,
        description: ext.description,
        version: availableMap[ext.name]?.version || null,
        installedVersion: installedMap[ext.name] || null,
        enabled: !!installedMap[ext.name],
      }));

    return res.json({ extensions, totalAvailable: available.length, totalInstalled: installed.length });
  } catch (e) {
    log.error({ err: e.message }, "failed to list extensions");
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/extensions/:name/toggle — enable or disable an extension ───
router.post("/api/extensions/:name/toggle", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const extName = req.params.name;

  // Only allow curated extensions
  if (!CURATED_EXTENSIONS.some(e => e.name === extName)) {
    return res.status(400).json({ error: `Extension '${extName}' is not in the allowed list` });
  }

  try {
    // Check current state
    const { rows } = await pool.query(`SELECT extname FROM pg_extension WHERE extname = $1`, [extName]);
    const isEnabled = rows.length > 0;

    if (isEnabled) {
      // Disable — use CASCADE with confirmation, or RESTRICT by default
      const cascade = req.body?.cascade === true;
      await pool.query(`DROP EXTENSION ${quoteExtIdent(extName)} ${cascade ? "CASCADE" : "RESTRICT"}`);
      writeAuditLog("dashboard", "extension.disabled", "extension", extName, { cascade }, req.tenant?.id || null);
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
      logSecurityEvent("extension.toggled", { extension: extName, enabled: false }, ip, req.tenant?.id || null);
      log.info({ extension: extName }, "extension disabled");
      trackFeature(req.tenant?.id || null, "extensions", "toggle");
      return res.json({ ok: true, enabled: false, extension: extName });
    } else {
      // Enable
      await pool.query(`CREATE EXTENSION IF NOT EXISTS ${quoteExtIdent(extName)}`);
      // Get installed version
      const { rows: ver } = await pool.query(`SELECT extversion FROM pg_extension WHERE extname = $1`, [extName]);
      writeAuditLog("dashboard", "extension.enabled", "extension", extName, { version: ver[0]?.extversion }, req.tenant?.id || null);
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
      logSecurityEvent("extension.toggled", { extension: extName, enabled: true }, ip, req.tenant?.id || null);
      log.info({ extension: extName, version: ver[0]?.extversion }, "extension enabled");
      trackFeature(req.tenant?.id || null, "extensions", "toggle");
      return res.json({ ok: true, enabled: true, extension: extName, version: ver[0]?.extversion });
    }
  } catch (e) {
    log.error({ extension: extName, err: e.message }, "failed to toggle extension");
    // Common error: dependent objects exist
    if (e.message.includes("depends on")) {
      return res.status(409).json({ error: `Cannot disable '${extName}': other objects depend on it. Use cascade to force.`, dependencyError: true });
    }
    return res.status(500).json({ error: e.message });
  }
});
