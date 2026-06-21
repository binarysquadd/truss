// Valkey (Redis-compatible) cache/KV client. Lazy singleton: nothing connects at
// import time, and a down Valkey never crashes the API — commands fail fast and the
// cache routes report "unavailable" instead of hanging.
import Redis from "ioredis";
import { VALKEY_HOST, VALKEY_PORT, VALKEY_PASSWORD, VALKEY_URL } from "./state.js";
import logger from "./logger.js";

const log = logger.child({ module: "cache" });

let client = null;

// Configured if a URL or a host is set (host defaults to localhost, so this is
// effectively always true in dev; routes still tolerate an unreachable server).
export function isConfigured() {
  return Boolean(VALKEY_URL || VALKEY_HOST);
}

export function getClient() {
  if (client) return client;
  const opts = {
    lazyConnect: true,          // connect on first command, not at import
    maxRetriesPerRequest: 1,    // don't pile up retries on a request
    connectTimeout: 4000,
    // give up reconnecting after a few tries so we don't spin forever when down
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
  };
  client = VALKEY_URL
    ? new Redis(VALKEY_URL, opts)
    : new Redis({ host: VALKEY_HOST, port: VALKEY_PORT, password: VALKEY_PASSWORD || undefined, ...opts });
  // Swallow connection errors here so an unreachable Valkey can't throw unhandled.
  client.on("error", (err) => log.warn({ err: err.message }, "valkey connection error"));
  return client;
}

// PING the server; throws if unreachable (callers catch → report unavailable).
export async function ping() {
  return getClient().ping();
}

// Parse redis/valkey `INFO` output ("# Section\nkey:value\n…") into
// { section: { key: value } } for the status/stats endpoints.
export function parseInfo(raw) {
  const out = {};
  let section = "general";
  for (const line of String(raw).split(/\r?\n/)) {
    if (line.startsWith("#")) {
      section = line.replace(/^#\s*/, "").trim().toLowerCase();
      continue;
    }
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    (out[section] ||= {})[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}
