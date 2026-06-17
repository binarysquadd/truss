import express from "express";
import { z } from "zod";
import logger from "../lib/logger.js";
import {
  getPool, getCustomerPool, setPool, getActiveDatabaseUrl, setActiveDatabaseUrl,
  MAX_ROWS, DEFAULT_DATABASE_URL, buildPool, getPoolForDatabase,
  MIGRATIONS_DIR,
} from "../lib/state.js";
import {
  getConnectionInfo, validateReadOnlySql, quoteIdent,
  maskConnectionString, fingerprintConnectionString,
  listMigrationFiles, getAppliedMigrations, migrationBaseName, runNodePgMigrate,
} from "../lib/helpers.js";
import { ensureInternalSchema } from "../lib/internal.js";
import { trackFeature } from "../lib/observability.js";
import { adminMiddleware } from "../lib/session.js";
import { validate } from "../lib/validate.js";

const log = logger.child({ module: "sql" });

const isProd = process.env.NODE_ENV === "production";

// Schemas hidden from non-admin users — internal infrastructure
const HIDDEN_SCHEMAS = ['truss_internal', 'auth', 'keto', 'storage', 'pg_toast'];

function getHiddenSchemas(req) {
  const isAdmin = req.tenant?.isAdmin || req.tenant?.id === 'local';
  return isAdmin
    ? ['pg_catalog', 'information_schema']
    : ['pg_catalog', 'information_schema', ...HIDDEN_SCHEMAS];
}

function hiddenSchemaPlaceholders(schemas, startIndex = 1) {
  return schemas.map((_, i) => `$${startIndex + i}`).join(', ');
}

const sqlQuerySchema = z.object({
  sql: z.string().min(1, "SQL query is required"),
  database: z.string().optional().nullable(),
});

export const router = express.Router();

// ─── Local helper: validate branch database belongs to current tenant ───
async function validateBranchOwnership(branchDb, tenantId) {
  if (!branchDb || !tenantId) return false;
  const pool = getPool();
  if (!pool) return false;
  try {
    // Check branches table first
    const branchResult = await pool.query(
      `SELECT id FROM truss_internal.branches WHERE branch_db = $1 AND tenant_id = $2 AND status = 'active' LIMIT 1`,
      [branchDb, tenantId]
    );
    if (branchResult.rows.length > 0) return true;
    // Also check tenant_databases
    const tdResult = await pool.query(
      `SELECT db_name FROM truss_internal.tenant_databases WHERE db_name = $1 AND tenant_id = $2 AND status = 'active' LIMIT 1`,
      [branchDb, tenantId]
    );
    return tdResult.rows.length > 0;
  } catch {
    return false;
  }
}

// ─── Local helper: switch the global database connection ───

async function switchDatabaseConnection(nextDatabaseUrl) {
  const nextPool = buildPool(nextDatabaseUrl);
  await nextPool.query("select 1");
  const previousPool = getPool();
  setPool(nextPool);
  setActiveDatabaseUrl(nextDatabaseUrl);
  if (previousPool) previousPool.end().catch(() => {});
}

// ─── /api/health ───

router.get("/api/health", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({
      ok: false,
      error: "DATABASE_URL is not set.",
    });
  }

  try {
    const connection = await getConnectionInfo();
    log.debug({ connection: connection.database }, "Health check OK");
    const pool = getPool();
    const poolStats = pool ? {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    } : null;
    // Sanitize connection info for public health endpoint — hide internal addresses
    const safeConnection = {
      database_name: connection.database_name,
      db_user: connection.db_user,
      pg_version: connection.pg_version,
      started_at: connection.started_at,
      active_connections: connection.active_connections,
    };
    return res.json({ ok: true, connection: safeConnection, pool: poolStats, version: globalThis.__API_GIT_HASH__, started_at: globalThis.__API_START_TIME__ });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : error }, "Health check failed");
    return res.status(500).json({
      ok: false,
      error: isProd ? "An internal error occurred" : (error instanceof Error ? error.message : "Unknown database error"),
    });
  }
});

// ─── /api/connections ───

router.get("/api/connections/current", async (req, res) => {
  if (!getActiveDatabaseUrl() || !getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const connection = await getConnectionInfo();
    const isAdmin = req.tenant?.isAdmin;

    // Non-admin users get a sanitized view — no internal IPs or raw connection strings
    if (!isAdmin) {
      return res.json({
        source: "managed",
        maskedUrl: `postgres://****@truss-managed/${connection.database_name || "db"}`,
        connection: {
          database_name: connection.database_name,
          pg_version: connection.pg_version,
          db_user: connection.db_user,
          // Hide internal server address from non-admins
          server_addr: "managed",
          server_port: 5432,
        },
      });
    }

    return res.json({
      source: getActiveDatabaseUrl() === DEFAULT_DATABASE_URL ? "default" : "custom",
      maskedUrl: maskConnectionString(getActiveDatabaseUrl()),
      fingerprint: fingerprintConnectionString(getActiveDatabaseUrl()),
      connection,
    });
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : error }, "Failed to read current connection");
    return res.status(500).json({
      error: isProd ? "An internal error occurred" : (error instanceof Error ? error.message : "Failed to read current connection."),
    });
  }
});

// WARNING: This endpoint switches the global database pool and affects ALL tenants.
// It is guarded by adminMiddleware so only platform admins can invoke it.
router.post("/api/connections/switch", adminMiddleware, async (req, res) => {
  const databaseUrl = typeof req.body?.databaseUrl === "string" ? req.body.databaseUrl.trim() : "";
  const resetToDefault = req.body?.resetToDefault === true;

  const nextUrl = resetToDefault ? DEFAULT_DATABASE_URL : databaseUrl;
  if (!nextUrl) {
    return res.status(400).json({ error: "databaseUrl is required." });
  }
  if (!/^postgres(ql)?:\/\//i.test(nextUrl)) {
    return res
      .status(400)
      .json({ error: "databaseUrl must start with postgres:// or postgresql://" });
  }

  try {
    await switchDatabaseConnection(nextUrl);
    const connection = await getConnectionInfo();
    return res.json({
      ok: true,
      source: nextUrl === DEFAULT_DATABASE_URL ? "default" : "custom",
      maskedUrl: maskConnectionString(nextUrl),
      fingerprint: fingerprintConnectionString(nextUrl),
      connection,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to switch connection.",
    });
  }
});

// ─── /api/sql/tables ───

router.get("/api/sql/tables", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const hidden = getHiddenSchemas(req);
    const result = await getCustomerPool(req).query(
      `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
      and table_schema not in (${hiddenSchemaPlaceholders(hidden)})
      order by table_schema, table_name
      `,
      hidden
    );

    return res.json({
      tables: result.rows.map((row) => `${row.table_schema}.${row.table_name}`),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load tables.",
    });
  }
});

// ─── /api/sql/metadata ───

router.get("/api/sql/metadata", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(400).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const hidden = getHiddenSchemas(req);
    const [connection, tableRows] = await Promise.all([
      getConnectionInfo(),
      getCustomerPool(req).query(
        `
        select table_schema, table_name
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in (${hiddenSchemaPlaceholders(hidden)})
        order by table_schema, table_name
        `,
        hidden
      ),
    ]);

    const schemaMap = new Map();
    for (const row of tableRows.rows) {
      const schema = row.table_schema;
      if (!schemaMap.has(schema)) {
        schemaMap.set(schema, []);
      }
      schemaMap.get(schema).push(row.table_name);
    }

    const schemas = Array.from(schemaMap.entries()).map(([name, tables]) => ({
      name,
      tables,
    }));

    return res.json({
      connection,
      schemas,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load metadata.",
    });
  }
});

// ─── /api/sql/table-details ───

router.get("/api/sql/table-details", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  const schema = String(req.query.schema || "").trim();
  const table = String(req.query.table || "").trim();
  if (!schema || !table) {
    return res.status(400).json({ error: "schema and table are required." });
  }

  const isAdmin = req.tenant?.isAdmin || req.tenant?.id === 'local';
  if (!isAdmin && HIDDEN_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Access denied to internal schema." });
  }

  try {
    const pool = getCustomerPool(req);
    const columns = await pool.query(
      `
      select
        column_name,
        data_type,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
      order by ordinal_position
      `,
      [schema, table]
    );

    const indexes = await pool.query(
      `
      select indexname, indexdef
      from pg_indexes
      where schemaname = $1
        and tablename = $2
      order by indexname
      `,
      [schema, table]
    );

    const foreignKeys = await pool.query(
      `
      select
        kcu.column_name as source_column,
        ccu.table_schema as target_schema,
        ccu.table_name as target_table,
        ccu.column_name as target_column,
        tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
        and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = $1
        and tc.table_name = $2
      `,
      [schema, table]
    );

    const inboundForeignKeys = await pool.query(
      `
      select
        tc.table_schema as source_schema,
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.column_name as target_column,
        tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
        and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_schema = $1
        and ccu.table_name = $2
        and (tc.table_schema != $1 or tc.table_name != $2)
      `,
      [schema, table]
    );

    return res.json({
      schema,
      table,
      columns: columns.rows,
      indexes: indexes.rows,
      foreignKeys: foreignKeys.rows,
      inboundForeignKeys: inboundForeignKeys.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load table details.",
    });
  }
});

// ─── /api/sql/table-browser ───

router.get("/api/sql/table-browser", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  const schema = String(req.query.schema || "").trim();
  const table = String(req.query.table || "").trim();
  const search = String(req.query.search || "").trim();
  const searchColumn = String(req.query.search_column || "").trim();
  const orderBy = String(req.query.order_by || "").trim();
  const orderDirRaw = String(req.query.order_dir || "asc").trim().toLowerCase();
  const orderDir = orderDirRaw === "desc" ? "DESC" : "ASC";
  const offsetRaw = Number(req.query.offset || 0);
  const limitRaw = Number(req.query.limit || 50);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  if (!schema || !table) {
    return res.status(400).json({ error: "schema and table are required." });
  }

  const isAdmin = req.tenant?.isAdmin || req.tenant?.id === 'local';
  if (!isAdmin && HIDDEN_SCHEMAS.includes(schema)) {
    return res.status(403).json({ error: "Access denied to internal schema." });
  }

  try {
    const schemaQuoted = quoteIdent(schema);
    const tableQuoted = quoteIdent(table);
    const fullTable = `${schemaQuoted}.${tableQuoted}`;

    const pool = getCustomerPool(req);
    const columnsMetaResult = await pool.query(
      `
      select
        column_name as name,
        data_type as data_type,
        is_nullable as is_nullable
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
      order by ordinal_position
      `,
      [schema, table]
    );
    const columnsMeta = columnsMetaResult.rows;
    if (columnsMeta.length === 0) {
      return res.status(404).json({ error: `Table not found: ${schema}.${table}` });
    }

    const columns = columnsMeta.map((col) => String(col.name));
    const validSearchColumn = searchColumn && columns.includes(searchColumn) ? searchColumn : "";
    const validOrderBy =
      (orderBy && columns.includes(orderBy) ? orderBy : columns[0]) || "";

    const whereParts = [];
    const whereValues = [];
    if (search) {
      if (validSearchColumn) {
        whereValues.push(`%${search}%`);
        whereParts.push(`${quoteIdent(validSearchColumn)}::text ilike $${whereValues.length}`);
      } else {
        const orParts = columns.map((column) => {
          whereValues.push(`%${search}%`);
          return `${quoteIdent(column)}::text ilike $${whereValues.length}`;
        });
        whereParts.push(`(${orParts.join(" OR ")})`);
      }
    }
    const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

    const totalCountResult = await pool.query(
      `select count(*)::int as total_count from ${fullTable} ${whereSql}`,
      whereValues
    );
    const totalCount = Number(totalCountResult.rows?.[0]?.total_count || 0);

    const values = [...whereValues];
    values.push(limit);
    values.push(offset);
    const rowsResult = await pool.query(
      `
      select *
      from ${fullTable}
      ${whereSql}
      order by ${quoteIdent(validOrderBy)} ${orderDir}
      limit $${values.length - 1}
      offset $${values.length}
      `,
      values
    );

    return res.json({
      schema,
      table,
      columns,
      columnMeta: columnsMeta,
      rows: rowsResult.rows,
      rowCount: rowsResult.rowCount ?? rowsResult.rows.length,
      totalCount,
      offset,
      limit,
      orderBy: validOrderBy,
      orderDir: orderDir.toLowerCase(),
      search,
      searchColumn: validSearchColumn || null,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to browse table.",
    });
  }
});

// ─── /api/sql/erd ───

router.get("/api/sql/erd", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const pool = getCustomerPool(req);
    const hidden = getHiddenSchemas(req);
    const ph = hiddenSchemaPlaceholders(hidden);
    const [tablesResult, columnsResult, fkResult] = await Promise.all([
      pool.query(
        `
        select table_schema, table_name
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in (${ph})
        order by table_schema, table_name
        `,
        hidden
      ),
      pool.query(
        `
        select table_schema, table_name, column_name, data_type
        from information_schema.columns
        where table_schema not in (${ph})
        order by table_schema, table_name, ordinal_position
        `,
        hidden
      ),
      pool.query(
        `
        select
          tc.constraint_name,
          tc.table_schema as source_schema,
          tc.table_name as source_table,
          kcu.column_name as source_column,
          ccu.table_schema as target_schema,
          ccu.table_name as target_table,
          ccu.column_name as target_column
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
         and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema not in (${ph})
        order by tc.table_schema, tc.table_name, tc.constraint_name
        `,
        hidden
      ),
    ]);

    const tableMap = new Map();
    for (const table of tablesResult.rows) {
      const key = `${table.table_schema}.${table.table_name}`;
      tableMap.set(key, {
        schema: table.table_schema,
        name: table.table_name,
        columns: [],
      });
    }

    for (const column of columnsResult.rows) {
      const key = `${column.table_schema}.${column.table_name}`;
      const table = tableMap.get(key);
      if (!table) {
        continue;
      }
      table.columns.push({
        name: column.column_name,
        type: column.data_type,
      });
    }

    const relationships = fkResult.rows.map((fk) => ({
      name: fk.constraint_name,
      from: {
        schema: fk.source_schema,
        table: fk.source_table,
        column: fk.source_column,
      },
      to: {
        schema: fk.target_schema,
        table: fk.target_table,
        column: fk.target_column,
      },
    }));

    return res.json({
      tables: Array.from(tableMap.values()),
      relationships,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load ERD metadata.",
    });
  }
});

// ─── /api/sql/query ───

router.post("/api/sql/query", validate(sqlQuerySchema), async (req, res) => {
  req.setTimeout(30000);
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  const sql = req.body.sql;
  const branchDb = req.body.database || null;
  const validationError = validateReadOnlySql(sql);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Validate branch database belongs to the current tenant
  if (branchDb && req.tenant && !req.tenant.isAdmin) {
    const owned = await validateBranchOwnership(branchDb, req.tenant.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied: branch database does not belong to your account." });
    }
  }

  const normalized = sql.trim().replace(/;\s*$/, "");
  const startedAt = Date.now();
  const targetPool = branchDb ? getPoolForDatabase(branchDb) : getCustomerPool(req);

  const client = await targetPool.connect();
  try {
    // READ ONLY tx is the real enforcement: Postgres rejects ALL writes/DDL/sequence
    // advances even when smuggled through functions (query_to_xml, setval, etc.).
    // validateReadOnlySql above is just a friendly first-line check.
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query(normalized);
    await client.query("COMMIT");
    const durationMs = Date.now() - startedAt;
    const rows = result.rows.slice(0, MAX_ROWS);
    log.info({ durationMs, rowCount: result.rowCount ?? rows.length, truncated: result.rows.length > MAX_ROWS }, "Query executed");
    trackFeature(req.tenant?.id || null, "sql", "query");

    return res.json({
      columns: result.fields.map((field) => field.name),
      rows,
      rowCount: result.rowCount ?? rows.length,
      durationMs,
      truncated: result.rows.length > MAX_ROWS,
      maxRows: MAX_ROWS,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    log.error({ err: error instanceof Error ? error.message : error }, "Query failed");
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Query failed.",
    });
  } finally {
    client.release();
  }
});

// ─── /api/sql/export ───

const EXPORT_MAX_ROWS = 50_000;

router.post("/api/sql/export", async (req, res) => {
  req.setTimeout(30000);
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  const sql = typeof req.body?.sql === "string" ? req.body.sql : "";
  const format = req.body?.format;
  const branchDb = typeof req.body?.database === "string" ? req.body.database : null;

  if (format !== "csv" && format !== "json") {
    return res.status(400).json({ error: "format must be \"csv\" or \"json\"." });
  }

  const validationError = validateReadOnlySql(sql);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Validate branch database belongs to the current tenant
  if (branchDb && req.tenant && !req.tenant.isAdmin) {
    const owned = await validateBranchOwnership(branchDb, req.tenant.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied: branch database does not belong to your account." });
    }
  }

  const normalized = sql.trim().replace(/;\s*$/, "");
  const targetPool = branchDb ? getPoolForDatabase(branchDb) : getCustomerPool(req);

  const client = await targetPool.connect();
  try {
    // READ ONLY tx is the real enforcement: Postgres rejects ALL writes/DDL/sequence
    // advances even when smuggled through functions (query_to_xml, setval, etc.).
    // validateReadOnlySql above is just a friendly first-line check.
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query(normalized);
    await client.query("COMMIT");
    const rows = result.rows.slice(0, EXPORT_MAX_ROWS);
    const columns = result.fields.map((f) => f.name);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    if (format === "json") {
      const data = rows.map((row) => {
        const obj = {};
        for (const col of columns) obj[col] = row[col];
        return obj;
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="export-${timestamp}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }

    // CSV
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const lines = [columns.map(escapeCsv).join(",")];
    for (const row of rows) {
      lines.push(columns.map((col) => escapeCsv(row[col])).join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="export-${timestamp}.csv"`);
    return res.send(lines.join("\n"));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Export failed.",
    });
  } finally {
    client.release();
  }
});

// ─── /api/sql/explain ───

router.post("/api/sql/explain", async (req, res) => {
  req.setTimeout(30000);
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  const sql = typeof req.body?.sql === "string" ? req.body.sql : "";
  const analyze = req.body?.analyze === true;
  const validationError = validateReadOnlySql(sql);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const client = await getCustomerPool(req).connect();
  try {
    const normalized = sql.trim().replace(/;\s*$/, "");
    const opts = analyze ? "ANALYZE, BUFFERS, FORMAT JSON" : "FORMAT JSON";
    const explainSql = `EXPLAIN (${opts}) ${normalized}`;
    // READ ONLY so EXPLAIN ANALYZE cannot cause side effects (matches /query, /export).
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(explainSql);
    await client.query("COMMIT");
    const rawPlan = result.rows?.[0]?.["QUERY PLAN"]?.[0] || null;

    // Flatten the tree into an array of nodes with depth for easy rendering
    function flattenPlan(node, depth = 0) {
      if (!node) return [];
      const flat = [{
        depth,
        nodeType: node["Node Type"] || "Unknown",
        relation: node["Relation Name"] || null,
        alias: node["Alias"] || null,
        startupCost: node["Startup Cost"] ?? null,
        totalCost: node["Total Cost"] ?? null,
        planRows: node["Plan Rows"] ?? null,
        planWidth: node["Plan Width"] ?? null,
        actualStartupTime: node["Actual Startup Time"] ?? null,
        actualTotalTime: node["Actual Total Time"] ?? null,
        actualRows: node["Actual Rows"] ?? null,
        actualLoops: node["Actual Loops"] ?? null,
        sharedHitBlocks: node["Shared Hit Blocks"] ?? null,
        sharedReadBlocks: node["Shared Read Blocks"] ?? null,
        filter: node["Filter"] || null,
        indexName: node["Index Name"] || null,
        indexCond: node["Index Cond"] || null,
        joinType: node["Join Type"] || null,
        hashCond: node["Hash Cond"] || null,
        sortKey: node["Sort Key"] || null,
        output: node["Output"] || null,
      }];
      for (const child of node["Plans"] || []) {
        flat.push(...flattenPlan(child, depth + 1));
      }
      return flat;
    }

    const planNode = rawPlan?.Plan || rawPlan;
    const nodes = flattenPlan(planNode);
    const executionTime = rawPlan?.["Execution Time"] ?? null;
    const planningTime = rawPlan?.["Planning Time"] ?? null;

    return res.json({ plan: rawPlan, nodes, executionTime, planningTime });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to run EXPLAIN.",
    });
  } finally {
    client.release();
  }
});

// ─── /api/sql/catalog ───

router.get("/api/sql/catalog", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  try {
    const pool = getCustomerPool(req);
    const hidden = getHiddenSchemas(req);
    const ph = hiddenSchemaPlaceholders(hidden);
    const [
      functions,
      triggers,
      enums,
      extensions,
      indexes,
      publications,
      roles,
      policies,
      config,
    ] = await Promise.all([
      pool.query(
        `
        select
          routine_schema as schema_name,
          routine_name as function_name,
          routine_type,
          data_type
        from information_schema.routines
        where routine_schema not in (${ph})
        order by routine_schema, routine_name
        `,
        hidden
      ),
      pool.query(
        `
        select
          event_object_schema as schema_name,
          event_object_table as table_name,
          trigger_name,
          action_timing,
          event_manipulation as event_type,
          action_statement
        from information_schema.triggers
        where event_object_schema not in (${ph})
        order by event_object_schema, event_object_table, trigger_name
        `,
        hidden
      ),
      pool.query(
        `
        select
          n.nspname as schema_name,
          t.typname as enum_name,
          array_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname not in (${ph})
        group by n.nspname, t.typname
        order by n.nspname, t.typname
        `,
        hidden
      ),
      pool.query(
        `
        select e.extname as extension_name, e.extversion as version, n.nspname as schema_name
        from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
        order by e.extname
        `
      ),
      pool.query(
        `
        select
          schemaname as schema_name,
          tablename as table_name,
          indexname as index_name,
          indexdef
        from pg_indexes
        where schemaname not in (${ph})
        order by schemaname, tablename, indexname
        `,
        hidden
      ),
      pool.query(
        `
        select
          p.pubname as publication_name,
          p.puballtables as all_tables,
          array_remove(array_agg(distinct pt.schemaname || '.' || pt.tablename), null) as tables
        from pg_publication p
        left join pg_publication_tables pt on pt.pubname = p.pubname
        group by p.pubname, p.puballtables
        order by p.pubname
        `
      ),
      pool.query(
        `
        select
          rolname as role_name,
          rolcanlogin as can_login,
          rolsuper as is_superuser,
          rolcreatedb as can_create_db,
          rolcreaterole as can_create_role
        from pg_roles
        order by rolname
        `
      ),
      pool.query(
        `
        select
          schemaname as schema_name,
          tablename as table_name,
          policyname as policy_name,
          permissive,
          roles,
          cmd as command,
          qual as using_expression,
          with_check as check_expression
        from pg_policies
        where schemaname not in (${ph})
        order by schemaname, tablename, policyname
        `,
        hidden
      ),
      pool.query(
        `
        select
          name,
          setting,
          unit,
          short_desc
        from pg_settings
        where name in (
          'max_connections',
          'shared_buffers',
          'work_mem',
          'maintenance_work_mem',
          'effective_cache_size',
          'statement_timeout',
          'idle_in_transaction_session_timeout',
          'max_worker_processes',
          'max_parallel_workers'
        )
        order by name
        `
      ),
    ]);

    return res.json({
      functions: functions.rows,
      triggers: triggers.rows,
      enums: enums.rows,
      extensions: extensions.rows,
      indexes: indexes.rows,
      publications: publications.rows,
      roles: roles.rows,
      policies: policies.rows,
      config: config.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load catalog metadata.",
    });
  }
});

// ─── /api/sql/diagnostics ───

router.get("/api/sql/diagnostics", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const pool = getCustomerPool(req);
    const connection = await getConnectionInfo();
    const startedAt = Date.now();
    await pool.query("select 1");
    const pingMs = Date.now() - startedAt;

    const [activity, longTx, waits] = await Promise.all([
      pool.query(
        `
        select
          state,
          count(*)::int as count
        from pg_stat_activity
        where datname = current_database()
        group by state
        order by count desc
        `
      ),
      pool.query(
        `
        select
          pid,
          usename as user_name,
          state,
          now() - xact_start as tx_age,
          left(query, 220) as query
        from pg_stat_activity
        where datname = current_database()
          and xact_start is not null
        order by xact_start asc
        limit 20
        `
      ),
      pool.query(
        `
        select
          a.pid,
          a.usename as user_name,
          now() - a.query_start as query_age,
          left(a.query, 220) as query
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
        where not l.granted
          and a.datname = current_database()
        order by a.query_start asc
        limit 20
        `
      ),
    ]);

    let statementStats = [];
    try {
      const hasPgStat = await pool.query(
        `
        select exists (
          select 1 from pg_extension where extname = 'pg_stat_statements'
        ) as enabled
        `
      );
      if (hasPgStat.rows?.[0]?.enabled) {
        const stats = await pool.query(
          `
          select
            left(query, 180) as query,
            calls,
            round((mean_exec_time)::numeric, 2) as mean_ms,
            round((total_exec_time)::numeric, 2) as total_ms,
            rows
          from pg_stat_statements
          order by total_exec_time desc
          limit 20
          `
        );
        statementStats = stats.rows;
      }
    } catch {
      statementStats = [];
    }

    return res.json({
      connection,
      pingMs,
      activity: activity.rows,
      longTransactions: longTx.rows,
      lockWaits: waits.rows,
      pgStatStatements: statementStats,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load diagnostics.",
    });
  }
});

// ─── /api/sql/locks ───

router.get("/api/sql/locks", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  try {
    const pool = getCustomerPool(req);
    const [lockChains, longTx, lockSummary] = await Promise.all([
      // Blocking chains: who blocks whom
      pool.query(`
        select
          blocked.pid as blocked_pid,
          blocked.usename as blocked_user,
          left(blocked.query, 300) as blocked_query,
          now() - blocked.query_start as blocked_duration,
          blocking.pid as blocking_pid,
          blocking.usename as blocking_user,
          left(blocking.query, 300) as blocking_query,
          now() - blocking.xact_start as blocking_tx_age,
          bl.locktype,
          bl.mode as blocked_mode
        from pg_locks bl
        join pg_stat_activity blocked on blocked.pid = bl.pid
        join pg_locks gl on gl.locktype = bl.locktype
          and gl.database is not distinct from bl.database
          and gl.relation is not distinct from bl.relation
          and gl.page is not distinct from bl.page
          and gl.tuple is not distinct from bl.tuple
          and gl.virtualxid is not distinct from bl.virtualxid
          and gl.transactionid is not distinct from bl.transactionid
          and gl.classid is not distinct from bl.classid
          and gl.objid is not distinct from bl.objid
          and gl.objsubid is not distinct from bl.objsubid
          and gl.pid != bl.pid
        join pg_stat_activity blocking on blocking.pid = gl.pid
        where not bl.granted
          and blocked.datname = current_database()
        order by blocking.xact_start asc
        limit 50
      `),
      // Long-running transactions (> 30s)
      pool.query(`
        select
          pid,
          usename as user_name,
          state,
          extract(epoch from (now() - xact_start))::numeric(10,1) as tx_seconds,
          extract(epoch from (now() - query_start))::numeric(10,1) as query_seconds,
          wait_event_type,
          wait_event,
          left(query, 300) as query
        from pg_stat_activity
        where datname = current_database()
          and xact_start is not null
          and now() - xact_start > interval '30 seconds'
        order by xact_start asc
        limit 30
      `),
      // Lock type summary
      pool.query(`
        select
          locktype,
          mode,
          granted,
          count(*)::int as count
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
        where a.datname = current_database()
        group by locktype, mode, granted
        order by count desc
        limit 50
      `),
    ]);

    return res.json({
      lockChains: lockChains.rows,
      longTransactions: longTx.rows,
      lockSummary: lockSummary.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load lock info.",
    });
  }
});

// ─── /api/sql/connection-inspector ───

router.get("/api/sql/connection-inspector", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const pool = getCustomerPool(req);
    const startedAt = Date.now();
    await pool.query("select 1");
    const pingMs = Date.now() - startedAt;

    const [connInfo, poolStats, dbStats, extensions, uptime] = await Promise.all([
      pool.query(`
        select
          current_database() as database_name,
          current_user as db_user,
          current_schema() as current_schema,
          version() as server_version,
          inet_server_addr() as server_addr,
          inet_server_port() as server_port
      `),
      pool.query(`
        select
          count(*)::int as total_connections,
          count(*) filter (where state = 'active')::int as active,
          count(*) filter (where state = 'idle')::int as idle,
          count(*) filter (where state = 'idle in transaction')::int as idle_in_transaction,
          count(*) filter (where wait_event_type is not null)::int as waiting
        from pg_stat_activity
        where datname = current_database()
      `),
      (() => {
        const hidden = getHiddenSchemas(req);
        const quoted = hidden.map(s => `'${s}'`).join(',');
        return pool.query(`
          select
            pg_database_size(current_database()) as db_size_bytes,
            (select setting::int from pg_settings where name = 'max_connections') as max_connections,
            (select setting from pg_settings where name = 'server_encoding') as server_encoding,
            (select setting from pg_settings where name = 'TimeZone') as timezone,
            (select count(*)::int from information_schema.tables where table_schema not in (${quoted})) as user_tables,
            (select count(*)::int from information_schema.schemata where schema_name not in (${quoted})) as user_schemas
        `);
      })(),
      pool.query(`select extname, extversion from pg_extension order by extname`),
      pool.query(`select pg_postmaster_start_time() as started_at, (now() - pg_postmaster_start_time())::text as uptime`),
    ]);

    const conn = connInfo.rows[0];
    const poolRow = poolStats.rows[0];
    const dbRow = dbStats.rows[0];
    const uptimeRow = uptime.rows[0];

    const nodePoolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    return res.json({
      connection: {
        database_name: conn.database_name,
        db_user: conn.db_user,
        current_schema: conn.current_schema,
        server_version: conn.server_version,
        server_addr: conn.server_addr,
        server_port: conn.server_port,
      },
      pingMs,
      pool: {
        total_connections: poolRow.total_connections,
        active: poolRow.active,
        idle: poolRow.idle,
        idle_in_transaction: poolRow.idle_in_transaction,
        waiting: poolRow.waiting,
        max_connections: dbRow.max_connections,
      },
      nodePool: nodePoolStats,
      database: {
        size_bytes: Number(dbRow.db_size_bytes),
        server_encoding: dbRow.server_encoding,
        timezone: dbRow.timezone,
        user_tables: dbRow.user_tables,
        user_schemas: dbRow.user_schemas,
      },
      uptime: {
        started_at: uptimeRow.started_at,
        uptime: uptimeRow.uptime,
      },
      extensions: extensions.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load connection inspector.",
    });
  }
});

// ─── /api/sql/autovacuum ───

router.get("/api/sql/autovacuum", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const pool = getCustomerPool(req);
    const [tableStats, settings] = await Promise.all([
      pool.query(`
        select
          schemaname as schema,
          relname as table_name,
          n_live_tup::bigint as live_tuples,
          n_dead_tup::bigint as dead_tuples,
          case when n_live_tup + n_dead_tup > 0
            then round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
            else 0
          end as dead_pct,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          vacuum_count::bigint as vacuum_count,
          autovacuum_count::bigint as autovacuum_count,
          analyze_count::bigint as analyze_count,
          autoanalyze_count::bigint as autoanalyze_count,
          pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) as total_size_bytes
        from pg_stat_user_tables
        order by n_dead_tup desc
        limit 100
      `),
      pool.query(`
        select name, setting, unit, short_desc
        from pg_settings
        where name like 'autovacuum%'
        order by name
      `),
    ]);

    return res.json({
      tables: tableStats.rows.map((r) => ({
        ...r,
        live_tuples: Number(r.live_tuples),
        dead_tuples: Number(r.dead_tuples),
        dead_pct: Number(r.dead_pct),
        total_size_bytes: Number(r.total_size_bytes),
        vacuum_count: Number(r.vacuum_count),
        autovacuum_count: Number(r.autovacuum_count),
        analyze_count: Number(r.analyze_count),
        autoanalyze_count: Number(r.autoanalyze_count),
      })),
      settings: settings.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load autovacuum stats.",
    });
  }
});

// ─── /api/sql/slow-queries ───

router.get("/api/sql/slow-queries", async (req, res) => {
  if (!getCustomerPool(req)) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const pool = getCustomerPool(req);
    const extCheck = await pool.query(
      `select exists (select 1 from pg_extension where extname = 'pg_stat_statements') as enabled`
    );
    const enabled = extCheck.rows[0]?.enabled === true;
    if (!enabled) {
      return res.json({ enabled: false, queries: [] });
    }
    const result = await pool.query(`
      select
        queryid,
        left(query, 500) as query,
        calls,
        round(mean_exec_time::numeric, 2) as mean_ms,
        round(max_exec_time::numeric, 2) as max_ms,
        round(min_exec_time::numeric, 2) as min_ms,
        round(total_exec_time::numeric, 2) as total_ms,
        round(stddev_exec_time::numeric, 2) as stddev_ms,
        rows,
        round((rows::numeric / nullif(calls, 0)), 2) as rows_per_call,
        round((shared_blks_hit::numeric / nullif(shared_blks_hit + shared_blks_read, 0) * 100), 1) as cache_hit_pct
      from pg_stat_statements
      where query not like '%pg_stat_statements%'
        and query not like '%pg_extension%'
      order by total_exec_time desc
      limit 50
    `);
    return res.json({ enabled: true, queries: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load slow queries." });
  }
});

// ─── /api/sql/advisors/security ───

router.get("/api/sql/advisors/security", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const pool = getCustomerPool(req);
    const [tablesWithoutRls, publicSchemaAcl] = await Promise.all([
      pool.query(
        `
        select
          n.nspname as schema_name,
          c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname not in ('pg_catalog', 'information_schema')
          and c.relrowsecurity = false
        order by n.nspname, c.relname
        `
      ),
      pool.query(
        `
        select
          nspname as schema_name,
          coalesce(array_to_string(nspacl, ','), '') as acl
        from pg_namespace
        where nspname = 'public'
        `
      ),
    ]);

    return res.json({
      tablesWithoutRls: tablesWithoutRls.rows,
      publicSchemaAcl: publicSchemaAcl.rows?.[0] || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load security advisor.",
    });
  }
});

// ─── /api/sql/advisors/performance ───

router.get("/api/sql/advisors/performance", async (req, res) => {
  if (!getCustomerPool(req)) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const pool = getCustomerPool(req);
    const [unusedIndexes, deadTuples] = await Promise.all([
      pool.query(
        `
        select
          schemaname as schema_name,
          relname as table_name,
          indexrelname as index_name,
          idx_scan
        from pg_stat_user_indexes
        where idx_scan = 0
        order by schemaname, relname, indexrelname
        limit 200
        `
      ),
      pool.query(
        `
        select
          schemaname as schema_name,
          relname as table_name,
          n_live_tup,
          n_dead_tup,
          round((100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0))::numeric, 2) as dead_pct
        from pg_stat_user_tables
        order by n_dead_tup desc
        limit 50
        `
      ),
    ]);

    return res.json({
      unusedIndexes: unusedIndexes.rows,
      deadTupleTables: deadTuples.rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load performance advisor.",
    });
  }
});

// ─── Query Performance (pg_stat_statements) ───

router.get("/api/performance/top-queries", async (req, res) => {
  const pool = req.tenantPool || getCustomerPool(req) || getPool();
  if (!pool) return res.status(500).json({ error: "No database connection" });
  try {
    // Check if pg_stat_statements extension is available
    const extCheck = await pool.query(
      `SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements' AND installed_version IS NOT NULL`
    );
    if (extCheck.rows.length === 0) {
      return res.json({ available: false, message: "pg_stat_statements extension is not installed. Enable it from Database > Extensions." });
    }

    const sort = req.query.sort || "total_time"; // total_time, calls, mean_time, rows, cache_hit
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    const validSorts = {
      total_time: "s.total_exec_time DESC",
      calls: "s.calls DESC",
      mean_time: "s.mean_exec_time DESC",
      rows: "s.rows DESC",
      cache_hit: "(s.shared_blks_hit::float / NULLIF(s.shared_blks_hit + s.shared_blks_read, 0)) ASC",
    };
    const orderBy = validSorts[sort] || validSorts.total_time;

    const result = await pool.query(`
      SELECT
        s.queryid,
        LEFT(s.query, 500) AS query,
        s.calls,
        round(s.total_exec_time::numeric, 2) AS total_time_ms,
        round(s.mean_exec_time::numeric, 2) AS mean_time_ms,
        round(s.min_exec_time::numeric, 2) AS min_time_ms,
        round(s.max_exec_time::numeric, 2) AS max_time_ms,
        round(s.stddev_exec_time::numeric, 2) AS stddev_time_ms,
        s.rows,
        s.shared_blks_hit,
        s.shared_blks_read,
        CASE WHEN (s.shared_blks_hit + s.shared_blks_read) > 0
          THEN round((s.shared_blks_hit::numeric / (s.shared_blks_hit + s.shared_blks_read)) * 100, 1)
          ELSE 100
        END AS cache_hit_pct,
        s.temp_blks_read,
        s.temp_blks_written
      FROM pg_stat_statements s
      JOIN pg_roles r ON s.userid = r.oid
      WHERE s.query NOT LIKE '%pg_stat_statements%'
        AND s.query NOT LIKE 'COMMIT%'
        AND s.query NOT LIKE 'BEGIN%'
        AND s.calls > 0
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);

    // Also get overall stats
    const statsResult = await pool.query(`
      SELECT
        count(*) AS total_tracked_queries,
        round(sum(total_exec_time)::numeric, 0) AS total_exec_time_ms,
        round(sum(calls)::numeric, 0) AS total_calls,
        round(avg(mean_exec_time)::numeric, 2) AS avg_mean_time_ms
      FROM pg_stat_statements
      WHERE calls > 0
    `);

    res.json({
      available: true,
      queries: result.rows,
      stats: statsResult.rows[0] || {},
      sort,
    });
  } catch (err) {
    if (err.message?.includes("pg_stat_statements")) {
      return res.json({ available: false, message: "pg_stat_statements extension is not installed." });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/performance/reset-stats", async (req, res) => {
  const pool = req.tenantPool || getCustomerPool(req) || getPool();
  if (!pool) return res.status(500).json({ error: "No database connection" });
  try {
    await pool.query("SELECT pg_stat_statements_reset()");
    res.json({ ok: true, message: "Query statistics reset" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/migrations ───

router.get("/api/migrations/status", async (_req, res) => {
  if (!getPool() || !getActiveDatabaseUrl()) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const [files, applied] = await Promise.all([listMigrationFiles(), getAppliedMigrations()]);
    const appliedMap = new Map(applied.map((row) => [String(row.base_name), row.run_on]));

    const migrations = files.map((name) => ({
      name,
      status: appliedMap.has(migrationBaseName(name)) ? "applied" : "pending",
      appliedAt: appliedMap.get(migrationBaseName(name))
        ? new Date(appliedMap.get(migrationBaseName(name))).toISOString()
        : null,
    }));

    return res.json({
      migrations,
      appliedCount: migrations.filter((item) => item.status === "applied").length,
      pendingCount: migrations.filter((item) => item.status === "pending").length,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load migration status.",
    });
  }
});

router.post("/api/migrations/up", adminMiddleware, async (_req, res) => {
  if (!getPool() || !getActiveDatabaseUrl()) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }

  try {
    const beforeApplied = await getAppliedMigrations();
    const result = await runNodePgMigrate(["--migrations-dir", MIGRATIONS_DIR, "up"], getActiveDatabaseUrl());
    const [files, applied] = await Promise.all([listMigrationFiles(), getAppliedMigrations()]);
    const beforeSet = new Set(beforeApplied.map((row) => String(row.base_name)));
    const appliedSet = new Set(applied.map((row) => String(row.base_name)));
    const pendingCount = files.filter((name) => !appliedSet.has(migrationBaseName(name))).length;
    const newlyApplied = applied
      .filter((row) => !beforeSet.has(String(row.base_name)))
      .map((row) => String(row.name));

    return res.json({
      ok: true,
      summary: newlyApplied.length
        ? `Applied ${newlyApplied.length} migration(s).`
        : "No pending migrations to apply.",
      appliedNow: newlyApplied,
      pendingCount,
      // Keep raw logs optional for debugging; UI can ignore this by default.
      rawOutput: (result.stdout || result.stderr || "").slice(0, 12000),
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to run pending migrations.",
    });
  }
});

router.post("/api/migrations/create", adminMiddleware, async (req, res) => {
  const rawName = String(req.body?.name || "").trim();
  const migrationName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!migrationName || migrationName.length < 3) {
    return res.status(400).json({
      error: "Provide a migration name with at least 3 characters (letters, numbers, hyphen).",
    });
  }

  try {
    const result = await runNodePgMigrate(
      [
        "--migrations-dir",
        MIGRATIONS_DIR,
        "--migration-file-language",
        "sql",
        "create",
        migrationName,
      ],
      null
    );
    const files = await listMigrationFiles();
    const created = files.filter((name) => name.includes(migrationName)).slice(-1)[0] || null;
    return res.status(201).json({
      ok: true,
      name: migrationName,
      file: created,
      summary: created ? `Created ${created}` : "Migration file created.",
      rawOutput: (result.stdout || result.stderr || "").slice(0, 4000),
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create migration file.",
    });
  }
});

// ─── /api/sql/saved-queries ───

router.get("/api/sql/saved-queries", async (req, res) => {
  if (!getPool()) {
    return res.status(400).json({ error: "DATABASE_URL is not set." });
  }
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await getPool().query(
      `select id, name, sql_text, tags, created_at, updated_at
       from truss_internal.saved_queries
       where tenant_id = $1
       order by updated_at desc, created_at desc`,
      [tenantId]
    );
    const queries = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sql: row.sql_text,
      tags: row.tags || [],
      createdAt: row.created_at,
    }));
    return res.json({ queries });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load saved queries.",
    });
  }
});

router.post("/api/sql/saved-queries", async (req, res) => {
  if (!getPool()) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  const name = String(req.body?.name || "").trim();
  const sqlText = String(req.body?.sql || "").trim();
  if (!name || !sqlText) {
    return res.status(400).json({ error: "name and sql are required." });
  }
  // Limit query text size to 100KB
  if (sqlText.length > 100000) {
    return res.status(400).json({ error: "Query text too large (max 100KB)." });
  }
  try {
    const tenantId = req.tenant?.id || null;
    // Limit saved queries per tenant to 100
    const countResult = await getPool().query(
      'SELECT count(*) FROM truss_internal.saved_queries WHERE tenant_id = $1',
      [tenantId]
    );
    if (Number(countResult.rows[0].count) >= 100) {
      return res.status(403).json({ error: "Saved query limit reached (100). Delete some to save new ones.", code: "QUOTA_EXCEEDED" });
    }
    const result = await getPool().query(
      `insert into truss_internal.saved_queries (id, name, sql_text, tags, created_by, created_at, updated_at, tenant_id)
       values (gen_random_uuid()::text, $1, $2, $3, 'truss-console', now(), now(), $4)
       returning id, name, sql_text, tags, created_at`,
      [name, sqlText, Array.isArray(req.body?.tags) ? req.body.tags : [], tenantId]
    );
    const row = result.rows[0];
    return res.status(201).json({
      query: { id: row.id, name: row.name, sql: row.sql_text, tags: row.tags || [], createdAt: row.created_at },
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create saved query.",
    });
  }
});

router.delete("/api/sql/saved-queries/:id", async (req, res) => {
  if (!getPool()) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }
  try {
    const tenantId = req.tenant?.id || null;
    await getPool().query(`delete from truss_internal.saved_queries where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to delete saved query.",
    });
  }
});

router.patch("/api/sql/saved-queries/:id", async (req, res) => {
  if (!getPool()) {
    return res.status(500).json({ error: "DATABASE_URL is not set." });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }
  try {
    const tenantId = req.tenant?.id || null;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    await getPool().query(
      `update truss_internal.saved_queries set tags = $1, updated_at = now() where id = $2 and tenant_id = $3`,
      [tags, id, tenantId]
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update saved query.",
    });
  }
});
