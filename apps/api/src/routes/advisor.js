import express from "express";
import { getCustomerPool } from "../lib/state.js";
import { adminMiddleware } from "../lib/session.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "advisor" });

export const router = express.Router();

// ─── Schema advisor — RLS rule (seed of B8) ───
//
// Flags public tables that are reachable by the anon/authenticated client roles (a GRANT exists)
// but have RLS disabled or no policies — i.e. a public/anon API key could read every row. A
// "client-exposed table with no RLS" is a hard-fail finding (level: error).
router.get("/api/advisor/rls", adminMiddleware, async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected." });
  try {
    const { rows } = await pool.query(`
      SELECT n.nspname AS schema, c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             (SELECT count(*)::int FROM pg_policies p
                WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies,
             EXISTS (
               SELECT 1 FROM information_schema.role_table_grants g
               WHERE g.table_schema = n.nspname AND g.table_name = c.relname
                 AND g.grantee IN ('anon', 'authenticated')
                 AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
             ) AS client_exposed
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = 'public'
      ORDER BY c.relname
    `);
    const findings = rows
      .filter((r) => r.client_exposed && (!r.rls_enabled || r.policies === 0))
      .map((r) => ({
        level: "error",
        rule: "rls-missing-on-exposed-table",
        table: `${r.schema}.${r.table_name}`,
        detail: !r.rls_enabled
          ? "Reachable by the anon/authenticated client roles but RLS is DISABLED — every row is readable via a client key. Fix: ALTER TABLE ENABLE ROW LEVEL SECURITY, then add a policy."
          : "RLS is enabled but has no policies (default-deny) — confirm this table should be client-reachable.",
      }));
    return res.json({ ok: findings.length === 0, scanned: rows.length, findings });
  } catch (error) {
    log.error({ err: error.message }, "RLS advisor failed");
    return res.status(500).json({ error: error.message });
  }
});
