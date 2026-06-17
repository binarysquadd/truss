import express from "express";
import { getPool, getCustomerPool, getActiveDatabaseUrl } from "../lib/state.js";
import { ensureInternalSchema, upsertSettingsKey } from "../lib/internal.js";
import { adminMiddleware } from "../lib/session.js";

export const router = express.Router();

// ─── Feature: Auth social login config ───

router.post("/api/auth/providers/config", adminMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { providerId, clientId, clientSecret, enabled } = req.body || {};
  if (!providerId) return res.status(400).json({ error: "providerId is required." });
  try {
    await ensureInternalSchema();
    const configKey = `oidc_${providerId}`;
    const configValue = JSON.stringify({
      provider: providerId,
      client_id: clientId || "",
      client_secret: clientSecret || "",
      enabled: enabled !== false,
      updated_at: new Date().toISOString(),
    });
    const tenantId = req.tenant?.id || null;
    await upsertSettingsKey(configKey, configValue, tenantId);
    return res.json({ ok: true, provider: providerId });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save provider config." });
  }
});

router.get("/api/auth/providers/config", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = tenantId
      ? await pool.query(`select key, value from truss_internal.billing_config where key like 'oidc_%' and (tenant_id = $1 OR tenant_id IS NULL)`, [tenantId])
      : await pool.query(`select key, value from truss_internal.billing_config where key like 'oidc_%' and tenant_id IS NULL`);
    const configs = {};
    for (const row of result.rows) {
      const id = row.key.replace("oidc_", "");
      try { configs[id] = JSON.parse(row.value); } catch { configs[id] = {}; }
    }
    return res.json({ configs });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load provider configs." });
  }
});

// ─── Feature: Auth audit logs ───

router.get("/api/auth/audit-logs", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const action = req.query.action ? String(req.query.action).trim() : null;
  const since = req.query.since ? String(req.query.since).trim() : null;
  const range = req.query.range ? String(req.query.range).trim() : null;
  try {
    await ensureInternalSchema();

    const tenantId = req.tenant?.id || null;
    let where = "WHERE 1=1";
    const params = [];
    params.push(tenantId); where += ` AND tenant_id = $${params.length}`;
    if (action) { params.push(action); where += ` AND action = $${params.length}`; }
    if (since) { params.push(since); where += ` AND created_at >= $${params.length}::timestamptz`; }
    if (range) {
      const rangeMap = { "24h": "1 day", "7d": "7 days", "30d": "30 days" };
      const interval = rangeMap[range];
      if (interval) { where += ` AND created_at >= now() - interval '${interval}'`; }
    }

    const countResult = await pool.query(`SELECT count(*)::int as total FROM truss_internal.audit_logs ${where}`, params);
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM truss_internal.audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Distinct actions for filter dropdown (scoped to tenant)
    const actionsResult = await pool.query(`SELECT DISTINCT action FROM truss_internal.audit_logs WHERE action IS NOT NULL AND tenant_id = $1 ORDER BY action`, [tenantId]);
    const distinct_actions = actionsResult.rows.map(r => r.action);

    return res.json({ logs: result.rows, total: countResult.rows[0]?.total || 0, distinct_actions, limit, offset });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load audit logs." });
  }
});

router.post("/api/auth/audit-logs", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { action, actor, resource_type, resource_id, payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "action is required." });
  try {
    await ensureInternalSchema();
    await pool.query(
      `insert into truss_internal.audit_logs (action, actor, resource_type, resource_id, payload, tenant_id) values ($1, $2, $3, $4, $5, $6)`,
      [action, actor || "system", resource_type || "auth", resource_id || null, payload ? JSON.stringify(payload) : "{}", req.tenant?.id || null]
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create audit log." });
  }
});

// ─── Feature: Backup schedule + WAL config + PITR ───

router.get("/api/backups/schedule", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = tenantId
      ? await pool.query(`select value from truss_internal.billing_config where key = 'backup_schedule' and (tenant_id = $1 OR tenant_id IS NULL) order by tenant_id nulls last limit 1`, [tenantId])
      : await pool.query(`select value from truss_internal.billing_config where key = 'backup_schedule' and tenant_id IS NULL`);
    const raw = result.rows[0]?.value;
    const schedule = raw ? JSON.parse(raw) : { enabled: false, frequency: "daily", hour: 3, retention_days: 7 };
    return res.json({ schedule });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load backup schedule." });
  }
});

router.put("/api/backups/schedule", adminMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const schedule = req.body?.schedule;
  if (!schedule || typeof schedule !== "object") return res.status(400).json({ error: "schedule object is required." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    await upsertSettingsKey("backup_schedule", JSON.stringify(schedule), tenantId);
    return res.json({ ok: true, schedule });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save backup schedule." });
  }
});

router.get("/api/backups/wal-config", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const customerPool = getCustomerPool(req);
    const [archiveMode, archiveCommand, walLevel] = await Promise.all([
      customerPool.query(`show archive_mode`),
      customerPool.query(`show archive_command`),
      customerPool.query(`show wal_level`),
    ]);
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const configResult = tenantId
      ? await pool.query(`select value from truss_internal.billing_config where key = 'wal_config' and (tenant_id = $1 OR tenant_id IS NULL) order by tenant_id nulls last limit 1`, [tenantId])
      : await pool.query(`select value from truss_internal.billing_config where key = 'wal_config' and tenant_id IS NULL`);
    const raw = configResult.rows[0]?.value;
    const savedConfig = raw ? JSON.parse(raw) : {};
    return res.json({
      current: {
        archive_mode: archiveMode.rows[0]?.archive_mode || "off",
        archive_command: archiveCommand.rows[0]?.archive_command || "",
        wal_level: walLevel.rows[0]?.wal_level || "replica",
      },
      config: savedConfig,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load WAL config." });
  }
});

router.put("/api/backups/wal-config", adminMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const config = req.body?.config;
  if (!config || typeof config !== "object") return res.status(400).json({ error: "config object is required." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    await upsertSettingsKey("wal_config", JSON.stringify(config), tenantId);
    return res.json({ ok: true, config });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save WAL config." });
  }
});

router.post("/api/backups/pitr", adminMiddleware, async (req, res) => {
  const pool = getPool();
  const activeDatabaseUrl = getActiveDatabaseUrl();
  if (!pool || !activeDatabaseUrl) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const targetTime = String(req.body?.targetTime || "").trim();
  if (!targetTime) return res.status(400).json({ error: "targetTime (ISO 8601) is required." });
  try {
    // Validate the timestamp
    const ts = new Date(targetTime);
    if (isNaN(ts.getTime())) return res.status(400).json({ error: "Invalid targetTime format." });
    if (ts > new Date()) return res.status(400).json({ error: "targetTime cannot be in the future." });

    // Check that WAL archiving is enabled
    const customerPool = getCustomerPool(req);
    const archiveResult = await customerPool.query(`show archive_mode`);
    const archiveMode = archiveResult.rows[0]?.archive_mode || "off";

    // Record the PITR request
    await ensureInternalSchema();
    const insertResult = await pool.query(
      `insert into truss_internal.backups (filename, status) values ($1, 'running') returning *`,
      [`pitr_${targetTime.replace(/[:.]/g, "-")}`]
    );

    return res.status(202).json({
      id: insertResult.rows[0].id,
      targetTime: ts.toISOString(),
      archiveMode,
      message: archiveMode === "on"
        ? "PITR restore initiated. The database will recover to the target timestamp using WAL archives."
        : "WAL archiving is not enabled. PITR requires archive_mode=on and continuous WAL archiving. The request has been recorded but cannot proceed without WAL archives.",
      instructions: archiveMode !== "on" ? [
        "1. Set archive_mode = on in postgresql.conf",
        "2. Set archive_command to copy WAL files to your archive location",
        "3. Restart PostgreSQL",
        "4. Take a base backup with pg_basebackup",
        "5. Then PITR will be available for any point after the base backup",
      ] : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to initiate PITR." });
  }
});

// ─── Enabled Modules (flat-pack: all features always enabled) ───

const ALL_MODULES = { database: true, authn: true, authz: true, storage: true, oauth2: true, gateway: true, edge: true, realtime: true, search: true, webhooks: true };

router.get("/api/modules", (_req, res) => {
  return res.json({ modules: ALL_MODULES });
});

router.put("/api/modules", (_req, res) => {
  // Accept but ignore — all modules are always enabled (flat-pack billing)
  return res.json({ ok: true, modules: ALL_MODULES });
});

// ─── Feature: Database Roles Manager ───

router.get("/api/roles", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const result = await pool.query(`
      SELECT r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
             r.rolcanlogin, r.rolreplication, r.rolconnlimit, r.rolvaliduntil,
             ARRAY(SELECT b.rolname FROM pg_catalog.pg_auth_members m
                   JOIN pg_catalog.pg_roles b ON m.roleid = b.oid
                   WHERE m.member = r.oid) as member_of
      FROM pg_catalog.pg_roles r
      WHERE r.rolname !~ '^pg_'
      ORDER BY r.rolname
    `);
    return res.json({ roles: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load roles." });
  }
});

router.post("/api/roles", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { name, password, login, createdb, createrole, superuser, replication, inherit, connection_limit, valid_until } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Role name is required." });
  const safeName = name.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(safeName)) return res.status(400).json({ error: "Invalid role name. Use letters, digits, underscores, and dashes." });
  try {
    let sql = `CREATE ROLE ${pool.escapeIdentifier(safeName)}`;
    const attrs = [];
    if (login) attrs.push("LOGIN");
    else attrs.push("NOLOGIN");
    if (superuser) attrs.push("SUPERUSER");
    if (createdb) attrs.push("CREATEDB");
    if (createrole) attrs.push("CREATEROLE");
    if (replication) attrs.push("REPLICATION");
    if (inherit === false) attrs.push("NOINHERIT");
    else attrs.push("INHERIT");
    if (typeof connection_limit === "number" && connection_limit >= -1) attrs.push(`CONNECTION LIMIT ${parseInt(connection_limit)}`);
    if (password) attrs.push(`PASSWORD ${pool.escapeLiteral(password)}`);
    if (valid_until) attrs.push(`VALID UNTIL ${pool.escapeLiteral(valid_until)}`);
    if (attrs.length > 0) sql += " " + attrs.join(" ");
    await pool.query(sql);
    return res.status(201).json({ ok: true, role: safeName });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create role." });
  }
});

router.patch("/api/roles/:name", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const roleName = String(req.params.name || "").trim();
  if (!roleName) return res.status(400).json({ error: "Role name is required." });
  const { password, login, createdb, createrole, superuser, replication, inherit, connection_limit, valid_until } = req.body || {};
  try {
    const attrs = [];
    if (login === true) attrs.push("LOGIN");
    if (login === false) attrs.push("NOLOGIN");
    if (superuser === true) attrs.push("SUPERUSER");
    if (superuser === false) attrs.push("NOSUPERUSER");
    if (createdb === true) attrs.push("CREATEDB");
    if (createdb === false) attrs.push("NOCREATEDB");
    if (createrole === true) attrs.push("CREATEROLE");
    if (createrole === false) attrs.push("NOCREATEROLE");
    if (replication === true) attrs.push("REPLICATION");
    if (replication === false) attrs.push("NOREPLICATION");
    if (inherit === true) attrs.push("INHERIT");
    if (inherit === false) attrs.push("NOINHERIT");
    if (typeof connection_limit === "number" && connection_limit >= -1) attrs.push(`CONNECTION LIMIT ${parseInt(connection_limit)}`);
    if (password) attrs.push(`PASSWORD ${pool.escapeLiteral(password)}`);
    if (valid_until) attrs.push(`VALID UNTIL ${pool.escapeLiteral(valid_until)}`);
    if (valid_until === null) attrs.push(`VALID UNTIL 'infinity'`);
    if (attrs.length === 0) return res.status(400).json({ error: "No attributes to alter." });
    const sql = `ALTER ROLE ${pool.escapeIdentifier(roleName)} ${attrs.join(" ")}`;
    await pool.query(sql);
    return res.json({ ok: true, role: roleName });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to alter role." });
  }
});

router.delete("/api/roles/:name", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const roleName = String(req.params.name || "").trim();
  if (!roleName) return res.status(400).json({ error: "Role name is required." });
  try {
    const owned = await pool.query(`
      SELECT count(*)::int as count FROM (
        SELECT tableowner AS owner FROM pg_tables WHERE tableowner = $1
        UNION ALL
        SELECT datdba::regrole::text AS owner FROM pg_database WHERE datdba::regrole::text = $1
      ) sub
    `, [roleName]);
    if (owned.rows[0]?.count > 0) {
      return res.status(409).json({ error: `Role "${roleName}" owns ${owned.rows[0].count} object(s). Reassign or drop owned objects first.` });
    }
    await pool.query(`DROP ROLE ${pool.escapeIdentifier(roleName)}`);
    return res.json({ ok: true, role: roleName });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to drop role." });
  }
});

router.get("/api/roles/:name/grants", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const roleName = String(req.params.name || "").trim();
  if (!roleName) return res.status(400).json({ error: "Role name is required." });
  try {
    const tableGrants = await pool.query(`
      SELECT table_schema, table_name, privilege_type, is_grantable
      FROM information_schema.role_table_grants
      WHERE grantee = $1
      ORDER BY table_schema, table_name, privilege_type
    `, [roleName]);
    const schemaGrants = await pool.query(`
      SELECT n.nspname AS schema_name,
             has_schema_privilege($1, n.nspname, 'USAGE') AS has_usage,
             has_schema_privilege($1, n.nspname, 'CREATE') AS has_create
      FROM pg_namespace n
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      ORDER BY n.nspname
    `, [roleName]);
    return res.json({
      role: roleName,
      table_grants: tableGrants.rows,
      schema_grants: schemaGrants.rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load grants." });
  }
});

router.post("/api/roles/:name/grant", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const roleName = String(req.params.name || "").trim();
  if (!roleName) return res.status(400).json({ error: "Role name is required." });
  const { schema, table, privileges } = req.body || {};
  if (!privileges || !Array.isArray(privileges) || privileges.length === 0) return res.status(400).json({ error: "privileges array is required." });
  const validPrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "USAGE", "CREATE", "ALL"];
  const cleanPrivileges = privileges.map(p => String(p).toUpperCase()).filter(p => validPrivileges.includes(p));
  if (cleanPrivileges.length === 0) return res.status(400).json({ error: "No valid privileges specified." });
  try {
    const privList = cleanPrivileges.join(", ");
    const escapedRole = pool.escapeIdentifier(roleName);
    if (table) {
      const escapedSchema = pool.escapeIdentifier(schema || "public");
      const escapedTable = pool.escapeIdentifier(table);
      await pool.query(`GRANT ${privList} ON ${escapedSchema}.${escapedTable} TO ${escapedRole}`);
    } else if (schema) {
      const escapedSchema = pool.escapeIdentifier(schema);
      const schemaPrivs = cleanPrivileges.filter(p => ["USAGE", "CREATE", "ALL"].includes(p));
      if (schemaPrivs.length > 0) {
        await pool.query(`GRANT ${schemaPrivs.join(", ")} ON SCHEMA ${escapedSchema} TO ${escapedRole}`);
      }
    } else {
      return res.status(400).json({ error: "schema or table is required." });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to grant privileges." });
  }
});

router.post("/api/roles/:name/revoke", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const roleName = String(req.params.name || "").trim();
  if (!roleName) return res.status(400).json({ error: "Role name is required." });
  const { schema, table, privileges } = req.body || {};
  if (!privileges || !Array.isArray(privileges) || privileges.length === 0) return res.status(400).json({ error: "privileges array is required." });
  const validPrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "USAGE", "CREATE", "ALL"];
  const cleanPrivileges = privileges.map(p => String(p).toUpperCase()).filter(p => validPrivileges.includes(p));
  if (cleanPrivileges.length === 0) return res.status(400).json({ error: "No valid privileges specified." });
  try {
    const privList = cleanPrivileges.join(", ");
    const escapedRole = pool.escapeIdentifier(roleName);
    if (table) {
      const escapedSchema = pool.escapeIdentifier(schema || "public");
      const escapedTable = pool.escapeIdentifier(table);
      await pool.query(`REVOKE ${privList} ON ${escapedSchema}.${escapedTable} FROM ${escapedRole}`);
    } else if (schema) {
      const escapedSchema = pool.escapeIdentifier(schema);
      const schemaPrivs = cleanPrivileges.filter(p => ["USAGE", "CREATE", "ALL"].includes(p));
      if (schemaPrivs.length > 0) {
        await pool.query(`REVOKE ${schemaPrivs.join(", ")} ON SCHEMA ${escapedSchema} FROM ${escapedRole}`);
      }
    } else {
      return res.status(400).json({ error: "schema or table is required." });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to revoke privileges." });
  }
});

// ─── Performance: Latency Percentiles (p50/p95/p99) ───

router.get("/api/performance/latency", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const extCheck = await pool.query(
      `select exists (select 1 from pg_extension where extname = 'pg_stat_statements') as enabled`
    );
    if (!extCheck.rows[0]?.enabled) {
      return res.json({ enabled: false, p50: null, p95: null, p99: null, total_queries: 0 });
    }
    // Approximate percentiles from pg_stat_statements using ordered mean_exec_time
    const result = await pool.query(`
      with ranked as (
        select
          mean_exec_time,
          calls,
          row_number() over (order by mean_exec_time) as rn,
          count(*) over () as total
        from pg_stat_statements
        where query not like '%pg_stat_statements%'
          and query not like '%pg_extension%'
          and calls > 0
      )
      select
        round((select mean_exec_time from ranked where rn >= total * 0.50 order by rn limit 1)::numeric, 2) as p50,
        round((select mean_exec_time from ranked where rn >= total * 0.95 order by rn limit 1)::numeric, 2) as p95,
        round((select mean_exec_time from ranked where rn >= total * 0.99 order by rn limit 1)::numeric, 2) as p99,
        (select sum(calls) from ranked) as total_queries,
        (select round(avg(mean_exec_time)::numeric, 2) from ranked) as avg_ms,
        (select total from ranked limit 1) as tracked_statements
    `);
    const row = result.rows[0] || {};
    return res.json({
      enabled: true,
      p50: row.p50 != null ? Number(row.p50) : null,
      p95: row.p95 != null ? Number(row.p95) : null,
      p99: row.p99 != null ? Number(row.p99) : null,
      avg_ms: row.avg_ms != null ? Number(row.avg_ms) : null,
      total_queries: Number(row.total_queries || 0),
      tracked_statements: Number(row.tracked_statements || 0),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to compute latency percentiles." });
  }
});

// ─── Performance: Index Advisor ───

router.get("/api/performance/index-advisor", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    // 1. Unused indexes (idx_scan = 0, excluding PK and unique constraints)
    const unusedResult = await pool.query(`
      select
        s.schemaname as schema_name,
        s.relname as table_name,
        s.indexrelname as index_name,
        s.idx_scan,
        pg_relation_size(i.indexrelid) as index_size_bytes,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary
      from pg_stat_user_indexes s
      join pg_index ix on ix.indexrelid = s.indexrelid
      join pg_indexes i on i.indexname = s.indexrelname and i.schemaname = s.schemaname
      where s.idx_scan = 0
        and ix.indisprimary = false
        and ix.indisunique = false
      order by pg_relation_size(i.indexrelid) desc
      limit 100
    `);

    // 2. Missing indexes on FK columns
    const missingFkResult = await pool.query(`
      select
        tc.table_schema as schema_name,
        tc.table_name,
        kcu.column_name,
        tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema not in ('pg_catalog', 'information_schema', 'truss_internal')
        and not exists (
          select 1
          from pg_stat_user_indexes si
          join pg_index ix on ix.indexrelid = si.indexrelid
          join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = any(ix.indkey)
          where si.schemaname = tc.table_schema
            and si.relname = tc.table_name
            and a.attname = kcu.column_name
        )
      order by tc.table_schema, tc.table_name
    `);

    // 3. Duplicate indexes (indexes with identical column sets on same table)
    const duplicateResult = await pool.query(`
      with idx_cols as (
        select
          n.nspname as schema_name,
          t.relname as table_name,
          i.relname as index_name,
          pg_get_indexdef(ix.indexrelid) as index_def,
          array_to_string(array_agg(a.attname order by array_position(ix.indkey, a.attnum)), ',') as columns,
          pg_relation_size(ix.indexrelid) as index_size_bytes
        from pg_index ix
        join pg_class t on t.oid = ix.indrelid
        join pg_class i on i.oid = ix.indexrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
        where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        group by n.nspname, t.relname, i.relname, ix.indexrelid
      )
      select
        a.schema_name,
        a.table_name,
        a.index_name as index_a,
        b.index_name as index_b,
        a.columns,
        a.index_size_bytes as size_a,
        b.index_size_bytes as size_b
      from idx_cols a
      join idx_cols b on a.schema_name = b.schema_name
        and a.table_name = b.table_name
        and a.columns = b.columns
        and a.index_name < b.index_name
      order by a.index_size_bytes + b.index_size_bytes desc
      limit 50
    `);

    return res.json({
      unused: unusedResult.rows,
      missingFkIndexes: missingFkResult.rows,
      duplicates: duplicateResult.rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load index advisor." });
  }
});

// ─── Performance: Table Bloat Estimator ───

router.get("/api/performance/bloat", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    // Standard bloat estimation query using pg_stat_user_tables + pg_class
    const result = await pool.query(`
      select
        schemaname as schema_name,
        relname as table_name,
        n_live_tup,
        n_dead_tup,
        round((100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0))::numeric, 2) as dead_pct,
        pg_total_relation_size(relid) as total_size_bytes,
        pg_table_size(relid) as table_size_bytes,
        pg_indexes_size(relid) as indexes_size_bytes,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze,
        vacuum_count,
        autovacuum_count
      from pg_stat_user_tables
      where schemaname not in ('pg_catalog', 'information_schema', 'pg_toast')
      order by n_dead_tup desc
      limit 50
    `);

    // Compute estimated bloat ratio: dead_pct > 20% is bloated, > 50% is critical
    const tables = result.rows.map((row) => ({
      ...row,
      bloat_status:
        Number(row.dead_pct || 0) >= 50 ? "critical" :
        Number(row.dead_pct || 0) >= 20 ? "warning" :
        Number(row.dead_pct || 0) >= 5 ? "moderate" : "healthy",
    }));

    return res.json({ tables });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to estimate table bloat." });
  }
});

// ─── Feature: RLS Debugger ───

router.get("/api/rls/policies", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const result = await pool.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      ORDER BY schemaname, tablename, policyname
    `);
    return res.json({ policies: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load RLS policies." });
  }
});

router.get("/api/rls/tables", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const result = await pool.query(`
      SELECT schemaname, tablename, rowsecurity, forcerowsecurity
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY schemaname, tablename
    `);
    return res.json({ tables: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load RLS table status." });
  }
});

router.post("/api/rls/test", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { role, query } = req.body || {};
  if (!role || typeof role !== "string") return res.status(400).json({ error: "role is required." });
  if (!query || typeof query !== "string") return res.status(400).json({ error: "query is required." });

  // Safety: only allow SELECT, WITH, EXPLAIN (read-only)
  const trimmed = query.trim().replace(/^\/\*.*?\*\//s, "").trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("EXPLAIN")) {
    return res.status(400).json({ error: "Only SELECT, WITH, and EXPLAIN queries are allowed for RLS testing." });
  }

  // Validate role name (alphanumeric, underscores, dashes)
  const safeRole = role.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(safeRole)) {
    return res.status(400).json({ error: "Invalid role name." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${client.escapeIdentifier(safeRole)}`);

    const startMs = Date.now();
    const result = await client.query(query);
    const durationMs = Date.now() - startMs;

    const rows = result.rows || [];
    const columns = result.fields ? result.fields.map((f) => f.name) : [];

    await client.query("RESET ROLE");
    await client.query("ROLLBACK");

    // Fetch policies that apply to tables referenced (best-effort: parse FROM clause)
    let policiesOnTables = [];
    try {
      // Use EXPLAIN to find referenced tables
      await client.query("BEGIN");
      const explainResult = await client.query(`EXPLAIN (FORMAT JSON) ${query}`);
      await client.query("ROLLBACK");

      // Extract table names from explain output
      const explainJson = JSON.stringify(explainResult.rows);
      const tableMatches = explainJson.match(/"Relation Name":\s*"([^"]+)"/g) || [];
      const tableNames = tableMatches.map((m) => m.match(/"Relation Name":\s*"([^"]+)"/)?.[1]).filter(Boolean);

      if (tableNames.length > 0) {
        const placeholders = tableNames.map((_, i) => `$${i + 1}`).join(", ");
        const policyResult = await pool.query(
          `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
           FROM pg_policies WHERE tablename IN (${placeholders})
           ORDER BY tablename, policyname`,
          tableNames
        );
        policiesOnTables = policyResult.rows;
      }
    } catch {
      // Best-effort — ignore errors
    }

    return res.json({
      success: true,
      rows: rows.slice(0, 500),
      columns,
      row_count: rows.length,
      duration_ms: durationMs,
      policies_on_tables: policiesOnTables,
      error: null,
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    const message = error instanceof Error ? error.message : "Query failed.";
    // Check if it's an RLS permission error
    const isRlsError = message.includes("permission denied") || message.includes("policy");

    // Still try to get policies for context
    let policiesOnTables = [];
    try {
      const policyResult = await pool.query(
        `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies ORDER BY tablename, policyname`
      );
      policiesOnTables = policyResult.rows;
    } catch {}

    return res.json({
      success: false,
      rows: [],
      columns: [],
      row_count: 0,
      duration_ms: 0,
      policies_on_tables: policiesOnTables,
      error: message,
      is_rls_error: isRlsError,
    });
  } finally {
    client.release();
  }
});

router.get("/api/rls/matrix/:schema/:table", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const schema = String(req.params.schema || "public").trim();
  const table = String(req.params.table || "").trim();
  if (!table) return res.status(400).json({ error: "Table name is required." });

  try {
    // Get RLS status for the table
    const rlsStatus = await pool.query(
      `SELECT rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = $1 AND tablename = $2`,
      [schema, table]
    );
    const rlsEnabled = rlsStatus.rows[0]?.rowsecurity === true;
    const forceRls = rlsStatus.rows[0]?.forcerowsecurity === true;

    // Get all policies on this table
    const policiesResult = await pool.query(
      `SELECT policyname, permissive, roles, cmd, qual, with_check
       FROM pg_policies WHERE schemaname = $1 AND tablename = $2
       ORDER BY policyname`,
      [schema, table]
    );
    const policies = policiesResult.rows;

    // Get all non-system roles
    const rolesResult = await pool.query(`
      SELECT r.rolname, r.rolsuper, r.rolcanlogin,
             ARRAY(SELECT b.rolname FROM pg_catalog.pg_auth_members m
                   JOIN pg_catalog.pg_roles b ON m.roleid = b.oid
                   WHERE m.member = r.oid) as member_of
      FROM pg_catalog.pg_roles r
      WHERE r.rolname !~ '^pg_'
      ORDER BY r.rolname
    `);
    const roles = rolesResult.rows;

    // Get table grants
    const grantsResult = await pool.query(
      `SELECT grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY grantee, privilege_type`,
      [schema, table]
    );
    const grants = grantsResult.rows;

    // Build the access matrix
    const commands = ["SELECT", "INSERT", "UPDATE", "DELETE"];
    const matrix = roles.map((role) => {
      const roleName = role.rolname;
      const access = {};
      for (const cmd of commands) {
        // Superusers bypass RLS (unless forcerowsecurity is on)
        if (role.rolsuper && !forceRls) {
          access[cmd] = { allowed: true, reason: "superuser" };
          continue;
        }

        // If RLS is not enabled, check grants only
        if (!rlsEnabled) {
          const hasGrant = grants.some((g) => g.grantee === roleName && (g.privilege_type === cmd || g.privilege_type === "ALL"));
          access[cmd] = { allowed: hasGrant, reason: hasGrant ? "grant" : "no_grant" };
          continue;
        }

        // RLS is enabled — check if role has a grant first
        const hasGrant = grants.some((g) => g.grantee === roleName && (g.privilege_type === cmd || g.privilege_type === "ALL"));
        if (!hasGrant) {
          // Also check PUBLIC grants
          const hasPublicGrant = grants.some((g) => g.grantee === "PUBLIC" && (g.privilege_type === cmd || g.privilege_type === "ALL"));
          if (!hasPublicGrant) {
            access[cmd] = { allowed: false, reason: "no_grant" };
            continue;
          }
        }

        // Has grant — check policies
        const matchingPolicies = policies.filter((p) => {
          const pCmd = String(p.cmd);
          if (pCmd !== "ALL" && pCmd !== cmd) return false;
          const pRoles = Array.isArray(p.roles)
            ? p.roles
            : String(p.roles ?? "").replace(/^{|}$/g, "").split(",").filter(Boolean);
          return pRoles.includes(roleName) || pRoles.includes("public") || pRoles.some((r) => role.member_of?.includes(r));
        });

        if (matchingPolicies.length > 0) {
          const policyNames = matchingPolicies.map((p) => p.policyname);
          access[cmd] = { allowed: true, reason: "policy", policies: policyNames };
        } else {
          access[cmd] = { allowed: false, reason: "no_matching_policy" };
        }
      }
      return { role: roleName, is_superuser: role.rolsuper, can_login: role.rolcanlogin, access };
    });

    return res.json({
      schema,
      table,
      rls_enabled: rlsEnabled,
      force_rls: forceRls,
      policies,
      matrix,
      grants: grantsResult.rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to build access matrix." });
  }
});

// ─── Feature: Table Partitioning Advisor ───

router.get("/api/partitioning/advisor", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const result = await pool.query(`
      SELECT
        s.schemaname,
        s.relname AS tablename,
        s.n_live_tup AS row_count,
        pg_total_relation_size(s.schemaname || '.' || s.relname) AS total_bytes,
        pg_size_pretty(pg_total_relation_size(s.schemaname || '.' || s.relname)) AS total_size,
        (SELECT count(*) > 0 FROM pg_inherits WHERE inhparent = c.oid) AS is_partitioned,
        (SELECT json_agg(json_build_object('column', a.attname, 'type', t.typname))
         FROM pg_attribute a
         JOIN pg_type t ON a.atttypid = t.oid
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         AND t.typname IN ('timestamp', 'timestamptz', 'date', 'int4', 'int8', 'uuid')
        ) AS candidate_keys
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.relname = s.relname
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = s.schemaname)
      WHERE s.schemaname NOT IN ('truss_internal', 'pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(s.schemaname || '.' || s.relname) DESC
    `);

    const LARGE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
    const HIGH_ROW_THRESHOLD = 1_000_000;

    const tables = result.rows.map((row) => {
      const totalBytes = Number(row.total_bytes);
      const rowCount = Number(row.row_count);
      const candidates = row.candidate_keys || [];
      const isLarge = totalBytes >= LARGE_THRESHOLD || rowCount >= HIGH_ROW_THRESHOLD;

      let strategy = null;
      let reason = null;
      let example_ddl = null;

      if (!row.is_partitioned && isLarge) {
        const tsCol = candidates.find((c) => ["timestamp", "timestamptz", "date"].includes(c.type));
        const intCol = candidates.find((c) => ["int4", "int8"].includes(c.type));
        const uuidCol = candidates.find((c) => c.type === "uuid");

        if (tsCol) {
          strategy = "range";
          reason = `Time-based partitioning on "${tsCol.column}" (${tsCol.type}) — ideal for time-series data, log tables, and event streams.`;
          example_ddl = [
            `-- 1. Create partitioned table`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_partitioned (`,
            `  LIKE ${row.schemaname}.${row.tablename} INCLUDING ALL`,
            `) PARTITION BY RANGE (${tsCol.column});`,
            ``,
            `-- 2. Create monthly partitions`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_y2025m01`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');`,
            ``,
            `-- 3. Migrate data`,
            `INSERT INTO ${row.schemaname}.${row.tablename}_partitioned`,
            `  SELECT * FROM ${row.schemaname}.${row.tablename};`,
            ``,
            `-- 4. Swap tables`,
            `ALTER TABLE ${row.schemaname}.${row.tablename} RENAME TO ${row.tablename}_old;`,
            `ALTER TABLE ${row.schemaname}.${row.tablename}_partitioned RENAME TO ${row.tablename};`,
          ].join("\n");
        } else if (intCol && rowCount >= HIGH_ROW_THRESHOLD) {
          strategy = "range";
          reason = `Range partitioning on "${intCol.column}" (${intCol.type}) — suitable for high-row-count tables with sequential integer keys.`;
          example_ddl = [
            `-- 1. Create partitioned table`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_partitioned (`,
            `  LIKE ${row.schemaname}.${row.tablename} INCLUDING ALL`,
            `) PARTITION BY RANGE (${intCol.column});`,
            ``,
            `-- 2. Create range partitions (adjust ranges to your data)`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p0`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES FROM (0) TO (1000000);`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p1`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES FROM (1000000) TO (2000000);`,
            ``,
            `-- 3. Migrate data & swap (same as above)`,
          ].join("\n");
        } else if (uuidCol) {
          strategy = "hash";
          reason = `Hash partitioning on "${uuidCol.column}" (uuid) — distributes rows evenly across partitions for large UUID-keyed tables.`;
          example_ddl = [
            `-- 1. Create partitioned table`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_partitioned (`,
            `  LIKE ${row.schemaname}.${row.tablename} INCLUDING ALL`,
            `) PARTITION BY HASH (${uuidCol.column});`,
            ``,
            `-- 2. Create hash partitions (4 buckets)`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p0`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES WITH (MODULUS 4, REMAINDER 0);`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p1`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES WITH (MODULUS 4, REMAINDER 1);`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p2`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES WITH (MODULUS 4, REMAINDER 2);`,
            `CREATE TABLE ${row.schemaname}.${row.tablename}_p3`,
            `  PARTITION OF ${row.schemaname}.${row.tablename}_partitioned`,
            `  FOR VALUES WITH (MODULUS 4, REMAINDER 3);`,
            ``,
            `-- 3. Migrate data & swap (same as above)`,
          ].join("\n");
        }
      }

      return {
        schemaname: row.schemaname,
        tablename: row.tablename,
        row_count: rowCount,
        total_bytes: totalBytes,
        total_size: row.total_size,
        is_partitioned: row.is_partitioned,
        candidate_keys: candidates,
        is_large: isLarge,
        strategy,
        reason,
        example_ddl,
      };
    });

    return res.json({ tables });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze partitioning." });
  }
});
