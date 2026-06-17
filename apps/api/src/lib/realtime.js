import pg from "pg";
import crypto from "node:crypto";
import { getPool, getActiveDatabaseUrl } from "./state.js";
import { ensureInternalSchema } from "./internal.js";
import { quoteIdent } from "./helpers.js";
import { assertPublicUrl } from "./ssrf.js";
import logger from "./logger.js";

const log = logger.child({ module: "realtime" });

// ─── Realtime state ───

export const realtimeClients = new Set();
let _realtimeListener = null;
export function getRealtimeListener() { return _realtimeListener; }
export const realtimeChannels = new Set();
export const realtimeEventLog = [];
export const REALTIME_LOG_MAX = 200;

// Maps channel name → tenant_id for tenant-scoped broadcast filtering
export const channelTenantMap = new Map();

// ─── Presence state ───
// presenceMap: channel → Map<userId, { meta, joinedAt, lastSeen, _conns: Set<ws> }>
export const presenceMap = new Map();

export function presenceJoin(ws, channel, userId, meta) {
  if (!presenceMap.has(channel)) presenceMap.set(channel, new Map());
  const ch = presenceMap.get(channel);

  const isNew = !ch.has(userId);
  if (isNew) {
    const now = new Date().toISOString();
    ch.set(userId, { meta: meta || {}, joinedAt: now, lastSeen: now, _conns: new Set() });
  }
  ch.get(userId)._conns.add(ws);

  if (!ws._presenceChannels) ws._presenceChannels = new Set();
  if (!ws._presenceUserIds) ws._presenceUserIds = new Map();
  ws._presenceChannels.add(channel);
  ws._presenceUserIds.set(channel, userId);

  if (isNew) {
    const entry = ch.get(userId);
    realtimeBroadcast(
      { type: "presence_update", channel, joins: [{ user_id: userId, meta: entry.meta, joinedAt: entry.joinedAt }], leaves: [] },
      ws.tenantId
    );
  }

  // Send full channel state back to the joining client
  const users = [...ch.entries()].map(([uid, e]) => ({ user_id: uid, meta: e.meta, joinedAt: e.joinedAt, lastSeen: e.lastSeen }));
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: "presence_state", channel, users }));
}

export function presenceLeave(ws, channel) {
  const userId = ws._presenceUserIds?.get(channel);
  if (!userId) return;

  const ch = presenceMap.get(channel);
  if (ch) {
    const entry = ch.get(userId);
    if (entry) {
      entry._conns.delete(ws);
      if (entry._conns.size === 0) {
        ch.delete(userId);
        if (ch.size === 0) presenceMap.delete(channel);
        realtimeBroadcast({ type: "presence_update", channel, joins: [], leaves: [userId] }, ws.tenantId);
      }
    }
  }

  ws._presenceChannels?.delete(channel);
  ws._presenceUserIds?.delete(channel);
}

export function presenceDisconnect(ws) {
  if (!ws._presenceChannels) return;
  for (const channel of [...ws._presenceChannels]) presenceLeave(ws, channel);
}

export function presenceHeartbeat(ws) {
  if (!ws._presenceUserIds) return;
  const now = new Date().toISOString();
  for (const [channel, userId] of ws._presenceUserIds) {
    const entry = presenceMap.get(channel)?.get(userId);
    if (entry) entry.lastSeen = now;
  }
}

// ─── Webhook state ───

export const webhookTriggers = new Map();

// ─── Helpers ───

// Channel names are tenant-scoped to prevent cross-tenant realtime leaks: two tenants
// subscribing to the same schema.table must NOT share a NOTIFY channel (their row data
// would broadcast to each other). tenantId is folded into the name. A null/undefined
// tenant (admin/dev single-tenant context) maps to "shared".
export function realtimeChannelName(schema, table, tenantId) {
  const tenantPart = tenantId == null ? "shared" : String(tenantId);
  return `truss_rt_${tenantPart}_${schema}_${table}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}

export function realtimeBroadcast(event, tenantId) {
  const msg = JSON.stringify(event);
  for (const ws of realtimeClients) {
    if (ws.readyState !== 1) continue;
    // If tenantId provided, only send to matching clients (null matches null for admin/dev)
    if (tenantId !== undefined && ws.tenantId !== tenantId) continue;
    ws.send(msg);
  }
}

// ─── Realtime triggers ───

export async function createRealtimeTrigger(schema, table, tenantId) {
  const pool = getPool();
  const channel = realtimeChannelName(schema, table, tenantId);
  const fnName = `truss_internal.${channel}_fn`;
  const trigName = `${channel}_trg`;

  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fnName}() RETURNS trigger AS $$
    DECLARE
      payload jsonb;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        payload := jsonb_build_object(
          'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME,
          'type', 'DELETE', 'old', row_to_json(OLD)::jsonb, 'ts', now()
        );
      ELSIF TG_OP = 'INSERT' THEN
        payload := jsonb_build_object(
          'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME,
          'type', 'INSERT', 'new', row_to_json(NEW)::jsonb, 'ts', now()
        );
      ELSE
        payload := jsonb_build_object(
          'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME,
          'type', 'UPDATE', 'old', row_to_json(OLD)::jsonb, 'new', row_to_json(NEW)::jsonb, 'ts', now()
        );
      END IF;
      PERFORM pg_notify('${channel}', left(payload::text, 7900));
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`DROP TRIGGER IF EXISTS ${quoteIdent(trigName)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`);
  await pool.query(`
    CREATE TRIGGER ${quoteIdent(trigName)}
    AFTER INSERT OR UPDATE OR DELETE ON ${quoteIdent(schema)}.${quoteIdent(table)}
    FOR EACH ROW EXECUTE FUNCTION ${fnName}()
  `);
}

export async function dropRealtimeTrigger(schema, table, tenantId) {
  const pool = getPool();
  const channel = realtimeChannelName(schema, table, tenantId);
  const fnName = `truss_internal.${channel}_fn`;
  const trigName = `${channel}_trg`;
  try { await pool.query(`DROP TRIGGER IF EXISTS ${quoteIdent(trigName)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`); } catch { /* */ }
  try { await pool.query(`DROP FUNCTION IF EXISTS ${fnName}() CASCADE`); } catch { /* */ }
}

// ─── Webhook triggers ───

export async function fireWebhook(webhook, eventType, payload) {
  const body = JSON.stringify({ event: eventType, table: `${webhook.table_schema}.${webhook.table_name}`, data: payload, timestamp: new Date().toISOString() });
  const headers = { "Content-Type": "application/json", ...(typeof webhook.headers === 'object' ? webhook.headers : {}) };
  if (webhook.secret) {
    const hmac = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
    headers["X-Truss-Signature"] = `sha256=${hmac}`;
  }
  const start = Date.now();
  let statusCode = null;
  let responseBody = "";
  try {
    await assertPublicUrl(webhook.url);  // SSRF guard: re-check at delivery (DNS rebinding) + block internal targets
    const resp = await fetch(webhook.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10000) });
    statusCode = resp.status;
    responseBody = (await resp.text()).slice(0, 4000);
  } catch (e) {
    responseBody = e.message;
  }
  const latencyMs = Date.now() - start;
  try {
    const pool = getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO truss_internal.webhook_logs (webhook_id, event_type, payload, status_code, response_body, latency_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
        [webhook.id, eventType, payload, statusCode, responseBody, latencyMs]
      );
      if (statusCode && statusCode >= 200 && statusCode < 300) {
        await pool.query(`UPDATE truss_internal.webhooks SET last_fired_at = now(), fail_count = 0 WHERE id = $1`, [webhook.id]);
      } else {
        await pool.query(`UPDATE truss_internal.webhooks SET last_fired_at = now(), fail_count = fail_count + 1 WHERE id = $1`, [webhook.id]);
      }
    }
  } catch { /* logging failure shouldn't crash */ }
  return { statusCode, latencyMs, responseBody };
}

export async function createWebhookTrigger(webhook) {
  const pool = getPool();
  if (!pool) return;
  const channel = `truss_wh_${webhook.id}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const fnName = `truss_internal.${channel}_fn`;
  const trigName = `${channel}_trg`;
  const events = (webhook.events || ["INSERT", "UPDATE", "DELETE"]).map(e => e.toUpperCase()).join(" OR ");

  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fnName}() RETURNS trigger AS $$
    DECLARE payload jsonb;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        payload := jsonb_build_object('type', 'DELETE', 'old', row_to_json(OLD)::jsonb, 'ts', now());
      ELSIF TG_OP = 'INSERT' THEN
        payload := jsonb_build_object('type', 'INSERT', 'new', row_to_json(NEW)::jsonb, 'ts', now());
      ELSE
        payload := jsonb_build_object('type', 'UPDATE', 'old', row_to_json(OLD)::jsonb, 'new', row_to_json(NEW)::jsonb, 'ts', now());
      END IF;
      PERFORM pg_notify('${channel}', left(payload::text, 7900));
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS ${quoteIdent(trigName)} ON ${quoteIdent(webhook.table_schema)}.${quoteIdent(webhook.table_name)}`);
  await pool.query(`
    CREATE TRIGGER ${quoteIdent(trigName)}
    AFTER ${events} ON ${quoteIdent(webhook.table_schema)}.${quoteIdent(webhook.table_name)}
    FOR EACH ROW EXECUTE FUNCTION ${fnName}()
  `);

  if (_realtimeListener) {
    await _realtimeListener.query(`LISTEN "${channel}"`);
  }
  webhookTriggers.set(webhook.id, channel);
}

export async function dropWebhookTrigger(webhookId, tableSchema, tableName) {
  const pool = getPool();
  const channel = `truss_wh_${webhookId}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const fnName = `truss_internal.${channel}_fn`;
  const trigName = `${channel}_trg`;
  try { await pool.query(`DROP TRIGGER IF EXISTS ${quoteIdent(trigName)} ON ${quoteIdent(tableSchema)}.${quoteIdent(tableName)}`); } catch {}
  try { await pool.query(`DROP FUNCTION IF EXISTS ${fnName}() CASCADE`); } catch {}
  if (_realtimeListener) {
    try { await _realtimeListener.query(`UNLISTEN "${channel}"`); } catch {}
  }
  webhookTriggers.delete(webhookId);
}

// ─── Listener lifecycle ───

let _reconnectDelay = 3000;
let _reconnectTimer = null;

function scheduleReconnect() {
  if (_reconnectTimer) return; // already scheduled
  _realtimeListener = null;
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    try { await bootstrapRealtimeListener(); _reconnectDelay = 3000; }
    catch { _reconnectDelay = Math.min(_reconnectDelay * 2, 60000); scheduleReconnect(); }
  }, _reconnectDelay);
}

export async function ensureRealtimeListener() {
  if (_realtimeListener) return;
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl) return;

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  client.on("notification", (msg) => {
    try {
      const data = JSON.parse(msg.payload);
      const tenantId = channelTenantMap.get(msg.channel) ?? undefined;
      const event = { channel: msg.channel, ...data, tenant_id: tenantId !== undefined ? tenantId : null, received_at: new Date().toISOString() };
      realtimeEventLog.unshift(event);
      if (realtimeEventLog.length > REALTIME_LOG_MAX) realtimeEventLog.length = REALTIME_LOG_MAX;
      realtimeBroadcast(event, tenantId);
    } catch { /* malformed payload */ }
    if (msg.channel.startsWith("truss_wh_")) {
      (async () => {
        try {
          const pool = getPool();
          for (const [whId, ch] of webhookTriggers.entries()) {
            if (ch === msg.channel) {
              const { rows } = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE id = $1 AND active = true`, [whId]);
              if (rows.length > 0) {
                const data = JSON.parse(msg.payload);
                await fireWebhook(rows[0], data.type, data);
              }
              break;
            }
          }
        } catch { /* fire-and-forget */ }
      })();
    }
  });
  client.on("error", (err) => {
    log.error({ err: err.message }, "realtime listener error");
    scheduleReconnect();
  });
  client.on("end", () => {
    scheduleReconnect();
  });
  _realtimeListener = client;

  for (const ch of realtimeChannels) {
    await client.query(`LISTEN "${ch}"`);
  }
}

export async function bootstrapRealtimeListener() {
  const pool = getPool();
  if (!pool) return;
  try {
    const { rows } = await pool.query(`SELECT schema_name, table_name, tenant_id FROM truss_internal.realtime_subscriptions WHERE active = true`);
    for (const row of rows) {
      const ch = realtimeChannelName(row.schema_name, row.table_name, row.tenant_id);
      realtimeChannels.add(ch);
      if (row.tenant_id != null) channelTenantMap.set(ch, row.tenant_id);
    }
    await ensureRealtimeListener();
    log.info({ count: rows.length }, "realtime subscriptions loaded");
    try {
      await ensureInternalSchema();
      const whResult = await pool.query(`SELECT * FROM truss_internal.webhooks WHERE active = true`);
      for (const wh of whResult.rows) {
        const channel = `truss_wh_${wh.id}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
        webhookTriggers.set(wh.id, channel);
        realtimeChannels.add(channel);
        try { await createWebhookTrigger(wh); } catch { /* trigger may already exist */ }
      }
    } catch { /* webhooks table may not exist yet */ }
  } catch (e) {
    if (e.code !== "42P01") log.error({ err: e.message }, "realtime bootstrap error");
  }
}
