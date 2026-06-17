import express from "express";
import { getPool, getCustomerPool } from "../lib/state.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "search" });

// ─── SQL injection guards ───
const VALID_TS_CONFIGS = new Set([
  "simple", "english", "arabic", "armenian", "basque", "catalan", "danish",
  "dutch", "finnish", "french", "german", "greek", "hindi", "hungarian",
  "indonesian", "irish", "italian", "lithuanian", "nepali", "norwegian",
  "portuguese", "romanian", "russian", "serbian", "spanish", "swedish",
  "tamil", "turkish", "yiddish",
]);
const VALID_WEIGHTS = new Set(["A", "B", "C", "D"]);
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isValidIdentifier(name) {
  return IDENT_RE.test(name);
}

export const router = express.Router();

// Schemas that must never be accessed or modified by tenant requests
const PROTECTED_SCHEMAS = ["truss_internal", "pg_catalog", "information_schema", "keto"];

// ─── Tenant auth guard: all search routes require an authenticated tenant ───
router.use("/api/search", (req, res, next) => {
  if (!req.tenant?.id) return res.status(401).json({ error: "Authentication required" });
  next();
});

// GET /api/search/configs — list text search configurations
router.get("/api/search/configs", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT cfgname AS name, cfgnamespace::regnamespace::text AS schema,
             obj_description(oid) AS description
      FROM pg_ts_config ORDER BY cfgname
    `);
    return res.json({ configs: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/search/indexes — list GIN/GiST indexes on tsvector columns
router.get("/api/search/indexes", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT i.schemaname, i.tablename, i.indexname, i.indexdef,
             pg_size_pretty(pg_relation_size(i.indexname::regclass)) AS index_size
      FROM pg_indexes i
      WHERE (i.indexdef ILIKE '%tsvector%' OR i.indexdef ILIKE '%gin%to_tsvector%' OR i.indexdef ILIKE '%gist%to_tsvector%')
        AND i.schemaname NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY i.schemaname, i.tablename
    `);
    return res.json({ indexes: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/search/columns — list tables with tsvector columns
router.get("/api/search/columns", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT c.table_schema, c.table_name, c.column_name, c.udt_name,
             (SELECT reltuples::bigint FROM pg_class WHERE oid = (c.table_schema || '.' || c.table_name)::regclass) AS row_count
      FROM information_schema.columns c
      WHERE c.udt_name = 'tsvector'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY c.table_schema, c.table_name
    `);
    return res.json({ columns: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/search/eligible — list text columns eligible for FTS
router.get("/api/search/eligible", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.data_type IN ('text', 'character varying')
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY c.table_schema, c.table_name, c.column_name
    `);
    return res.json({ columns: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/search/test — test a search query with ts_headline
router.post("/api/search/test", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const table = String(req.body?.table || "").trim();
  const schema = String(req.body?.schema || "public").trim();
  const query = String(req.body?.query || "").trim();
  const column = String(req.body?.column || "").trim();
  const config = String(req.body?.config || "english").trim();
  const limit = Math.min(Number(req.body?.limit || 20), 100);
  if (!table || !query || !column) return res.status(400).json({ error: "table, column, and query are required" });
  if (!VALID_TS_CONFIGS.has(config)) return res.status(400).json({ error: `Invalid text search config: ${config}` });
  if (!isValidIdentifier(column)) return res.status(400).json({ error: "Invalid column name" });
  if (!isValidIdentifier(table)) return res.status(400).json({ error: "Invalid table name" });
  if (!isValidIdentifier(schema)) return res.status(400).json({ error: "Invalid schema name" });
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Cannot search system schemas" });
  }
  try {
    const { rows } = await pool.query(`
      SELECT *, ts_rank(to_tsvector('${config}', "${column}"), plainto_tsquery('${config}', $1)) AS rank,
             ts_headline('${config}', "${column}", plainto_tsquery('${config}', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=3, MaxWords=35') AS headline
      FROM "${schema}"."${table}"
      WHERE to_tsvector('${config}', "${column}") @@ plainto_tsquery('${config}', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [query, limit]);
    trackFeature(req.tenant?.id || null, "search", "query");
    return res.json({ results: rows, query, config });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/search/setup — add tsvector column + trigger + GIN index to a table
router.post("/api/search/setup", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const table = String(req.body?.table || "").trim();
  const schema = String(req.body?.schema || "public").trim();
  const sourceColumns = req.body?.columns; // array of {name, weight} e.g. [{name:"title", weight:"A"}, {name:"body", weight:"B"}]
  const config = String(req.body?.config || "english").trim();
  const tsvecCol = String(req.body?.tsvecColumn || "search_vector").trim();
  if (!table || !Array.isArray(sourceColumns) || sourceColumns.length === 0) {
    return res.status(400).json({ error: "table and columns array are required" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Cannot modify tables in system schemas" });
  }
  if (!VALID_TS_CONFIGS.has(config)) return res.status(400).json({ error: `Invalid text search config: ${config}` });
  if (!isValidIdentifier(table)) return res.status(400).json({ error: "Invalid table name" });
  if (!isValidIdentifier(schema)) return res.status(400).json({ error: "Invalid schema name" });
  if (!isValidIdentifier(tsvecCol)) return res.status(400).json({ error: "Invalid tsvector column name" });
  for (const c of sourceColumns) {
    if (!isValidIdentifier(String(c.name || ""))) return res.status(400).json({ error: `Invalid column name: ${c.name}` });
    const w = String(c.weight || "A");
    if (!VALID_WEIGHTS.has(w)) return res.status(400).json({ error: `Invalid weight: ${w}. Must be A, B, C, or D` });
  }
  try {
    // 1. Add tsvector column
    await pool.query(`ALTER TABLE "${schema}"."${table}" ADD COLUMN IF NOT EXISTS "${tsvecCol}" tsvector`);
    // 2. Build setweight expression
    const expr = sourceColumns.map(c =>
      `setweight(to_tsvector('${config}', coalesce("${c.name}", '')), '${c.weight || "A"}')`
    ).join(" || ");
    // 3. Update existing rows
    await pool.query(`UPDATE "${schema}"."${table}" SET "${tsvecCol}" = ${expr}`);
    // 4. Create trigger function
    const fnName = `truss_internal.fts_${schema}_${table}_fn`;
    await pool.query(`
      CREATE OR REPLACE FUNCTION ${fnName}() RETURNS trigger AS $$
      BEGIN
        NEW."${tsvecCol}" := ${expr.replace(/"/g, '"')};
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    // 5. Create trigger
    const trigName = `fts_${schema}_${table}_trg`;
    await pool.query(`DROP TRIGGER IF EXISTS "${trigName}" ON "${schema}"."${table}"`);
    await pool.query(`
      CREATE TRIGGER "${trigName}"
      BEFORE INSERT OR UPDATE ON "${schema}"."${table}"
      FOR EACH ROW EXECUTE FUNCTION ${fnName}()
    `);
    // 6. Create GIN index
    const idxName = `${table}_${tsvecCol}_gin_idx`;
    await pool.query(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${schema}"."${table}" USING gin("${tsvecCol}")`);
    log.info({ schema, table, tsvecCol, indexName: idxName }, "FTS setup completed");
    return res.status(201).json({ ok: true, tsvecColumn: tsvecCol, indexName: idxName, triggerName: trigName });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "FTS setup failed");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/search/setup — remove FTS from a table (column + trigger + index)
router.delete("/api/search/setup", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const table = String(req.body?.table || "").trim();
  const schema = String(req.body?.schema || "public").trim();
  const tsvecCol = String(req.body?.tsvecColumn || "search_vector").trim();
  if (!table) return res.status(400).json({ error: "table is required" });
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Cannot modify tables in system schemas" });
  }
  if (!isValidIdentifier(table)) return res.status(400).json({ error: "Invalid table name" });
  if (!isValidIdentifier(schema)) return res.status(400).json({ error: "Invalid schema name" });
  if (!isValidIdentifier(tsvecCol)) return res.status(400).json({ error: "Invalid tsvector column name" });
  try {
    const trigName = `fts_${schema}_${table}_trg`;
    const fnName = `truss_internal.fts_${schema}_${table}_fn`;
    await pool.query(`DROP TRIGGER IF EXISTS "${trigName}" ON "${schema}"."${table}"`);
    await pool.query(`DROP FUNCTION IF EXISTS ${fnName}() CASCADE`);
    await pool.query(`ALTER TABLE "${schema}"."${table}" DROP COLUMN IF EXISTS "${tsvecCol}"`);
    log.info({ schema, table }, "FTS removed from table");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "FTS removal failed");
    return res.status(500).json({ error: e.message });
  }
});
