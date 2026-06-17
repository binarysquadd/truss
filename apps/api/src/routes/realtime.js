import express from "express";
import { getPool, getCustomerPool } from "../lib/state.js";
import { ensureInternalSchema } from "../lib/internal.js";
import {
  realtimeClients,
  getRealtimeListener,
  realtimeChannels,
  realtimeEventLog,
  realtimeChannelName,
  channelTenantMap,
  createRealtimeTrigger,
  dropRealtimeTrigger,
  ensureRealtimeListener,
  presenceMap,
} from "../lib/realtime.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "realtime" });

export const router = express.Router();

// GET /api/realtime/subscriptions — list active subscriptions
router.get("/api/realtime/subscriptions", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const tenantId = req.tenant?.id || null;
  try {
    const { rows } = await pool.query(
      `SELECT id, schema_name, table_name, active, created_at
       FROM truss_internal.realtime_subscriptions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    return res.json({ subscriptions: rows });
  } catch (e) {
    if (e.code === "42P01") return res.json({ subscriptions: [] });
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/realtime/subscribe — subscribe to a table
router.post("/api/realtime/subscribe", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema = "public", table } = req.body;
  if (!table) return res.status(400).json({ error: "table is required" });
  const tenantId = req.tenant?.id || null;

  try {
    // Enforce subscription count limit (max 50 per tenant)
    const pool2 = getPool();
    if (pool2) {
      const countResult = await pool2.query(
        `SELECT count(*)::int AS count FROM truss_internal.realtime_subscriptions WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      );
      if (countResult.rows[0].count >= 50) {
        return res.status(403).json({ error: "Realtime subscription limit reached (max 50). Remove unused subscriptions to add new ones." });
      }
    }

    // Verify table exists (on customer database)
    const customerPool = getCustomerPool(req);
    const check = await customerPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [schema, table]);
    if (check.rows.length === 0) return res.status(404).json({ error: `Table ${schema}.${table} not found` });

    // Create trigger
    await createRealtimeTrigger(schema, table, tenantId);

    // Persist subscription
    await pool.query(`
      INSERT INTO truss_internal.realtime_subscriptions (schema_name, table_name, active, tenant_id)
      VALUES ($1, $2, true, $3)
      ON CONFLICT (schema_name, table_name, tenant_id) WHERE tenant_id IS NOT NULL
        DO UPDATE SET active = true
    `, [schema, table, tenantId]);

    // LISTEN on channel
    const channel = realtimeChannelName(schema, table, tenantId);
    realtimeChannels.add(channel);
    if (tenantId != null) channelTenantMap.set(channel, tenantId);
    await ensureRealtimeListener();
    const listener = getRealtimeListener();
    if (listener) await listener.query(`LISTEN "${channel}"`);

    // Audit
    try {
      await pool.query(`INSERT INTO truss_internal.audit_logs (action, actor, resource, meta, tenant_id) VALUES ($1,$2,$3,$4,$5)`,
        ["realtime.subscribe", "admin", `${schema}.${table}`, JSON.stringify({ schema, table }), tenantId]
      );
    } catch { /* */ }

    log.info({ schema, table, channel }, "realtime subscription created");
    trackFeature(req.tenant?.id || null, "realtime", "subscribe");
    return res.json({ ok: true, channel, schema, table });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "failed to create realtime subscription");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/realtime/subscribe — unsubscribe from a table
router.delete("/api/realtime/subscribe", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const { schema = "public", table } = req.query;
  if (!table) return res.status(400).json({ error: "table is required" });
  const tenantId = req.tenant?.id || null;

  try {
    await dropRealtimeTrigger(String(schema), String(table), tenantId);

    await pool.query(
      `UPDATE truss_internal.realtime_subscriptions SET active = false WHERE schema_name = $1 AND table_name = $2 AND tenant_id = $3`,
      [schema, table, tenantId]
    );

    const channel = realtimeChannelName(String(schema), String(table), tenantId);
    realtimeChannels.delete(channel);
    channelTenantMap.delete(channel);
    const listener = getRealtimeListener();
    if (listener) {
      try { await listener.query(`UNLISTEN "${channel}"`); } catch { /* */ }
    }

    // Audit
    try {
      await pool.query(`INSERT INTO truss_internal.audit_logs (action, actor, resource, meta, tenant_id) VALUES ($1,$2,$3,$4,$5)`,
        ["realtime.unsubscribe", "admin", `${schema}.${table}`, JSON.stringify({ schema, table }), tenantId]
      );
    } catch { /* */ }

    log.info({ schema, table }, "realtime subscription removed");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ schema, table, err: e.message }, "failed to remove realtime subscription");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/realtime/events — recent event log (last 200), filtered per tenant
router.get("/api/realtime/events", async (req, res) => {
  const tenantId = req.tenant?.id || null;
  // Build set of channels this tenant owns
  let tenantChannelSet = null;
  try {
    const pool = getPool();
    if (pool && tenantId != null) {
      const { rows } = await pool.query(
        `SELECT schema_name, table_name FROM truss_internal.realtime_subscriptions WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      );
      tenantChannelSet = new Set(rows.map(r => realtimeChannelName(r.schema_name, r.table_name, tenantId)));
    }
  } catch { /* fall through — return filtered by tenant_id on events */ }

  let filtered;
  if (tenantId == null) {
    // Admin/dev: show all events
    filtered = realtimeEventLog;
  } else if (tenantChannelSet) {
    filtered = realtimeEventLog.filter(e => tenantChannelSet.has(e.channel));
  } else {
    // Fallback: filter by tenant_id tag on events
    filtered = realtimeEventLog.filter(e => e.tenant_id === tenantId);
  }
  return res.json({ events: filtered, total: filtered.length });
});

// GET /api/realtime/status — realtime engine status
router.get("/api/realtime/status", async (req, res) => {
  const pool = getPool();
  const tenantId = req.tenant?.id || null;
  let tenantSubscriptionCount = 0;
  let tenantChannels = [];
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT schema_name, table_name FROM truss_internal.realtime_subscriptions WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      );
      tenantSubscriptionCount = rows.length;
      tenantChannels = rows.map(r => realtimeChannelName(r.schema_name, r.table_name, tenantId));
    } catch { /* table may not exist */ }
  }
  return res.json({
    connected: !!getRealtimeListener(),
    wsClients: realtimeClients.size,
    activeChannels: tenantChannels.length,
    channels: tenantChannels,
    eventLogSize: realtimeEventLog.length,
  });
});

// POST /api/realtime/clear-log — clear event log (scoped per tenant)
router.post("/api/realtime/clear-log", async (req, res) => {
  const tenantId = req.tenant?.id || null;

  if (tenantId == null) {
    // Admin/dev: clear everything
    realtimeEventLog.length = 0;
    return res.json({ ok: true });
  }

  // Build set of channels this tenant owns
  let tenantChannelSet = new Set();
  try {
    const pool = getPool();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT schema_name, table_name FROM truss_internal.realtime_subscriptions WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      );
      tenantChannelSet = new Set(rows.map(r => realtimeChannelName(r.schema_name, r.table_name, tenantId)));
    }
  } catch { /* */ }

  // Remove only events belonging to this tenant's channels
  for (let i = realtimeEventLog.length - 1; i >= 0; i--) {
    if (tenantChannelSet.has(realtimeEventLog[i].channel)) {
      realtimeEventLog.splice(i, 1);
    }
  }
  return res.json({ ok: true });
});

// GET /api/realtime/presence/:channel — list users present in a channel
router.get("/api/realtime/presence/:channel", (req, res) => {
  const { channel } = req.params;
  const ch = presenceMap.get(channel);
  if (!ch) return res.json({ channel, users: [], count: 0 });
  const users = [...ch.entries()].map(([user_id, e]) => ({
    user_id,
    meta: e.meta,
    joinedAt: e.joinedAt,
    lastSeen: e.lastSeen,
  }));
  return res.json({ channel, users, count: users.length });
});

// GET /api/realtime/tables — list all tables available for subscription
router.get("/api/realtime/tables", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema', 'truss_internal')
      ORDER BY table_schema, table_name
    `);
    return res.json({ tables: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
