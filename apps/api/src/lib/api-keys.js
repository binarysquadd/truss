import crypto from "node:crypto";
import { getPool } from "./state.js";
import { ensureInternalSchema } from "./internal.js";
import { logSecurityEvent } from "./observability.js";
import { getTenantPool } from "./tenant-db.js";

// ─── API Key helpers ───

export function generateApiKey(keyType) {
  const prefix = keyType === "service_role" ? "truss_sk_" : "truss_pk_";
  const secret = crypto.randomBytes(32).toString("base64url");
  const fullKey = `${prefix}${secret}`;
  const hash = crypto.createHash("sha256").update(fullKey).digest("hex");
  return { fullKey, prefix: fullKey.slice(0, 12), hash };
}

export async function resolveApiKey(rawKey) {
  const pool = getPool();
  if (!pool || !rawKey) return null;
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const result = await pool.query(
    `select id, key_type, label, revoked, rate_limit, tenant_id, project_id from truss_internal.api_keys where key_hash = $1 limit 1`,
    [hash]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.revoked) return null;
  pool.query(`update truss_internal.api_keys set last_used_at = now() where id = $1`, [row.id]).catch(() => {});
  return { id: row.id, keyType: row.key_type, label: row.label, rateLimit: row.rate_limit, tenantId: row.tenant_id, projectId: row.project_id };
}

// ─── Rate limiter (in-memory, per key) ───
// Single-instance core has no plans/quotas — the limit is effectively unlimited unless
// a per-key rate_limit is explicitly configured on the api_keys row.

const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map();
// No plan-derived cap in the open-source core. -1 means "no limit".
const DEFAULT_RATE_LIMIT = -1;

export async function checkRateLimit(keyId, perKeyRateLimit = null) {
  const maxLimit = perKeyRateLimit != null ? perKeyRateLimit : DEFAULT_RATE_LIMIT;
  // -1 (or any negative) means unlimited — short-circuit without tracking.
  if (maxLimit < 0) return { allowed: true, remaining: -1, limit: -1 };
  const now = Date.now();
  let bucket = rateBuckets.get(keyId);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    rateBuckets.set(keyId, bucket);
  }
  bucket.count++;
  return { allowed: bucket.count <= maxLimit, remaining: Math.max(0, maxLimit - bucket.count), limit: maxLimit };
}

// Clean up stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
  for (const [k, v] of rateBuckets) {
    if (v.windowStart < cutoff) rateBuckets.delete(k);
  }
}, 300_000);

// ─── API Key middleware for /v1/ routes ───

export async function apiKeyAuth(req, res, next) {
  const rawKey = req.headers["apikey"] || req.headers["x-api-key"];
  if (!rawKey) return res.status(401).json({ error: "Missing API key. Pass it via the apikey header." });
  try {
    await ensureInternalSchema();
    const key = await resolveApiKey(rawKey);
    if (!key) return res.status(403).json({ error: "Invalid or revoked API key." });
    const rate = await checkRateLimit(key.id, key.rateLimit);
    res.set("X-RateLimit-Limit", String(rate.limit));
    res.set("X-RateLimit-Remaining", String(rate.remaining));
    if (!rate.allowed) {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
      logSecurityEvent("rate_limited", { key_id: key.id, path: req.path, limit: rate.limit }, ip, null);
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
    req.apiKey = key;

    // Resolve tenant context from API key so /v1/ routes are tenant-scoped
    if (key.tenantId) {
      req.tenant = { id: key.tenantId, fromApiKey: true };
      try {
        const tenantPool = await getTenantPool(key.tenantId);
        if (tenantPool) req.tenantPool = tenantPool;
      } catch { /* fall through — getCustomerPool will use platform pool */ }
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: "API key validation failed." });
  }
}
