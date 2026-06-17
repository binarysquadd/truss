import express from "express";
import crypto from "node:crypto";
import { getPool } from "../lib/state.js";
import { fetchWithTimeout } from "../lib/helpers.js";
import { adminMiddleware } from "../lib/session.js";
import { assertPublicUrl } from "../lib/ssrf.js";

import logger from "../lib/logger.js";

const log = logger.child({ module: "auth-webhooks" });

export const router = express.Router();

// ---------------------------------------------------------------------------
// Auth Webhooks — CRUD + test-fire
// ---------------------------------------------------------------------------

router.get("/api/auth/webhooks", adminMiddleware, async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Authentication required." });
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT value FROM truss_internal.billing_config WHERE key = $1 AND tenant_id IS NULL`,
      [`auth_webhooks_${tenantId}`]
    );
    const webhooks = rows[0]?.value ? JSON.parse(rows[0].value) : [];
    return res.json({ webhooks });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load auth webhooks" });
  }
});

router.put("/api/auth/webhooks", adminMiddleware, async (req, res) => {
  const { webhooks } = req.body || {};
  if (!Array.isArray(webhooks)) return res.status(400).json({ error: "webhooks array is required" });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Authentication required." });
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ($1, $2, NULL)
       ON CONFLICT (key) WHERE tenant_id IS NULL DO UPDATE SET value = $2, updated_at = now()`,
      [`auth_webhooks_${tenantId}`, JSON.stringify(webhooks)]
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save auth webhooks" });
  }
});

router.post("/api/auth/webhooks/test", adminMiddleware, async (req, res) => {
  const { url, secret, event } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required" });
  if (!req.tenant?.id) return res.status(401).json({ error: "Authentication required." });
  try { await assertPublicUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }

  const testEvent = event || "auth.login";
  const payload = {
    event: testEvent,
    timestamp: new Date().toISOString(),
    data: {
      identity_id: "00000000-0000-0000-0000-000000000000",
      email: "test@example.com",
      traits: { email: "test@example.com", name: "Test User" },
      method: "password",
    },
  };

  const headers = { "Content-Type": "application/json" };
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
    headers["X-Webhook-Signature"] = sig;
  }

  try {
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }, 10000);
    return res.json({ ok: true, status: resp.status });
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Webhook request failed" });
  }
});

// ---------------------------------------------------------------------------
// fireAuthWebhooks — fire-and-forget delivery to auth webhooks
// ---------------------------------------------------------------------------

export function fireAuthWebhooks(tenantId, event, payload, pool) {
  if (!pool) return;
  pool.query(
    `SELECT value FROM truss_internal.billing_config WHERE key = $1`,
    [`auth_webhooks_${tenantId}`]
  ).then(({ rows }) => {
    if (!rows[0]?.value) return;
    let webhooks;
    try { webhooks = JSON.parse(rows[0].value); } catch { return; }
    if (!Array.isArray(webhooks)) return;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    for (const hook of webhooks) {
      if (!hook.enabled || !hook.url) continue;
      if (!hook.events || !hook.events.includes(event)) continue;

      const headers = { "Content-Type": "application/json" };
      if (hook.secret) {
        headers["X-Webhook-Signature"] = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      }

      fetchWithTimeout(hook.url, { method: "POST", headers, body }, 10000)
        .catch((err) => log.warn({ webhook: hook.name, url: hook.url, event, err: err?.message }, "Auth webhook delivery failed"));
    }
  }).catch((err) => log.warn({ tenantId, event, err: err?.message }, "Failed to load auth webhooks for delivery"));
}
