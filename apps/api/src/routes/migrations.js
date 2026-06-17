import express from "express";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getCustomerPool, getActiveDatabaseUrl, MIGRATIONS_DIR } from "../lib/state.js";
import {
  listMigrationFiles,
  migrationBaseName,
  getAppliedMigrations,
  runNodePgMigrate,
} from "../lib/helpers.js";
import { adminMiddleware } from "../lib/session.js";

export const router = express.Router();

// Quote a SQL identifier safely (Postgres style: wrap in double quotes, escape embedded quotes).
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// ─── Feature: Migration safety checks + diff preview ───

router.post("/api/migrations/check", async (req, res) => {
  const pool = getCustomerPool(req);
  const activeDatabaseUrl = getActiveDatabaseUrl();
  if (!pool || !activeDatabaseUrl) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const [files, applied] = await Promise.all([listMigrationFiles(), getAppliedMigrations()]);
    const appliedSet = new Set(applied.map((r) => r.base_name));
    const pending = files.filter((f) => !appliedSet.has(migrationBaseName(f)));

    // Check for open locks
    const locksResult = await pool.query(`
      select count(*)::int as lock_count from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where not l.granted and a.datname = current_database()
    `);
    const lockCount = locksResult.rows[0]?.lock_count || 0;

    // Check for active transactions
    const txResult = await pool.query(`
      select count(*)::int as tx_count from pg_stat_activity
      where datname = current_database() and xact_start is not null
        and state != 'idle' and pid != pg_backend_pid()
    `);
    const activeTxCount = txResult.rows[0]?.tx_count || 0;

    // Current DB info
    const dbResult = await pool.query(`select current_database() as db, current_user as user_name`);
    const { db, user_name } = dbResult.rows[0];

    const warnings = [];
    if (lockCount > 0) warnings.push(`${lockCount} waiting lock(s) detected — migrations may block or be blocked.`);
    if (activeTxCount > 3) warnings.push(`${activeTxCount} active transactions — consider running migrations during low-traffic period.`);
    if (pending.length === 0) warnings.push("No pending migrations to apply.");

    return res.json({
      database: db,
      user: user_name,
      pendingCount: pending.length,
      pendingFiles: pending,
      lockCount,
      activeTxCount,
      warnings,
      safe: warnings.length === 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run safety checks." });
  }
});

router.get("/api/migrations/preview/:filename", async (req, res) => {
  const filename = String(req.params.filename || "").trim();
  if (!filename) return res.status(400).json({ error: "Filename is required." });
  // Sanitize: only allow files in the migrations directory
  const safeName = path.basename(filename);
  const filePath = path.join(MIGRATIONS_DIR, safeName);
  try {
    const content = await readFile(filePath, "utf-8");
    return res.json({ filename: safeName, content, lines: content.split("\n").length });
  } catch (error) {
    return res.status(404).json({ error: `Migration file not found: ${safeName}` });
  }
});

// ─── Feature: Idempotent Migration Runner ───

// Known migration tracking tables from popular frameworks
const KNOWN_TRACKING_TABLES = [
  { table: "pgmigrations", schema: "public", framework: "node-pg-migrate" },
  { table: "schema_migrations", schema: "public", framework: "golang-migrate / Tern / Atlas" },
  { table: "_migrations", schema: "public", framework: "Prisma" },
  { table: "knex_migrations", schema: "public", framework: "Knex.js" },
  { table: "knex_migrations_lock", schema: "public", framework: "Knex.js (lock)" },
  { table: "flyway_schema_history", schema: "public", framework: "Flyway" },
  { table: "__drizzle_migrations", schema: "drizzle", framework: "Drizzle ORM" },
  { table: "__drizzle_migrations", schema: "public", framework: "Drizzle ORM" },
  { table: "_sqlx_migrations", schema: "public", framework: "SQLx (Rust)" },
  { table: "alembic_version", schema: "public", framework: "Alembic (Python)" },
  { table: "django_migrations", schema: "public", framework: "Django" },
  { table: "ar_internal_metadata", schema: "public", framework: "Rails ActiveRecord" },
  { table: "schema_migrations", schema: "public", framework: "Rails ActiveRecord" },
  { table: "typeorm_metadata", schema: "public", framework: "TypeORM" },
  { table: "migrations", schema: "public", framework: "Laravel / Generic" },
  { table: "sequelize_meta", schema: "public", framework: "Sequelize" },
  { table: "SequelizeMeta", schema: "public", framework: "Sequelize" },
];

function hashContent(content) {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Detect which migration tracking table(s) exist in the target database.
 * Returns the first match with row details.
 */
async function detectTrackingTable(pool) {
  // Build a single query to check all known tables at once
  const checks = KNOWN_TRACKING_TABLES.map(
    (t) => `SELECT '${t.schema}' AS schema_name, '${t.table}' AS table_name, '${t.framework}' AS framework FROM information_schema.tables WHERE table_schema = '${t.schema}' AND table_name = '${t.table}'`
  );
  const sql = checks.join(" UNION ALL ");
  const result = await pool.query(sql);
  return result.rows; // may be empty
}

/**
 * Read migration records from the detected tracking table.
 * Returns normalized rows: { name, applied_at, hash? }
 */
async function readTrackingRecords(pool, schema, table) {
  // First get column names to understand the schema
  const colsResult = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
  const cols = colsResult.rows.map((r) => r.column_name);

  // Build the best query based on available columns
  const nameCol = cols.find((c) => ["name", "filename", "migration", "migration_name", "version", "script"].includes(c)) || cols[0];
  const dateCol = cols.find((c) => ["run_on", "applied_at", "executed_at", "installed_on", "created_at", "migration_time", "timestamp"].includes(c));
  const hashCol = cols.find((c) => ["checksum", "hash", "md5"].includes(c));

  let selectParts = [`${quoteIdent(nameCol)} AS name`];
  if (dateCol) selectParts.push(`${quoteIdent(dateCol)} AS applied_at`);
  else selectParts.push(`NULL AS applied_at`);
  if (hashCol) selectParts.push(`${quoteIdent(hashCol)} AS stored_hash`);
  else selectParts.push(`NULL AS stored_hash`);

  const orderCol = dateCol || nameCol;
  const rows = await pool.query(`SELECT ${selectParts.join(", ")} FROM "${schema}"."${table}" ORDER BY ${quoteIdent(orderCol)} ASC`);
  return rows.rows.map((r) => ({
    name: String(r.name || ""),
    applied_at: r.applied_at ? new Date(r.applied_at).toISOString() : null,
    stored_hash: r.stored_hash ? String(r.stored_hash) : null,
  }));
}

router.get("/api/migrations/idempotent/status", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });

  try {
    // 1. Detect tracking table(s)
    const detected = await detectTrackingTable(pool);

    // 2. Read our local migration files + compute hashes
    const files = await listMigrationFiles();
    const fileHashes = {};
    for (const f of files) {
      try {
        const content = await readFile(path.join(MIGRATIONS_DIR, f), "utf-8");
        fileHashes[f] = hashContent(content);
        fileHashes[migrationBaseName(f)] = hashContent(content);
      } catch {
        fileHashes[f] = null;
      }
    }

    // 3. If no tracking table detected, report all files as unknown state
    if (detected.length === 0) {
      return res.json({
        framework: null,
        tracking_table: null,
        detected_tables: [],
        migrations: files.map((f) => ({
          name: f,
          state: "pending",
          applied_at: null,
          stored_hash: null,
          file_hash: fileHashes[f] || null,
        })),
        summary: { applied: 0, pending: files.length, modified: 0, orphaned: 0 },
      });
    }

    // Use the first detected table (most common case)
    const primary = detected[0];
    const records = await readTrackingRecords(pool, primary.schema_name, primary.table_name);

    // 4. Build a map of applied migrations
    const appliedMap = new Map();
    for (const rec of records) {
      appliedMap.set(rec.name, rec);
      // Also store by base name for matching (some trackers store with extension, some without)
      const base = migrationBaseName(rec.name);
      if (!appliedMap.has(base)) appliedMap.set(base, rec);
    }

    // 5. Classify each local file
    const migrations = [];
    const matchedApplied = new Set();

    for (const f of files) {
      const base = migrationBaseName(f);
      const applied = appliedMap.get(f) || appliedMap.get(base);

      if (applied) {
        matchedApplied.add(applied.name);
        matchedApplied.add(base);
        const fileHash = fileHashes[f] || fileHashes[base] || null;
        // Check if content was modified since applied
        const hashMatch = applied.stored_hash && fileHash
          ? applied.stored_hash === fileHash
          : null; // null means we can't compare (tracker doesn't store hashes)
        const state = hashMatch === false ? "modified" : "applied";

        migrations.push({
          name: f,
          state,
          applied_at: applied.applied_at,
          stored_hash: applied.stored_hash,
          file_hash: fileHash,
        });
      } else {
        migrations.push({
          name: f,
          state: "pending",
          applied_at: null,
          stored_hash: null,
          file_hash: fileHashes[f] || null,
        });
      }
    }

    // 6. Find orphaned migrations (applied but file deleted)
    for (const rec of records) {
      if (!matchedApplied.has(rec.name) && !matchedApplied.has(migrationBaseName(rec.name))) {
        migrations.push({
          name: rec.name,
          state: "orphaned",
          applied_at: rec.applied_at,
          stored_hash: rec.stored_hash,
          file_hash: null,
        });
      }
    }

    const summary = {
      applied: migrations.filter((m) => m.state === "applied").length,
      pending: migrations.filter((m) => m.state === "pending").length,
      modified: migrations.filter((m) => m.state === "modified").length,
      orphaned: migrations.filter((m) => m.state === "orphaned").length,
    };

    return res.json({
      framework: primary.framework,
      tracking_table: `${primary.schema_name}.${primary.table_name}`,
      detected_tables: detected.map((d) => ({ schema: d.schema_name, table: d.table_name, framework: d.framework })),
      migrations,
      summary,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to detect migration status." });
  }
});

router.post("/api/migrations/idempotent/run", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  const activeDatabaseUrl = getActiveDatabaseUrl();
  if (!pool || !activeDatabaseUrl) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { migrations: requestedMigrations } = req.body || {};

  try {
    // Get current status
    const files = await listMigrationFiles();
    const applied = await getAppliedMigrations();
    const appliedSet = new Set(applied.map((r) => r.base_name));

    // Determine which to run
    let toRun;
    if (Array.isArray(requestedMigrations) && requestedMigrations.length > 0) {
      toRun = requestedMigrations.filter((name) => {
        const base = migrationBaseName(name);
        return files.includes(name) && !appliedSet.has(base);
      });
    } else {
      toRun = files.filter((f) => !appliedSet.has(migrationBaseName(f)));
    }

    if (toRun.length === 0) {
      return res.json({ ok: true, summary: "No pending migrations to run.", applied: [], failed: null });
    }

    // Run migrations one-by-one in a transaction where possible
    // For SQL files we can wrap in a transaction; for JS/CJS files we delegate to node-pg-migrate
    const appliedNow = [];
    let failedMigration = null;

    // Use a client from pool for transactional execution of SQL files
    const sqlOnly = toRun.every((f) => /\.sql$/i.test(f));

    if (sqlOnly) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const migration of toRun) {
          const filePath = path.join(MIGRATIONS_DIR, migration);
          const content = await readFile(filePath, "utf-8");
          const hash = hashContent(content);

          try {
            // Execute the migration SQL
            await client.query(content);

            // Record in pgmigrations (ensure table exists)
            await client.query(`
              CREATE TABLE IF NOT EXISTS public.pgmigrations (
                id serial PRIMARY KEY,
                name text NOT NULL,
                run_on timestamp NOT NULL DEFAULT now()
              )
            `);
            await client.query(
              `INSERT INTO public.pgmigrations (name, run_on) VALUES ($1, now())`,
              [migrationBaseName(migration)]
            );

            appliedNow.push({ name: migration, hash });
          } catch (err) {
            failedMigration = {
              name: migration,
              error: err instanceof Error ? err.message : String(err),
              statement: (err.position && content) ? content.substring(Math.max(0, Number(err.position) - 100), Number(err.position) + 200) : null,
            };
            break;
          }
        }

        if (failedMigration) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            ok: false,
            summary: `Migration "${failedMigration.name}" failed — entire batch rolled back.`,
            applied: [],
            failed: failedMigration,
          });
        }

        await client.query("COMMIT");
      } catch (txError) {
        try { await client.query("ROLLBACK"); } catch {}
        throw txError;
      } finally {
        client.release();
      }
    } else {
      // Delegate to node-pg-migrate for non-SQL files
      try {
        const beforeApplied = await getAppliedMigrations();
        await runNodePgMigrate(["--migrations-dir", MIGRATIONS_DIR, "up"], activeDatabaseUrl);
        const afterApplied = await getAppliedMigrations();
        const beforeSet = new Set(beforeApplied.map((r) => r.base_name));
        for (const r of afterApplied) {
          if (!beforeSet.has(r.base_name)) {
            appliedNow.push({ name: r.name, hash: null });
          }
        }
      } catch (err) {
        return res.status(400).json({
          ok: false,
          summary: `Migration runner failed: ${err instanceof Error ? err.message : String(err)}`,
          applied: appliedNow,
          failed: { name: "batch", error: err instanceof Error ? err.message : String(err), statement: null },
        });
      }
    }

    return res.json({
      ok: true,
      summary: `Applied ${appliedNow.length} migration(s) successfully.`,
      applied: appliedNow,
      failed: null,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run migrations." });
  }
});

router.post("/api/migrations/idempotent/mark-applied", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { migration } = req.body || {};
  if (!migration) return res.status(400).json({ error: "migration name is required." });

  try {
    // Ensure pgmigrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.pgmigrations (
        id serial PRIMARY KEY,
        name text NOT NULL,
        run_on timestamp NOT NULL DEFAULT now()
      )
    `);

    const baseName = migrationBaseName(migration);

    // Check if already recorded
    const existing = await pool.query(
      `SELECT id FROM public.pgmigrations WHERE name = $1`,
      [baseName]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, message: `Migration "${baseName}" is already recorded as applied.` });
    }

    await pool.query(
      `INSERT INTO public.pgmigrations (name, run_on) VALUES ($1, now())`,
      [baseName]
    );

    return res.json({ ok: true, message: `Migration "${baseName}" marked as applied without executing.` });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to mark migration as applied." });
  }
});

router.post("/api/migrations/idempotent/detect-schema", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { sql } = req.body || {};
  if (!sql) return res.status(400).json({ error: "sql content is required." });

  try {
    // Parse DDL statements from the SQL content and check if their objects already exist
    const findings = [];

    // Detect CREATE TABLE statements
    const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gi;
    let match;
    while ((match = createTableRe.exec(sql)) !== null) {
      const schema = match[1] || "public";
      const table = match[2];
      const result = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table]
      );
      findings.push({
        type: "table",
        name: `${schema}.${table}`,
        exists: result.rows.length > 0,
      });
    }

    // Detect CREATE INDEX statements
    const createIndexRe = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi;
    while ((match = createIndexRe.exec(sql)) !== null) {
      const indexName = match[1];
      const result = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
        [indexName]
      );
      findings.push({
        type: "index",
        name: indexName,
        exists: result.rows.length > 0,
      });
    }

    // Detect CREATE FUNCTION / PROCEDURE
    const createFuncRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi;
    while ((match = createFuncRe.exec(sql)) !== null) {
      const schema = match[1] || "public";
      const funcName = match[2];
      const result = await pool.query(
        `SELECT 1 FROM information_schema.routines WHERE routine_schema = $1 AND routine_name = $2`,
        [schema, funcName]
      );
      findings.push({
        type: "function",
        name: `${schema}.${funcName}`,
        exists: result.rows.length > 0,
      });
    }

    // Detect CREATE TYPE (enum, composite)
    const createTypeRe = /CREATE\s+TYPE\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi;
    while ((match = createTypeRe.exec(sql)) !== null) {
      const schema = match[1] || "public";
      const typeName = match[2];
      const result = await pool.query(
        `SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = $1 AND t.typname = $2`,
        [schema, typeName]
      );
      findings.push({
        type: "type",
        name: `${schema}.${typeName}`,
        exists: result.rows.length > 0,
      });
    }

    const allExist = findings.length > 0 && findings.every((f) => f.exists);
    const someExist = findings.some((f) => f.exists);

    return res.json({
      findings,
      all_objects_exist: allExist,
      some_objects_exist: someExist,
      recommendation: allExist
        ? "All DDL objects already exist. Safe to mark as applied without re-running."
        : someExist
          ? "Some objects already exist. Review carefully before running or marking as applied."
          : "No existing objects detected. Safe to run this migration.",
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to detect schema objects." });
  }
});
