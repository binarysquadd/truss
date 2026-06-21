// Cache / KV API — a thin, safe surface over Valkey (Redis-compatible).
// Single-instance core: the whole keyspace belongs to the one tenant (the cloud
// layer adds per-tenant key namespacing). Reads use SCAN (never the blocking KEYS),
// and an unreachable Valkey returns 503 rather than crashing the request.
import express from "express";
import { getClient, ping, parseInfo, isConfigured } from "../lib/cache.js";
import { writeAuditLog } from "../lib/internal.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "cache" });
export const router = express.Router();

const KEYS_MAX = 500;        // hard cap on a key-listing page
const COLLECTION_MAX = 200;  // hard cap on elements returned for list/set/hash/zset

// Run a Valkey command, mapping connection failures to a 503 the panel can show.
async function withCache(res, fn) {
  if (!isConfigured()) return res.status(503).json({ ok: false, error: "Cache (Valkey) is not configured." });
  try {
    return await fn(getClient());
  } catch (err) {
    log.warn({ err: err.message }, "valkey command failed");
    return res.status(503).json({ ok: false, error: "Cache unavailable: " + err.message });
  }
}

// GET /api/cache/status — quick health + headline stats for the panel.
router.get("/api/cache/status", async (req, res) => {
  if (!isConfigured()) return res.json({ ok: false, configured: false });
  try {
    await ping();
    const info = parseInfo(await getClient().info());
    const dbsize = await getClient().dbsize();
    res.json({
      ok: true,
      configured: true,
      version: info.server?.redis_version || info.server?.valkey_version || "unknown",
      keys: dbsize,
      stats: {
        used_memory_human: info.memory?.used_memory_human,
        connected_clients: info.clients?.connected_clients,
        uptime_seconds: info.server?.uptime_in_seconds,
        keyspace_hits: info.stats?.keyspace_hits,
        keyspace_misses: info.stats?.keyspace_misses,
      },
    });
  } catch (err) {
    res.json({ ok: false, configured: true, error: err.message });
  }
});

// GET /api/cache/info — full parsed INFO for the stats sub-view.
router.get("/api/cache/info", async (req, res) =>
  withCache(res, async (c) => res.json({ ok: true, info: parseInfo(await c.info()) }))
);

// GET /api/cache/keys?pattern=*&cursor=0&count=100 — SCAN a page of keys (+ type + ttl).
router.get("/api/cache/keys", async (req, res) =>
  withCache(res, async (c) => {
    const pattern = String(req.query.pattern || "*");
    const cursor = String(req.query.cursor || "0");
    const count = Math.min(Number(req.query.count) || 100, KEYS_MAX);
    const [nextCursor, keys] = await c.scan(cursor, "MATCH", pattern, "COUNT", count);
    // pipeline TYPE + TTL for the page so we don't round-trip per key
    const pipe = c.pipeline();
    keys.forEach((k) => { pipe.type(k); pipe.ttl(k); });
    const r = await pipe.exec();
    const items = keys.map((key, i) => ({
      key,
      type: r[i * 2]?.[1] || "unknown",
      ttl: r[i * 2 + 1]?.[1], // -1 = no expiry, -2 = missing
    }));
    res.json({ ok: true, keys: items, cursor: nextCursor });
  })
);

// GET /api/cache/keys/:key — value (+ type + ttl). Handles the common data types.
router.get("/api/cache/keys/:key", async (req, res) =>
  withCache(res, async (c) => {
    const { key } = req.params;
    const type = await c.type(key);
    if (type === "none") return res.status(404).json({ ok: false, error: "Key not found" });
    const ttl = await c.ttl(key);
    let value;
    switch (type) {
      case "string": value = await c.get(key); break;
      case "list":   value = await c.lrange(key, 0, COLLECTION_MAX - 1); break;
      case "set":    value = (await c.sscan(key, 0, "COUNT", COLLECTION_MAX))[1]; break;
      case "hash":   value = await c.hgetall(key); break;
      case "zset":   value = await c.zrange(key, 0, COLLECTION_MAX - 1, "WITHSCORES"); break;
      default:       value = null; // stream / other — type reported, value omitted
    }
    res.json({ ok: true, key, type, ttl, value });
  })
);

// PUT /api/cache/keys/:key — set a string value, optional ttl (seconds).
router.put("/api/cache/keys/:key", async (req, res) =>
  withCache(res, async (c) => {
    const { key } = req.params;
    const { value, ttl } = req.body || {};
    if (value === undefined || value === null) return res.status(400).json({ ok: false, error: "value is required" });
    const v = typeof value === "string" ? value : JSON.stringify(value);
    if (ttl && Number(ttl) > 0) await c.set(key, v, "EX", Number(ttl));
    else await c.set(key, v);
    writeAuditLog(req.tenant?.id || null, "cache.set", "cache_key", key, { ttl: ttl || null }, req.tenant?.id || null).catch(() => {});
    res.json({ ok: true, key });
  })
);

// DELETE /api/cache/keys/:key
router.delete("/api/cache/keys/:key", async (req, res) =>
  withCache(res, async (c) => {
    const { key } = req.params;
    const deleted = await c.del(key);
    writeAuditLog(req.tenant?.id || null, "cache.delete", "cache_key", key, {}, req.tenant?.id || null).catch(() => {});
    res.json({ ok: true, deleted });
  })
);

// POST /api/cache/flush — wipe the keyspace. Admin-only (destructive).
router.post("/api/cache/flush", async (req, res) => {
  if (!req.tenant?.isAdmin) return res.status(403).json({ ok: false, error: "Admin access required" });
  return withCache(res, async (c) => {
    await c.flushdb();
    writeAuditLog(req.tenant?.id || null, "cache.flush", "cache", null, {}, req.tenant?.id || null).catch(() => {});
    log.warn({ actor: req.tenant?.id }, "cache flushed");
    res.json({ ok: true });
  });
});
