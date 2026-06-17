import express from "express";
import { getPool, getCustomerPool } from "../lib/state.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";
import { isValidIdentifier } from "../lib/helpers.js";

const log = logger.child({ module: "vectors" });

export const router = express.Router();

// Schemas that must never be accessed or modified by tenant requests
const PROTECTED_SCHEMAS = ["truss_internal", "pg_catalog", "information_schema", "keto"];

// ─── Tenant auth guard: all vector routes require an authenticated tenant ───
router.use("/api/vectors", (req, res, next) => {
  if (!req.tenant?.id) return res.status(401).json({ error: "Authentication required" });
  next();
});

// GET /api/vectors/status — check if pgvector is installed
router.get("/api/vectors/status", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    return res.json({ installed: rows.length > 0, version: rows[0]?.extversion || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/vectors/enable — CREATE EXTENSION vector
router.post("/api/vectors/enable", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    const { rows } = await pool.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    log.info({ version: rows[0]?.extversion }, "pgvector extension enabled");
    return res.json({ ok: true, version: rows[0]?.extversion || null });
  } catch (e) {
    log.error({ err: e.message }, "failed to enable pgvector");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/vectors/collections — list tables with vector columns
router.get("/api/vectors/collections", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT c.table_schema, c.table_name, c.column_name, c.udt_name,
             (SELECT reltuples::bigint FROM pg_class WHERE oid = (c.table_schema || '.' || c.table_name)::regclass) AS row_count,
             (SELECT pg_size_pretty(pg_total_relation_size((c.table_schema || '.' || c.table_name)::regclass))) AS table_size,
             (SELECT string_agg(i.indexname || ' (' || i.indexdef || ')', '; ')
              FROM pg_indexes i WHERE i.schemaname = c.table_schema AND i.tablename = c.table_name
                AND (i.indexdef ILIKE '%hnsw%' OR i.indexdef ILIKE '%ivfflat%')) AS vector_indexes
      FROM information_schema.columns c
      WHERE c.udt_name = 'vector'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY c.table_schema, c.table_name
    `);
    return res.json({ collections: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/vectors/collections/:schema/:table — collection detail
router.get("/api/vectors/collections/:schema/:table", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Access to system schemas is not allowed" });
  }
  try {
    // Get columns
    const cols = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, table]);
    // Get vector column dimensions
    const vecCols = cols.rows.filter(c => c.udt_name === 'vector');
    let dimensions = null;
    if (vecCols.length > 0) {
      try {
        const dimQ = await pool.query(`SELECT vector_dims("${vecCols[0].column_name}") AS dims FROM "${schema}"."${table}" LIMIT 1`);
        dimensions = dimQ.rows[0]?.dims || null;
      } catch { /* empty table */ }
    }
    // Get indexes
    const idxs = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`, [schema, table]);
    // Get row count
    const cnt = await pool.query(`SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = $1::regclass`, [`${schema}.${table}`]);
    return res.json({
      columns: cols.rows,
      dimensions,
      indexes: idxs.rows,
      rowCount: Number(cnt.rows[0]?.estimate || 0),
      vectorColumns: vecCols.map(c => c.column_name),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/vectors/collections — create a vector table
router.post("/api/vectors/collections", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const name = String(req.body?.name || "").trim();
  const dimensions = Number(req.body?.dimensions || 0);
  const metric = String(req.body?.metric || "cosine").trim();
  const schema = String(req.body?.schema || "public").trim();
  if (!name || dimensions < 1) return res.status(400).json({ error: "name and dimensions are required" });
  if (dimensions > 16000) return res.status(400).json({ error: "max dimensions is 16000" });
  if (!isValidIdentifier(schema) || !isValidIdentifier(name)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) return res.status(403).json({ error: "Cannot create tables in system schemas" });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."${name}" (
        id bigserial PRIMARY KEY,
        embedding vector(${dimensions}) NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        content text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    log.info({ schema, table: name, dimensions }, "vector collection created");
    return res.status(201).json({ ok: true, table: name, dimensions, schema });
  } catch (e) {
    log.error({ schema, table: name, err: e.message }, "failed to create vector collection");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/vectors/collections/:schema/:table — drop vector table
router.delete("/api/vectors/collections/:schema/:table", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) return res.status(403).json({ error: "Cannot drop tables in system schemas" });
  try {
    await pool.query(`DROP TABLE IF EXISTS "${schema}"."${table}" CASCADE`);
    log.info({ schema, table }, "vector collection dropped");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "failed to drop vector collection");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/vectors/collections/:schema/:table/items — browse vectors
router.get("/api/vectors/collections/:schema/:table/items", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Access to system schemas is not allowed" });
  }
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);
  try {
    const { rows } = await pool.query(`SELECT * FROM "${schema}"."${table}" ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    // Truncate vector display to first 5 elements
    const items = rows.map(r => {
      const out = { ...r };
      for (const [k, v] of Object.entries(out)) {
        if (typeof v === 'string' && v.startsWith('[') && v.length > 100) {
          try { const arr = JSON.parse(v); out[k] = arr.slice(0, 5).join(', ') + `... (${arr.length}d)`; } catch {}
        }
      }
      return out;
    });
    return res.json({ items, limit, offset });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/vectors/collections/:schema/:table/search — similarity search
router.post("/api/vectors/collections/:schema/:table/search", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Access to system schemas is not allowed" });
  }
  const vector = req.body?.vector; // array of numbers
  const topK = Math.min(Number(req.body?.topK || 10), 100);
  const metric = String(req.body?.metric || "cosine");
  const vectorCol = String(req.body?.vectorColumn || "embedding");
  if (!Array.isArray(vector) || vector.length === 0) return res.status(400).json({ error: "vector array is required" });
  if (!isValidIdentifier(vectorCol)) {
    return res.status(400).json({ error: "Invalid column name" });
  }
  const op = metric === "l2" ? "<->" : metric === "inner" ? "<#>" : "<=>";
  try {
    const vecStr = `[${vector.join(",")}]`;
    const { rows } = await pool.query(`
      SELECT *, ("${vectorCol}" ${op} $1::vector) AS distance
      FROM "${schema}"."${table}"
      ORDER BY "${vectorCol}" ${op} $1::vector
      LIMIT $2
    `, [vecStr, topK]);
    trackFeature(req.tenant?.id || null, "vectors", "search");
    return res.json({ results: rows, metric, topK });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/vectors/collections/:schema/:table/indexes — create vector index
router.post("/api/vectors/collections/:schema/:table/indexes", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    return res.status(400).json({ error: "Invalid schema or table name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) return res.status(403).json({ error: "Cannot create indexes in system schemas" });
  const indexType = String(req.body?.type || "hnsw").toLowerCase();
  const vectorCol = String(req.body?.column || "embedding");
  if (!isValidIdentifier(vectorCol)) {
    return res.status(400).json({ error: "Invalid column name" });
  }
  const metric = String(req.body?.metric || "cosine");
  const lists = parseInt(req.body?.lists || 100, 10);
  if (!Number.isFinite(lists) || lists < 1) return res.status(400).json({ error: "lists must be a positive integer" });
  if (!["hnsw", "ivfflat"].includes(indexType)) return res.status(400).json({ error: "type must be hnsw or ivfflat" });
  const opClass = metric === "l2" ? "vector_l2_ops" : metric === "inner" ? "vector_ip_ops" : "vector_cosine_ops";
  const idxName = `${table}_${vectorCol}_${indexType}_idx`;
  try {
    if (indexType === "hnsw") {
      await pool.query(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${schema}"."${table}" USING hnsw ("${vectorCol}" ${opClass})`);
    } else {
      await pool.query(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${schema}"."${table}" USING ivfflat ("${vectorCol}" ${opClass}) WITH (lists = ${lists})`);
    }
    log.info({ schema, table, index: idxName, type: indexType }, "vector index created");
    return res.status(201).json({ ok: true, index: idxName, type: indexType });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "failed to create vector index");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/vectors/collections/:schema/:table/indexes/:name — drop index
router.delete("/api/vectors/collections/:schema/:table/indexes/:name", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema, table, name } = req.params;
  if (!isValidIdentifier(schema) || !isValidIdentifier(table) || !isValidIdentifier(name)) {
    return res.status(400).json({ error: "Invalid schema, table, or index name" });
  }
  if (PROTECTED_SCHEMAS.includes(schema)) return res.status(403).json({ error: "Cannot drop indexes in system schemas" });
  try {
    await pool.query(`DROP INDEX IF EXISTS "${schema}"."${name}"`);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
