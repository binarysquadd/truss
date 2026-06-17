import express from "express";
import { escapeIdentifier, escapeLiteral } from "pg";
import { getCustomerPool } from "../lib/state.js";
import { assertPublicHost } from "../lib/ssrf.js";
import { adminMiddleware } from "../lib/session.js";

export const router = express.Router();

// ─── Feature: Foreign Data Wrappers ───

router.get("/api/sql/fdw", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const result = await pool.query(`
      select
        s.srvname as server_name,
        f.fdwname as fdw_name,
        f.fdwhandler::regproc as handler,
        f.fdwvalidator::regproc as validator,
        s.srvoptions as server_options,
        array_agg(um.umuser::regrole::text order by um.umuser) filter (where um.umuser is not null) as user_mappings
      from pg_foreign_data_wrapper f
      left join pg_foreign_server s on s.srvfdw = f.oid
      left join pg_user_mapping um on um.umserver = s.oid
      group by f.fdwname, f.fdwhandler, f.fdwvalidator, s.srvname, s.srvoptions
      order by f.fdwname, s.srvname
    `);
    // Also get foreign tables
    const tables = await pool.query(`
      select
        ft.foreign_table_schema as schema,
        ft.foreign_table_name as table_name,
        ft.foreign_server_name as server_name,
        array_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position) as columns
      from information_schema.foreign_tables ft
      left join information_schema.columns c
        on c.table_schema = ft.foreign_table_schema and c.table_name = ft.foreign_table_name
      group by ft.foreign_table_schema, ft.foreign_table_name, ft.foreign_server_name
      order by ft.foreign_table_schema, ft.foreign_table_name
    `);
    return res.json({ wrappers: result.rows, foreignTables: tables.rows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load FDW info." });
  }
});

router.post("/api/fdw/server", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { name, fdw_name, host, port, dbname } = req.body;
  if (!name || !fdw_name) return res.status(400).json({ error: "name and fdw_name are required." });
  // SSRF guard: reject hosts resolving to private/reserved addresses (metadata, RFC1918, loopback).
  if (host) {
    try {
      await assertPublicHost(host);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid host." });
    }
  }
  // Validate port is an integer in the valid TCP range.
  if (port !== undefined && port !== null && port !== "") {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ error: "port must be an integer between 1 and 65535." });
    }
  }
  try {
    const opts = [];
    if (host) opts.push(`host ${escapeLiteral(host)}`);
    if (port) opts.push(`port ${escapeLiteral(String(port))}`);
    if (dbname) opts.push(`dbname ${escapeLiteral(dbname)}`);
    const optStr = opts.length > 0 ? ` OPTIONS (${opts.join(", ")})` : "";
    const sql = `CREATE SERVER ${escapeIdentifier(name)} FOREIGN DATA WRAPPER ${escapeIdentifier(fdw_name)}${optStr}`;
    await pool.query(sql);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create foreign server." });
  }
});

router.post("/api/fdw/user-mapping", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { server, local_user, remote_user, remote_password } = req.body;
  if (!server) return res.status(400).json({ error: "server is required." });
  try {
    const userClause = local_user && local_user !== "current_user" ? escapeIdentifier(local_user) : "CURRENT_USER";
    const opts = [];
    if (remote_user) opts.push(`user ${escapeLiteral(remote_user)}`);
    if (remote_password) opts.push(`password ${escapeLiteral(remote_password)}`);
    const optStr = opts.length > 0 ? ` OPTIONS (${opts.join(", ")})` : "";
    const sql = `CREATE USER MAPPING FOR ${userClause} SERVER ${escapeIdentifier(server)}${optStr}`;
    await pool.query(sql);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create user mapping." });
  }
});

router.post("/api/fdw/import", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const { server, remote_schema, local_schema } = req.body;
  if (!server || !remote_schema || !local_schema) return res.status(400).json({ error: "server, remote_schema, and local_schema are required." });
  try {
    const sql = `IMPORT FOREIGN SCHEMA ${escapeIdentifier(remote_schema)} FROM SERVER ${escapeIdentifier(server)} INTO ${escapeIdentifier(local_schema)}`;
    await pool.query(sql);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to import foreign schema." });
  }
});

router.delete("/api/fdw/server/:name", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    const sql = `DROP SERVER ${escapeIdentifier(req.params.name)} CASCADE`;
    await pool.query(sql);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to drop foreign server." });
  }
});
