import express from "express";
import crypto from "node:crypto";
import { getPool, getCustomerPool } from "../lib/state.js";
import { ensureInternalSchema, writeAuditLog } from "../lib/internal.js";
import { createWebhookTrigger, dropWebhookTrigger, fireWebhook } from "../lib/realtime.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "webhooks" });

const isProd = process.env.NODE_ENV === "production";

// Explicit, safe webhook columns to return to clients.
// EXCLUDES `secret` (HMAC signing key) and `headers` (often contain bearer tokens);
// exposes a boolean `has_secret` instead so the UI can show "signing enabled".
const WEBHOOK_PUBLIC_COLUMNS = `
  id, name, table_schema, table_name, events, url, active,
  created_at, last_fired_at, fail_count, tenant_id,
  (secret IS NOT NULL AND secret != '') AS has_secret
`;

// ─── SSRF protection: block private/internal URLs ───
function isPrivateUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // Malformed URLs are rejected
  }
  const hostname = parsed.hostname.toLowerCase();

  // Block URLs with credentials (user:pass@host)
  if (parsed.username || parsed.password) return true;

  // Block localhost variants
  if (hostname === "localhost" || hostname === "ip6-localhost" || hostname === "ip6-loopback") return true;

  // Block IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") return true;

  // Block 0.0.0.0 and [::]
  if (hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::") return true;

  // Block fc00::/7 (IPv6 unique local — both fc and fd prefixes)
  if (/^\[?f[cd]/i.test(hostname)) return true;

  // Block IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const v4MappedMatch = hostname.replace(/^\[|\]$/g, "").match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (v4MappedMatch) {
    const [, a, b] = v4MappedMatch.map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  // Block known metadata endpoints
  if (hostname === "metadata.google.internal" || hostname === "169.254.169.254") return true;

  // Check IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true;                            // 127.0.0.0/8
    if (a === 10) return true;                             // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16
    if (a === 169 && b === 254) return true;               // 169.254.0.0/16
    if (a === 0) return true;                              // 0.0.0.0/8
  }

  return false;
}

// ─── Webhook replay cooldown (5s per logId) ───
const replayCooldowns = new Map(); // logId -> timestamp

function checkReplayCooldown(logId) {
  const now = Date.now();
  // Clean up entries older than 60s
  for (const [key, ts] of replayCooldowns) {
    if (now - ts > 60_000) replayCooldowns.delete(key);
  }
  const lastReplay = replayCooldowns.get(logId);
  if (lastReplay && now - lastReplay < 5_000) return false;
  replayCooldowns.set(logId, now);
  return true;
}

export const router = express.Router();

// GET /api/webhooks — list all
router.get("/api/webhooks", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(`
      SELECT w.id, w.name, w.table_schema, w.table_name, w.events, w.url, w.active,
        w.created_at, w.last_fired_at, w.fail_count, w.tenant_id,
        (w.secret IS NOT NULL AND w.secret != '') AS has_secret,
        (SELECT count(*) FROM truss_internal.webhook_logs l WHERE l.webhook_id = w.id) AS total_deliveries,
        (SELECT count(*) FROM truss_internal.webhook_logs l WHERE l.webhook_id = w.id AND l.status_code >= 200 AND l.status_code < 300) AS successful_deliveries
      FROM truss_internal.webhooks w WHERE w.tenant_id = $1 ORDER BY w.created_at DESC
    `, [tenantId]);
    return res.json({ webhooks: rows });
  } catch (e) {
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// POST /api/webhooks — create
router.post("/api/webhooks", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const name = String(req.body?.name || "").trim();
  const tableSchema = String(req.body?.table_schema || "public").trim();
  const tableName = String(req.body?.table_name || "").trim();
  const url = String(req.body?.url || "").trim();
  const events = Array.isArray(req.body?.events) ? req.body.events : ["INSERT", "UPDATE", "DELETE"];
  const headers = req.body?.headers && typeof req.body.headers === 'object' ? req.body.headers : {};
  const secret = String(req.body?.secret || "");
  if (!tableName || !url) return res.status(400).json({ error: "table_name and url are required" });
  if (isPrivateUrl(url)) return res.status(400).json({ error: "Webhook URL must not point to internal/private addresses" });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;

    // Enforce webhook count limit (max 50 per tenant)
    const countResult = await pool.query(
      `SELECT count(*)::int AS count FROM truss_internal.webhooks WHERE tenant_id = $1`,
      [tenantId]
    );
    if (countResult.rows[0].count >= 50) {
      return res.status(403).json({ error: "Webhook limit reached (max 50). Delete unused webhooks to create new ones." });
    }
    const { rows } = await pool.query(
      `INSERT INTO truss_internal.webhooks (name, table_schema, table_name, events, url, headers, secret, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${WEBHOOK_PUBLIC_COLUMNS}`,
      [name || `${tableName} webhook`, tableSchema, tableName, events, url, JSON.stringify(headers), secret, tenantId]
    );
    const webhook = rows[0];
    await createWebhookTrigger(webhook);
    writeAuditLog('dashboard', 'create', 'webhook', webhook.id, { name: webhook.name, table_name: tableName, url }, tenantId);
    log.info({ webhookId: webhook.id, name: webhook.name, table: tableName, url }, "webhook created");
    trackFeature(req.tenant?.id || null, "webhooks", "create");
    return res.status(201).json({ webhook });
  } catch (e) {
    log.error({ table: tableName, err: e.message }, "failed to create webhook");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// PATCH /api/webhooks/:id — update
router.patch("/api/webhooks/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const id = req.params.id;
  const tenantId = req.tenant?.id || null;
  try {
    const existing = await pool.query(`SELECT ${WEBHOOK_PUBLIC_COLUMNS} FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Webhook not found" });
    const wh = existing.rows[0];

    // SSRF protection: block private/internal URLs on update
    if (req.body?.url) {
      const urlError = isPrivateUrl(String(req.body.url).trim());
      if (urlError) return res.status(400).json({ error: "Webhook URL must not point to internal/private addresses" });
    }

    const updates = [];
    const vals = [];
    let idx = 1;
    for (const field of ["name", "url", "secret", "active"]) {
      if (req.body?.[field] !== undefined) {
        updates.push(`${field} = $${idx}`);
        vals.push(field === "active" ? Boolean(req.body[field]) : String(req.body[field]));
        idx++;
      }
    }
    if (req.body?.events) { updates.push(`events = $${idx}`); vals.push(req.body.events); idx++; }
    if (req.body?.headers) { updates.push(`headers = $${idx}`); vals.push(JSON.stringify(req.body.headers)); idx++; }
    if (updates.length === 0) return res.json({ webhook: wh });
    vals.push(id);
    vals.push(tenantId);
    const { rows } = await pool.query(`UPDATE truss_internal.webhooks SET ${updates.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING ${WEBHOOK_PUBLIC_COLUMNS}`, vals);
    // Recreate trigger if table/events changed
    if (rows[0].active) {
      await dropWebhookTrigger(id, wh.table_schema, wh.table_name);
      await createWebhookTrigger(rows[0]);
    }
    writeAuditLog('dashboard', 'update', 'webhook', id, { name: rows[0].name, url: rows[0].url, active: rows[0].active }, tenantId);
    log.info({ webhookId: id, active: rows[0].active }, "webhook updated");
    return res.json({ webhook: rows[0] });
  } catch (e) {
    log.error({ webhookId: id, err: e.message }, "failed to update webhook");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// DELETE /api/webhooks/:id
router.delete("/api/webhooks/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const id = req.params.id;
  const tenantId = req.tenant?.id || null;
  try {
    const existing = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (existing.rows.length > 0) {
      await dropWebhookTrigger(id, existing.rows[0].table_schema, existing.rows[0].table_name);
    }
    const deletedName = existing.rows.length > 0 ? existing.rows[0].name : null;
    await pool.query(`DELETE FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    writeAuditLog('dashboard', 'delete', 'webhook', id, { name: deletedName }, tenantId);
    log.info({ webhookId: id, name: deletedName }, "webhook deleted");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ webhookId: id, err: e.message }, "failed to delete webhook");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// POST /api/webhooks/:id/test — fire a test payload
router.post("/api/webhooks/:id/test", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const id = req.params.id;
  const tenantId = req.tenant?.id || null;
  try {
    const { rows } = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (rows.length === 0) return res.status(404).json({ error: "Webhook not found" });
    const result = await fireWebhook(rows[0], "TEST", { test: true, message: "Test delivery from Truss" });
    log.info({ webhookId: id, statusCode: result.statusCode, latencyMs: result.latencyMs }, "webhook test fired");
    return res.json(result);
  } catch (e) {
    log.error({ webhookId: id, err: e.message }, "webhook test failed");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// GET /api/webhooks/:id/logs — delivery history
router.get("/api/webhooks/:id/logs", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const id = req.params.id;
  const tenantId = req.tenant?.id || null;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  try {
    // Verify webhook belongs to tenant
    const whCheck = await pool.query(`SELECT id FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (whCheck.rows.length === 0) return res.status(404).json({ error: "Webhook not found" });
    const { rows } = await pool.query(
      `SELECT * FROM truss_internal.webhook_logs WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [id, limit]
    );
    return res.json({ logs: rows });
  } catch (e) {
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});

// POST /api/webhooks/:id/replay/:logId — replay a delivery
router.post("/api/webhooks/:id/replay/:logId", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const tenantId = req.tenant?.id || null;
  if (!checkReplayCooldown(req.params.logId)) {
    return res.status(429).json({ error: "Please wait before replaying this webhook again" });
  }
  try {
    const wh = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (wh.rows.length === 0) return res.status(404).json({ error: "Webhook not found" });
    const log = await pool.query(`SELECT * FROM truss_internal.webhook_logs WHERE id = $1 AND webhook_id = $2`, [req.params.logId, req.params.id]);
    if (log.rows.length === 0) return res.status(404).json({ error: "Log entry not found" });
    const result = await fireWebhook(wh.rows[0], log.rows[0].event_type, log.rows[0].payload);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: isProd ? "An internal error occurred" : e.message });
  }
});
