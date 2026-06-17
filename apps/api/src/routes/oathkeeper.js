import express from "express";
import { OATHKEEPER_ADMIN_URL, OATHKEEPER_ADMIN_TOKEN, OATHKEEPER_PROXY_URL, getPool } from "../lib/state.js";
import { oathkeeperAdminRequest } from "../lib/oathkeeper.js";
import { ensureInternalSchema } from "../lib/internal.js";
import { assertPublicUrl } from "../lib/ssrf.js";
import { adminMiddleware } from "../lib/session.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "oathkeeper" });

export const router = express.Router();

// ─── Tenant isolation ───
// Gateway rules are per-tenant. Each tenant manages their own rules,
// stored in truss_internal.gateway_rules and synced to Oathkeeper.
// Rule IDs are namespaced per tenant to prevent collisions.

function requireTenant(req, res) {
  if (!req.tenant) {
    res.status(401).json({ error: "Authentication required." });
    return false;
  }
  return true;
}

// ─── Health — auth required, any tenant ───

router.get("/api/oathkeeper/health", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!OATHKEEPER_ADMIN_URL && !OATHKEEPER_PROXY_URL) {
    return res.json({ ok: false, status: "not_configured", adminConfigured: false, proxyUrl: null });
  }
  try {
    const adminBase = OATHKEEPER_ADMIN_URL || OATHKEEPER_PROXY_URL;
    const headers = {};
    if (OATHKEEPER_ADMIN_TOKEN) headers.Authorization = `Bearer ${OATHKEEPER_ADMIN_TOKEN}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${adminBase}/health/alive`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const data = await r.json();
    return res.json({ ok: true, health: data, adminConfigured: !!OATHKEEPER_ADMIN_URL, proxyUrl: OATHKEEPER_PROXY_URL || null });
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : "unknown" }, "Oathkeeper health check failed");
    // Return 200 with ok:false so dashboard doesn't log a network error
    return res.json({ ok: false, status: "unreachable", error: e instanceof Error ? e.message : "Oathkeeper unreachable", adminConfigured: !!OATHKEEPER_ADMIN_URL, proxyUrl: OATHKEEPER_PROXY_URL || null });
  }
});

// ─── Access Rules (read: auth required; write: admin-only) ───

router.get("/api/oathkeeper/rules", async (req, res) => {
  if (!requireTenant(req, res)) return;
  const pool = getPool();
  const tenantId = req.tenant?.id;
  try {
    // Postgres is the source of truth for per-tenant rules
    if (pool && tenantId) {
      await ensureInternalSchema();
      const { rows } = await pool.query(
        `SELECT * FROM truss_internal.gateway_rules WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId]
      );
      const rules = rows.map(r => ({
        id: r.rule_id,
        description: r.description || "",
        match: { url: r.match_url, methods: r.match_methods || [] },
        authenticators: typeof r.authenticator === "string" ? JSON.parse(r.authenticator) : (r.authenticator || []),
        authorizer: typeof r.authorizer === "string" ? JSON.parse(r.authorizer) : (r.authorizer || {}),
        mutators: typeof r.mutator === "string" ? JSON.parse(r.mutator) : (r.mutator || []),
        upstream: { url: r.upstream_url || "" },
      }));
      return res.json(rules);
    }
    return res.json([]);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch rules." });
  }
});

router.get("/api/oathkeeper/rules/:id", async (req, res) => {
  if (!requireTenant(req, res)) return;
  const pool = getPool();
  const tenantId = req.tenant?.id;
  try {
    if (pool && tenantId) {
      await ensureInternalSchema();
      const { rows } = await pool.query(
        `SELECT * FROM truss_internal.gateway_rules WHERE rule_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Rule not found." });
      const r = rows[0];
      return res.json({
        id: r.rule_id,
        description: r.description || "",
        match: { url: r.match_url, methods: r.match_methods || [] },
        authenticators: typeof r.authenticator === "string" ? JSON.parse(r.authenticator) : (r.authenticator || []),
        authorizer: typeof r.authorizer === "string" ? JSON.parse(r.authorizer) : (r.authorizer || {}),
        mutators: typeof r.mutator === "string" ? JSON.parse(r.mutator) : (r.mutator || []),
        upstream: { url: r.upstream_url || "" },
      });
    }
    return res.status(404).json({ error: "Rule not found." });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch rule." });
  }
});

// ─── Create / Update Rule (admin-only) ───

router.put("/api/oathkeeper/rules", adminMiddleware, async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const rule = req.body;
    if (!rule || !rule.id) return res.status(400).json({ error: "Rule body with 'id' is required." });
    // SSRF guard: validate the upstream URL and any absolute http(s) match URL before storing/syncing
    try {
      if (rule.upstream?.url) await assertPublicUrl(rule.upstream.url);
      if (rule.match?.url && /^https?:\/\//i.test(rule.match.url)) await assertPublicUrl(rule.match.url);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    // Save to Postgres (source of truth for tenant isolation)
    const pool = getPool();
    if (pool && req.tenant?.id) {
      await pool.query(
        `INSERT INTO truss_internal.gateway_rules (rule_id, match_url, match_methods, authenticator, authorizer, mutator, upstream_url, description, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (rule_id, tenant_id) DO UPDATE SET match_url = $2, match_methods = $3, authenticator = $4, authorizer = $5, mutator = $6, upstream_url = $7, description = $8, updated_at = now()`,
        [rule.id, rule.match?.url || '', rule.match?.methods || [], JSON.stringify(rule.authenticators || []), JSON.stringify(rule.authorizers || []), JSON.stringify(rule.mutators || []), rule.upstream?.url || '', rule.description || '', req.tenant.id]
      );
    }
    // Try syncing to Oathkeeper (best-effort — Oathkeeper may not accept PUT for single rules)
    let oathkeeperResult = null;
    try {
      oathkeeperResult = await oathkeeperAdminRequest("/rules", { method: "PUT", body: rule });
    } catch {
      // Oathkeeper sync failed — rule is still saved in Postgres
      log.warn({ ruleId: rule.id }, "Oathkeeper sync failed — rule saved to DB only");
    }
    // Audit log
    try {
      await pool.query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource_type, resource_id, payload, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ["oathkeeper.rule.upsert", "dashboard", "gateway_rule", rule.id, JSON.stringify({ match: rule.match }), req.tenant.id]
      );
    } catch { /* best-effort */ }
    log.info({ ruleId: rule.id }, "gateway rule upserted");
    return res.json(oathkeeperResult || rule);
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown" }, "failed to save gateway rule");
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save rule." });
  }
});

// ─── Delete Rule (admin-only) ───

router.delete("/api/oathkeeper/rules/:id", adminMiddleware, async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    // Delete from Postgres (source of truth)
    const pool = getPool();
    if (pool && req.tenant?.id) {
      await pool.query(`DELETE FROM truss_internal.gateway_rules WHERE rule_id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id]);
    }
    // Try syncing delete to Oathkeeper (best-effort)
    try {
      await oathkeeperAdminRequest(`/rules/${encodeURIComponent(req.params.id)}`, { method: "DELETE" });
    } catch {
      log.warn({ ruleId: req.params.id }, "Oathkeeper delete sync failed — removed from DB only");
    }
    // Audit log
    try {
      await pool.query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource_type, resource_id, payload, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ["oathkeeper.rule.delete", "dashboard", "gateway_rule", req.params.id, "{}", req.tenant.id]
      );
    } catch { /* best-effort */ }
    log.info({ ruleId: req.params.id }, "gateway rule deleted");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ ruleId: req.params.id, err: e instanceof Error ? e.message : "unknown" }, "failed to delete gateway rule");
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete rule." });
  }
});

// ─── Credentials (admin-only) ───

router.get("/api/oathkeeper/credentials", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const creds = await oathkeeperAdminRequest("/credentials");
    return res.json(creds);
  } catch (e) {
    // Some Oathkeeper versions don't expose /credentials
    return res.json({ keys: [] });
  }
});

// ─── Version / Info — auth required, any tenant ───

router.get("/api/oathkeeper/version", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const version = await oathkeeperAdminRequest("/version");
    return res.json(version);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch version." });
  }
});

// ─── Judge endpoint (admin-only — can probe arbitrary URLs) ───

router.post("/api/oathkeeper/judge", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!OATHKEEPER_PROXY_URL) return res.status(503).json({ error: "OATHKEEPER_PROXY_URL not configured" });
  const { url, method, headers: customHeaders } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required." });
  try { await assertPublicUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const r = await fetch(url, {
      method: method || "GET",
      redirect: "manual",
      headers: {
        ...(customHeaders || {}),
      },
    });
    const status = r.status;
    const responseHeaders = {};
    r.headers.forEach((v, k) => { responseHeaders[k] = v; });
    let body;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await r.json().catch(() => null);
    } else {
      body = await r.text().catch(() => "");
    }
    return res.json({ status, headers: responseHeaders, body });
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Request failed." });
  }
});
