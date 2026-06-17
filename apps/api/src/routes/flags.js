import express from "express";
import { getCustomerPool, getPool } from "../lib/state.js";
import { writeAuditLog, ensureInternalSchema } from "../lib/internal.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "flags" });

// ─── Flagd connection config ───
const FLAGD_HOST = process.env.FLAGD_HOST || "localhost";
const FLAGD_PORT = process.env.FLAGD_PORT || "8013";
const FLAGD_URL = process.env.FLAGD_URL || (FLAGD_HOST.startsWith("http") ? FLAGD_HOST : `http://${FLAGD_HOST}${FLAGD_PORT ? `:${FLAGD_PORT}` : ""}`);

// ─── Module-level state ───
const tablesEnsuredPools = new WeakSet();
let lastSyncPayload = null;
let lastSyncTime = null;

const DEFAULT_ENVIRONMENTS = ["development", "staging", "production"];

// ─── Ensure feature flag tables ───
async function ensureFlagTables(pool) {
  if (tablesEnsuredPools.has(pool)) return;
  try { await ensureInternalSchema(); } catch { /* ignore — billing tables may not be needed */ }
  await pool.query(`CREATE SCHEMA IF NOT EXISTS truss_internal`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS truss_internal.feature_flags (
      id bigserial PRIMARY KEY,
      flag_key text NOT NULL,
      name text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      flag_type text NOT NULL DEFAULT 'boolean',
      variants jsonb NOT NULL DEFAULT '{"on": true, "off": false}'::jsonb,
      default_variant text NOT NULL DEFAULT 'off',
      targeting jsonb NOT NULL DEFAULT '[]'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      tags text[] NOT NULL DEFAULT '{}',
      state text NOT NULL DEFAULT 'DISABLED',
      tenant_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (flag_key, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS truss_internal.flag_environments (
      id bigserial PRIMARY KEY,
      flag_key text NOT NULL,
      environment text NOT NULL DEFAULT 'development',
      state text NOT NULL DEFAULT 'DISABLED',
      targeting jsonb NOT NULL DEFAULT '[]'::jsonb,
      rollout_pct real NOT NULL DEFAULT 100,
      tenant_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (flag_key, environment, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS truss_internal.flag_segments (
      id bigserial PRIMARY KEY,
      segment_key text NOT NULL,
      name text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      rules jsonb NOT NULL DEFAULT '[]'::jsonb,
      tenant_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (segment_key, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS truss_internal.flag_evaluation_log (
      id bigserial PRIMARY KEY,
      flag_key text NOT NULL,
      variant text,
      reason text,
      context jsonb NOT NULL DEFAULT '{}'::jsonb,
      tenant_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );


    CREATE INDEX IF NOT EXISTS idx_flag_evaluation_log_tenant ON truss_internal.flag_evaluation_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_flag_evaluation_log_key_tenant ON truss_internal.flag_evaluation_log(flag_key, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_flag_evaluation_log_created ON truss_internal.flag_evaluation_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON truss_internal.feature_flags(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_flag_environments_tenant ON truss_internal.flag_environments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_flag_segments_tenant ON truss_internal.flag_segments(tenant_id);
  `);
  tablesEnsuredPools.add(pool);
}

// ─── Build flagd-compatible config JSON ───
async function buildFlagdConfig(pool, tenantId) {
  const { rows: flags } = await pool.query(
    `SELECT * FROM truss_internal.feature_flags WHERE tenant_id = $1 ORDER BY flag_key`,
    [tenantId]
  );
  const { rows: segments } = await pool.query(
    `SELECT * FROM truss_internal.flag_segments WHERE tenant_id = $1 ORDER BY segment_key`,
    [tenantId]
  );

  // Build $evaluators from segments
  const evaluators = {};
  for (const seg of segments) {
    evaluators[seg.segment_key] = {
      rules: seg.rules || [],
    };
  }

  // Build flags object
  const flagsObj = {};
  for (const flag of flags) {
    flagsObj[flag.flag_key] = {
      state: flag.state,
      variants: flag.variants || {},
      defaultVariant: flag.default_variant || "off",
      ...(flag.targeting && Array.isArray(flag.targeting) && flag.targeting.length > 0
        ? { targeting: { if: flag.targeting } }
        : {}),
      ...(flag.metadata && Object.keys(flag.metadata).length > 0
        ? { metadata: flag.metadata }
        : {}),
    };
  }

  return {
    $schema: "https://flagd.dev/schema/v0/flags.json",
    ...(Object.keys(evaluators).length > 0 ? { $evaluators: evaluators } : {}),
    flags: flagsObj,
  };
}

// ─── Sync flags to flagd (store config + optional push) ───
async function syncToFlagd(pool, tenantId) {
  try {
    const config = await buildFlagdConfig(pool, tenantId);
    lastSyncPayload = config;
    lastSyncTime = new Date().toISOString();
    log.info({ tenantId, flagCount: Object.keys(config.flags).length }, "flag config synced");
    return config;
  } catch (err) {
    log.error({ err: err.message, tenantId }, "failed to sync flags to flagd");
    throw err;
  }
}

// ─── Resolve endpoint name for flagd evaluation ───
function resolveEndpoint(flagType) {
  switch (flagType) {
    case "boolean": return "ResolveBoolean";
    case "string":  return "ResolveString";
    case "number":  return "ResolveFloat";
    case "object":  return "ResolveObject";
    default:        return "ResolveBoolean";
  }
}

export const router = express.Router();

// ─────────────────────────────────────────────
// Flags CRUD
// ─────────────────────────────────────────────

// GET /api/flags — list flags
router.get("/api/flags", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const conditions = ["f.tenant_id = $1"];
    const params = [tenantId];
    let idx = 2;

    if (req.query.state) {
      conditions.push(`f.state = $${idx}`);
      params.push(req.query.state.toUpperCase());
      idx++;
    }
    if (req.query.tag) {
      conditions.push(`$${idx} = ANY(f.tags)`);
      params.push(req.query.tag);
      idx++;
    }
    if (req.query.type) {
      conditions.push(`f.flag_type = $${idx}`);
      params.push(req.query.type);
      idx++;
    }
    if (req.query.search) {
      conditions.push(`(f.flag_key ILIKE $${idx} OR f.name ILIKE $${idx} OR f.description ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT f.*, f.flag_key AS key, f.flag_type AS type,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'environment', e.environment, 'state', e.state,
            'targeting', e.targeting, 'rollout_pct', e.rollout_pct
          ) ORDER BY e.environment)
          FROM truss_internal.flag_environments e
          WHERE e.flag_key = f.flag_key AND e.tenant_id = f.tenant_id),
          '[]'::json
        ) AS environments
       FROM truss_internal.feature_flags f ${where}
       ORDER BY f.created_at DESC`,
      params
    );
    return res.json({ flags: rows });
  } catch (e) {
    log.error({ err: e.message }, "failed to list flags");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/config — flagd-compatible JSON config (for HTTP sync)
router.get("/api/flags/config", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const config = await buildFlagdConfig(pool, tenantId);
    res.setHeader("Content-Type", "application/json");
    return res.json(config);
  } catch (e) {
    log.error({ err: e.message }, "failed to build flagd config");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/segments — list segments (must be before /:key)
router.get("/api/flags/segments", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `SELECT *, segment_key AS key FROM truss_internal.flag_segments WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return res.json({ segments: rows });
  } catch (e) {
    log.error({ err: e.message }, "failed to list segments");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/segments/:key
router.get("/api/flags/segments/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `SELECT * FROM truss_internal.flag_segments WHERE segment_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Segment not found" });
    return res.json({ segment: rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/flags/segments — create segment
router.post("/api/flags/segments", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const segmentKey = String(req.body?.segmentKey || req.body?.segment_key || req.body?.key || "").trim();
  const name = String(req.body?.name || segmentKey).trim();
  const description = String(req.body?.description || "").trim();
  const rules = req.body?.rules || [];
  if (!segmentKey) return res.status(400).json({ error: "segmentKey is required" });
  if (!/^[a-zA-Z0-9._-]+$/.test(segmentKey)) return res.status(400).json({ error: "segmentKey must be alphanumeric (dashes, dots, underscores allowed)" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `INSERT INTO truss_internal.flag_segments (segment_key, name, description, rules, tenant_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [segmentKey, name, description, JSON.stringify(rules), tenantId]
    );
    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "segment.created", "feature_flag", segmentKey, { name, rules }, tenantId);
    log.info({ segmentKey }, "segment created");
    return res.status(201).json({ segment: rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: `Segment '${segmentKey}' already exists` });
    log.error({ segmentKey, err: e.message }, "failed to create segment");
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/flags/segments/:key — update segment
router.put("/api/flags/segments/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const existing = await pool.query(
      `SELECT * FROM truss_internal.flag_segments WHERE segment_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Segment not found" });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.rows[0].name;
    const description = req.body?.description !== undefined ? String(req.body.description).trim() : existing.rows[0].description;
    const rules = req.body?.rules !== undefined ? req.body.rules : existing.rows[0].rules;
    const { rows } = await pool.query(
      `UPDATE truss_internal.flag_segments SET name = $1, description = $2, rules = $3, updated_at = now()
       WHERE segment_key = $4 AND tenant_id = $5 RETURNING *`,
      [name, description, JSON.stringify(rules), req.params.key, tenantId]
    );
    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "segment.updated", "feature_flag", req.params.key, { name, rules }, tenantId);
    log.info({ segmentKey: req.params.key }, "segment updated");
    return res.json({ segment: rows[0] });
  } catch (e) {
    log.error({ segmentKey: req.params.key, err: e.message }, "failed to update segment");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/flags/segments/:key
router.delete("/api/flags/segments/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    await pool.query(
      `DELETE FROM truss_internal.flag_segments WHERE segment_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "segment.deleted", "feature_flag", req.params.key, {}, tenantId);
    log.info({ segmentKey: req.params.key }, "segment deleted");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ segmentKey: req.params.key, err: e.message }, "failed to delete segment");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/status — flagd health + stats
router.get("/api/flags/status", async (req, res) => {
  const pool = getCustomerPool(req);

  // Check flagd connectivity first (fast path — no DB needed)
  let connected = false;
  try {
    const healthRes = await fetch(`${FLAGD_URL}/flagd.evaluation.v1.Service/ResolveBoolean`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagKey: "truss-healthcheck", context: {} }),
      signal: AbortSignal.timeout(2000),
    });
    connected = healthRes.ok;
  } catch { /* flagd unreachable */ }

  // DB stats (non-blocking — return what we can)
  let flagCount = 0, segmentCount = 0;
  if (pool) {
    try {
      await ensureFlagTables(pool);
      const tenantId = req.tenant?.id || null;
      const [fc, sc] = await Promise.all([
        pool.query(`SELECT count(*)::int AS count FROM truss_internal.feature_flags WHERE tenant_id = $1`, [tenantId]),
        pool.query(`SELECT count(*)::int AS count FROM truss_internal.flag_segments WHERE tenant_id = $1`, [tenantId]),
      ]);
      flagCount = fc.rows[0].count;
      segmentCount = sc.rows[0].count;
    } catch { /* tables may not exist yet */ }
  }

  try {
    return res.json({
      connected,
      flagdUrl: FLAGD_URL,
      lastSync: lastSyncTime,
      flagCount,
      segmentCount,
    });
  } catch (e) {
    log.error({ err: e.message }, "failed to get flag status");
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/flags/sync — force re-sync
router.post("/api/flags/sync", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const config = await syncToFlagd(pool, tenantId);
    return res.json({ ok: true, lastSync: lastSyncTime, flagCount: Object.keys(config.flags).length });
  } catch (e) {
    log.error({ err: e.message }, "failed to force sync");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/activity — recent flag changes from audit logs
router.get("/api/flags/activity", async (req, res) => {
  // audit_logs lives in the main platform DB, not per-tenant DB
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const tenantId = req.tenant?.id || null;
    const flagKey = req.query.flagKey || null;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    let query, params;
    if (flagKey) {
      query = `SELECT * FROM truss_internal.audit_logs
               WHERE resource_type = 'feature_flag' AND tenant_id = $1 AND resource_id = $2
               ORDER BY created_at DESC LIMIT $3`;
      params = [tenantId, flagKey, limit];
    } else {
      query = `SELECT * FROM truss_internal.audit_logs
               WHERE resource_type = 'feature_flag' AND tenant_id = $1
               ORDER BY created_at DESC LIMIT $2`;
      params = [tenantId, limit];
    }
    const { rows } = await pool.query(query, params);
    return res.json({ activity: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/sdk-snippets — SDK code snippets
router.get("/api/flags/sdk-snippets", async (_req, res) => {
  const snippets = {
    javascript: `import { OpenFeature } from '@openfeature/web-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';

// Initialize the provider
await OpenFeature.setProviderAndWait(new FlagdWebProvider({
  host: '${FLAGD_URL}',
}));

const client = OpenFeature.getClient();

// Evaluate a boolean flag
const showFeature = await client.getBooleanValue('my-feature', false);
console.log('Feature enabled:', showFeature);

// Evaluate with context
const value = await client.getBooleanValue('my-feature', false, {
  targetingKey: 'user-123',
  email: 'user@example.com',
});`,
    nodejs: `import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '@openfeature/flagd-provider';

// Initialize the provider
await OpenFeature.setProviderAndWait(new FlagdProvider({
  host: '${FLAGD_HOST}',
  port: ${FLAGD_PORT},
}));

const client = OpenFeature.getClient();

// Evaluate a boolean flag
const showFeature = await client.getBooleanValue('my-feature', false);

// Evaluate with context
const value = await client.getStringValue('variant-flag', 'control', {
  targetingKey: 'user-123',
  plan: 'pro',
});`,
    go: `import (
  "context"
  flagd "github.com/open-feature/go-sdk-contrib/providers/flagd/pkg"
  "github.com/open-feature/go-sdk/openfeature"
)

// Initialize the provider
provider := flagd.NewProvider(
  flagd.WithHost("${FLAGD_HOST}"),
  flagd.WithPort(${FLAGD_PORT}),
)
openfeature.SetProvider(provider)

client := openfeature.NewClient("my-app")

// Evaluate a boolean flag
value, _ := client.BooleanValue(
  context.Background(), "my-feature", false,
  openfeature.NewEvaluationContext("user-123", map[string]interface{}{
    "plan": "pro",
  }),
)`,
    python: `from openfeature import api
from openfeature.contrib.provider.flagd import FlagdProvider

# Initialize the provider
api.set_provider(FlagdProvider(
    host="${FLAGD_HOST}",
    port=${FLAGD_PORT},
))

client = api.get_client()

# Evaluate a boolean flag
value = client.get_boolean_value("my-feature", False)

# Evaluate with context
from openfeature.evaluation_context import EvaluationContext
ctx = EvaluationContext(targeting_key="user-123", attributes={"plan": "pro"})
value = client.get_boolean_value("my-feature", False, ctx)`,
    java: `import dev.openfeature.sdk.OpenFeatureAPI;
import dev.openfeature.contrib.providers.flagd.FlagdProvider;

// Initialize the provider
OpenFeatureAPI api = OpenFeatureAPI.getInstance();
api.setProvider(new FlagdProvider(
    FlagdOptions.builder()
        .host("${FLAGD_HOST}")
        .port(${FLAGD_PORT})
        .build()
));

Client client = api.getClient();

// Evaluate a boolean flag
boolean showFeature = client.getBooleanValue("my-feature", false);

// Evaluate with context
MutableContext ctx = new MutableContext("user-123");
ctx.add("plan", "pro");
boolean value = client.getBooleanValue("my-feature", false, ctx);`,
    react: `import { OpenFeatureProvider, useBooleanFlagValue } from '@openfeature/react-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';

// Set up provider (do this once at app startup)
OpenFeature.setProvider(new FlagdWebProvider({
  host: '${FLAGD_URL}',
}));

// Wrap your app
function App() {
  return (
    <OpenFeatureProvider>
      <MyComponent />
    </OpenFeatureProvider>
  );
}

// Use flags in components
function MyComponent() {
  const showFeature = useBooleanFlagValue('my-feature', false);

  return showFeature ? <NewFeature /> : <OldFeature />;
}`,
  };
  return res.json({ snippets });
});

// POST /api/flags/evaluate — proxy evaluation to flagd
router.post("/api/flags/evaluate", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const flagKey = String(req.body?.flagKey || "").trim();
  const context = req.body?.context || {};
  if (!flagKey) return res.status(400).json({ error: "flagKey is required" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Look up flag
    const { rows: flagRows } = await pool.query(
      `SELECT * FROM truss_internal.feature_flags WHERE flag_key = $1 AND tenant_id = $2`,
      [flagKey, tenantId]
    );
    if (flagRows.length === 0) return res.status(404).json({ error: `Flag '${flagKey}' not found` });
    const flag = flagRows[0];
    const flagType = flag.flag_type || "boolean";

    let result;

    // Try flagd first, fall back to Postgres-based evaluation
    try {
      const endpoint = resolveEndpoint(flagType);
      const flagdRes = await fetch(`${FLAGD_URL}/flagd.evaluation.v1.Service/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagKey, context }),
        signal: AbortSignal.timeout(3000),
      });
      if (flagdRes.ok) {
        result = await flagdRes.json();
      } else {
        throw new Error(`flagd returned ${flagdRes.status}`);
      }
    } catch {
      // Fallback: evaluate from Postgres directly
      const variants = typeof flag.variants === "string" ? JSON.parse(flag.variants) : (flag.variants || {});
      const defaultVariant = flag.default_variant || Object.keys(variants)[0] || "off";
      const isEnabled = flag.state === "ENABLED";

      // Check rollout percentage from environments
      let rolloutPct = 100;
      try {
        const envResult = await pool.query(
          `SELECT rollout_pct FROM truss_internal.flag_environments WHERE flag_key = $1 AND environment = 'production' AND tenant_id = $2`,
          [flagKey, tenantId]
        );
        if (envResult.rows.length > 0) rolloutPct = envResult.rows[0].rollout_pct;
      } catch {}

      // Apply rollout: hash targetingKey to get deterministic 0-100 value
      let passesRollout = true;
      if (isEnabled && rolloutPct < 100) {
        const targetingKey = context.targetingKey || context.userId || context.user_id || "anonymous";
        const hash = Array.from(targetingKey + flagKey).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
        passesRollout = (Math.abs(hash) % 100) < rolloutPct;
      }

      const resolvedVariant = (isEnabled && passesRollout)
        ? (Object.keys(variants).find(k => k !== defaultVariant) || defaultVariant)
        : defaultVariant;
      result = {
        value: variants[resolvedVariant] ?? null,
        variant: resolvedVariant,
        reason: !isEnabled ? "DISABLED" : !passesRollout ? "ROLLOUT" : "STATIC",
        flagKey,
        metadata: { source: "postgres-fallback", rolloutPct },
      };
    }

    trackFeature(tenantId, "flags", "evaluate");
    // Log evaluation
    pool.query(
      `INSERT INTO truss_internal.flag_evaluation_log (flag_key, variant, reason, context, tenant_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [flagKey, result.variant || null, result.reason || null, JSON.stringify(context), tenantId]
    ).catch(() => {}); // fire and forget

    return res.json(result);
  } catch (e) {
    log.error({ flagKey, err: e.message }, "flag evaluation failed");
    return res.status(500).json({ error: `Evaluation failed: ${e.message}` });
  }
});

// POST /api/flags/evaluate/bulk — evaluate multiple flags
router.post("/api/flags/evaluate/bulk", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const flagKeys = req.body?.flagKeys;
  const context = req.body?.context || {};
  if (!Array.isArray(flagKeys) || flagKeys.length === 0) return res.status(400).json({ error: "flagKeys array is required" });
  if (flagKeys.length > 50) return res.status(400).json({ error: "Maximum 50 flags per bulk evaluation" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Look up all flags
    const placeholders = flagKeys.map((_, i) => `$${i + 1}`).join(", ");
    const { rows: flagRows } = await pool.query(
      `SELECT * FROM truss_internal.feature_flags WHERE flag_key IN (${placeholders}) AND tenant_id = $${flagKeys.length + 1}`,
      [...flagKeys, tenantId]
    );
    const flagMap = {};
    for (const row of flagRows) flagMap[row.flag_key] = row;

    // Evaluate each flag in parallel
    const results = {};
    const evaluations = flagKeys.map(async (key) => {
      const flag = flagMap[key];
      if (!flag) { results[key] = { error: "Flag not found" }; return; }
      const flagType = flag.flag_type || "boolean";
      try {
        const endpoint = resolveEndpoint(flagType);
        const flagdRes = await fetch(`${FLAGD_URL}/flagd.evaluation.v1.Service/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagKey: key, context }),
          signal: AbortSignal.timeout(3000),
        });
        if (flagdRes.ok) {
          results[key] = await flagdRes.json();
        } else {
          throw new Error("flagd unavailable");
        }
      } catch {
        // Fallback: Postgres-based evaluation
        const variants = typeof flag.variants === "string" ? JSON.parse(flag.variants) : (flag.variants || {});
        const defaultVariant = flag.default_variant || Object.keys(variants)[0] || "off";
        const isEnabled = flag.state === "ENABLED";

        // Check rollout percentage from environments
        let rolloutPct = 100;
        try {
          const envResult = await pool.query(
            `SELECT rollout_pct FROM truss_internal.flag_environments WHERE flag_key = $1 AND environment = 'production' AND tenant_id = $2`,
            [key, tenantId]
          );
          if (envResult.rows.length > 0) rolloutPct = envResult.rows[0].rollout_pct;
        } catch {}

        // Apply rollout: hash targetingKey to get deterministic 0-100 value
        let passesRollout = true;
        if (isEnabled && rolloutPct < 100) {
          const targetingKey = context.targetingKey || context.userId || context.user_id || "anonymous";
          const hash = Array.from(targetingKey + key).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
          passesRollout = (Math.abs(hash) % 100) < rolloutPct;
        }

        const resolvedVariant = (isEnabled && passesRollout)
          ? (Object.keys(variants).find(k => k !== defaultVariant) || defaultVariant)
          : defaultVariant;
        results[key] = {
          value: variants[resolvedVariant] ?? null,
          variant: resolvedVariant,
          reason: !isEnabled ? "DISABLED" : !passesRollout ? "ROLLOUT" : "STATIC",
          flagKey: key,
          metadata: { source: "postgres-fallback", rolloutPct },
        };
      }
    });
    await Promise.all(evaluations);

    // Bulk log evaluations (fire and forget)
    const logValues = flagKeys
      .filter((key) => results[key] && !results[key].error)
      .map((key) => {
        const r = results[key];
        return pool.query(
          `INSERT INTO truss_internal.flag_evaluation_log (flag_key, variant, reason, context, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [key, r.variant || null, r.reason || null, JSON.stringify(context), tenantId]
        ).catch(() => {});
      });
    Promise.all(logValues).catch(() => {});

    return res.json({ results });
  } catch (e) {
    log.error({ err: e.message }, "bulk evaluation failed");
    return res.status(502).json({ error: `Bulk evaluation failed: ${e.message}` });
  }
});

// GET /api/flags/evaluation-log — recent evaluations
router.get("/api/flags/evaluation-log", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const conditions = ["tenant_id = $1"];
    const params = [tenantId];
    let idx = 2;

    if (req.query.flagKey) {
      conditions.push(`flag_key = $${idx}`);
      params.push(req.query.flagKey);
      idx++;
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM truss_internal.flag_evaluation_log
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );
    return res.json({ logs: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PATCH /api/flags/bulk — bulk toggle
router.patch("/api/flags/bulk", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const flagKeys = req.body?.flagKeys;
  const state = String(req.body?.state || "").toUpperCase();
  if (!Array.isArray(flagKeys) || flagKeys.length === 0) return res.status(400).json({ error: "flagKeys array is required" });
  if (!["ENABLED", "DISABLED"].includes(state)) return res.status(400).json({ error: "state must be ENABLED or DISABLED" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const placeholders = flagKeys.map((_, i) => `$${i + 1}`).join(", ");
    const { rowCount } = await pool.query(
      `UPDATE truss_internal.feature_flags SET state = $${flagKeys.length + 1}, updated_at = now()
       WHERE flag_key IN (${placeholders}) AND tenant_id = $${flagKeys.length + 2}`,
      [...flagKeys, state, tenantId]
    );
    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.bulk_toggle", "feature_flag", flagKeys.join(","), { state, count: rowCount }, tenantId);
    log.info({ flagKeys, state }, "bulk toggle applied");
    return res.json({ ok: true, updated: rowCount });
  } catch (e) {
    log.error({ err: e.message }, "bulk toggle failed");
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/flags/:key — get single flag
router.get("/api/flags/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `SELECT f.*, f.flag_key AS key, f.flag_type AS type,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'environment', e.environment, 'state', e.state,
            'targeting', e.targeting, 'rollout_pct', e.rollout_pct
          ) ORDER BY e.environment)
          FROM truss_internal.flag_environments e
          WHERE e.flag_key = f.flag_key AND e.tenant_id = f.tenant_id),
          '[]'::json
        ) AS environments
       FROM truss_internal.feature_flags f
       WHERE f.flag_key = $1 AND f.tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Flag not found" });
    return res.json({ flag: rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/flags — create flag
router.post("/api/flags", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const flagKey = String(req.body?.flagKey || req.body?.flag_key || req.body?.key || "").trim();
  const name = String(req.body?.name || flagKey).trim();
  const description = String(req.body?.description || "").trim();
  const flagType = String(req.body?.flagType || req.body?.flag_type || req.body?.type || "boolean").trim();
  let variants = req.body?.variants || (flagType === "boolean" ? { on: true, off: false } : { on: "on", off: "off" });
  // Support array format [{key, value}] from dashboard — convert to object {key: value}
  if (Array.isArray(variants)) {
    const obj = {};
    for (const v of variants) { if (v.key) obj[v.key] = v.value; }
    variants = obj;
  }
  const defaultVariant = String(req.body?.defaultVariant || "off").trim();
  const targeting = req.body?.targeting || [];
  const metadata = req.body?.metadata || {};
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

  if (!flagKey) return res.status(400).json({ error: "flagKey is required" });
  if (!/^[a-zA-Z0-9._-]+$/.test(flagKey)) return res.status(400).json({ error: "flagKey must be alphanumeric (dashes, dots, underscores allowed)" });
  if (!["boolean", "string", "number", "object"].includes(flagType)) return res.status(400).json({ error: "flagType must be boolean, string, number, or object" });

  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Insert flag
    const { rows } = await pool.query(
      `INSERT INTO truss_internal.feature_flags (flag_key, name, description, flag_type, variants, default_variant, targeting, metadata, tags, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [flagKey, name, description, flagType, JSON.stringify(variants), defaultVariant, JSON.stringify(targeting), JSON.stringify(metadata), tags, tenantId]
    );

    // Create default environment entries
    for (const env of DEFAULT_ENVIRONMENTS) {
      await pool.query(
        `INSERT INTO truss_internal.flag_environments (flag_key, environment, state, tenant_id)
         VALUES ($1, $2, 'DISABLED', $3)
         ON CONFLICT (flag_key, environment, tenant_id) DO NOTHING`,
        [flagKey, env, tenantId]
      );
    }

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.created", "feature_flag", flagKey, { name, flagType, tags }, tenantId);
    log.info({ flagKey, flagType }, "flag created");

    // Return flag with environments
    const { rows: full } = await pool.query(
      `SELECT f.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'environment', e.environment, 'state', e.state,
            'targeting', e.targeting, 'rollout_pct', e.rollout_pct
          ) ORDER BY e.environment)
          FROM truss_internal.flag_environments e
          WHERE e.flag_key = f.flag_key AND e.tenant_id = f.tenant_id),
          '[]'::json
        ) AS environments
       FROM truss_internal.feature_flags f
       WHERE f.flag_key = $1 AND f.tenant_id = $2`,
      [flagKey, tenantId]
    );
    return res.status(201).json({ flag: full[0] || rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: `Flag '${flagKey}' already exists` });
    log.error({ flagKey, err: e.message }, "failed to create flag");
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/flags/:key — update flag
router.put("/api/flags/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const existing = await pool.query(
      `SELECT * FROM truss_internal.feature_flags WHERE flag_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Flag not found" });
    const old = existing.rows[0];

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : old.name;
    const description = req.body?.description !== undefined ? String(req.body.description).trim() : old.description;
    const flagType = req.body?.flagType !== undefined ? String(req.body.flagType).trim() : old.flag_type;
    const variants = req.body?.variants !== undefined ? req.body.variants : old.variants;
    const defaultVariant = req.body?.defaultVariant !== undefined ? String(req.body.defaultVariant).trim() : old.default_variant;
    const targeting = req.body?.targeting !== undefined ? req.body.targeting : old.targeting;
    const metadata = req.body?.metadata !== undefined ? req.body.metadata : old.metadata;
    const tags = req.body?.tags !== undefined ? req.body.tags : old.tags;
    const state = req.body?.state !== undefined ? String(req.body.state).toUpperCase() : old.state;

    const { rows } = await pool.query(
      `UPDATE truss_internal.feature_flags
       SET name = $1, description = $2, flag_type = $3, variants = $4, default_variant = $5,
           targeting = $6, metadata = $7, tags = $8, state = $9, updated_at = now()
       WHERE flag_key = $10 AND tenant_id = $11 RETURNING *`,
      [name, description, flagType, JSON.stringify(variants), defaultVariant, JSON.stringify(targeting), JSON.stringify(metadata), tags, state, req.params.key, tenantId]
    );

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.updated", "feature_flag", req.params.key, { name, state, flagType }, tenantId);
    log.info({ flagKey: req.params.key }, "flag updated");
    return res.json({ flag: rows[0] });
  } catch (e) {
    log.error({ flagKey: req.params.key, err: e.message }, "failed to update flag");
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/flags/:key — delete flag + cascade environments
router.delete("/api/flags/:key", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Delete environment configs first
    await pool.query(
      `DELETE FROM truss_internal.flag_environments WHERE flag_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    // Delete evaluation logs
    await pool.query(
      `DELETE FROM truss_internal.flag_evaluation_log WHERE flag_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    // Delete the flag
    const { rowCount } = await pool.query(
      `DELETE FROM truss_internal.feature_flags WHERE flag_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Flag not found" });

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.deleted", "feature_flag", req.params.key, {}, tenantId);
    log.info({ flagKey: req.params.key }, "flag deleted");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ flagKey: req.params.key, err: e.message }, "failed to delete flag");
    return res.status(500).json({ error: e.message });
  }
});

// PATCH /api/flags/:key/toggle — toggle ENABLED↔DISABLED
router.patch("/api/flags/:key/toggle", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `UPDATE truss_internal.feature_flags
       SET state = CASE WHEN state = 'ENABLED' THEN 'DISABLED' ELSE 'ENABLED' END, updated_at = now()
       WHERE flag_key = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.key, tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Flag not found" });

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.toggled", "feature_flag", req.params.key, { state: rows[0].state }, tenantId);
    log.info({ flagKey: req.params.key, state: rows[0].state }, "flag toggled");
    return res.json({ flag: rows[0] });
  } catch (e) {
    log.error({ flagKey: req.params.key, err: e.message }, "failed to toggle flag");
    return res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// Environments
// ─────────────────────────────────────────────

// GET /api/flags/:key/environments — get per-environment configs
router.get("/api/flags/:key/environments", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;
    const { rows } = await pool.query(
      `SELECT * FROM truss_internal.flag_environments
       WHERE flag_key = $1 AND tenant_id = $2 ORDER BY environment`,
      [req.params.key, tenantId]
    );
    return res.json({ environments: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/flags/:key/environments/:env — update env config
router.put("/api/flags/:key/environments/:env", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const env = req.params.env;
  if (!DEFAULT_ENVIRONMENTS.includes(env)) return res.status(400).json({ error: `Invalid environment: ${env}. Must be one of: ${DEFAULT_ENVIRONMENTS.join(", ")}` });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Verify flag exists
    const flagCheck = await pool.query(
      `SELECT flag_key FROM truss_internal.feature_flags WHERE flag_key = $1 AND tenant_id = $2`,
      [req.params.key, tenantId]
    );
    if (flagCheck.rows.length === 0) return res.status(404).json({ error: "Flag not found" });

    const state = req.body?.state !== undefined ? String(req.body.state).toUpperCase() : "DISABLED";
    const targeting = req.body?.targeting !== undefined ? req.body.targeting : [];
    const rolloutPct = req.body?.rolloutPct !== undefined ? Math.min(100, Math.max(0, Number(req.body.rolloutPct))) : 100;

    const { rows } = await pool.query(
      `INSERT INTO truss_internal.flag_environments (flag_key, environment, state, targeting, rollout_pct, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (flag_key, environment, tenant_id)
       DO UPDATE SET state = $3, targeting = $4, rollout_pct = $5, updated_at = now()
       RETURNING *`,
      [req.params.key, env, state, JSON.stringify(targeting), rolloutPct, tenantId]
    );

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.env_updated", "feature_flag", req.params.key, { environment: env, state, rolloutPct }, tenantId);
    log.info({ flagKey: req.params.key, environment: env, state }, "flag environment updated");
    return res.json({ environment: rows[0] });
  } catch (e) {
    log.error({ flagKey: req.params.key, env, err: e.message }, "failed to update flag environment");
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/flags/:key/promote — promote env config
router.post("/api/flags/:key/promote", async (req, res) => {
  const pool = getCustomerPool(req);
  if (!pool) return res.status(503).json({ error: "No database connected" });
  const from = String(req.body?.from || "").trim();
  const to = String(req.body?.to || "").trim();
  if (!from || !to) return res.status(400).json({ error: "from and to environments are required" });
  if (!DEFAULT_ENVIRONMENTS.includes(from)) return res.status(400).json({ error: `Invalid source environment: ${from}` });
  if (!DEFAULT_ENVIRONMENTS.includes(to)) return res.status(400).json({ error: `Invalid target environment: ${to}` });
  if (from === to) return res.status(400).json({ error: "Source and target environments must differ" });
  try {
    await ensureFlagTables(pool);
    const tenantId = req.tenant?.id || null;

    // Get source config
    const { rows: srcRows } = await pool.query(
      `SELECT * FROM truss_internal.flag_environments
       WHERE flag_key = $1 AND environment = $2 AND tenant_id = $3`,
      [req.params.key, from, tenantId]
    );
    if (srcRows.rows?.length === 0 || srcRows.length === 0) {
      return res.status(404).json({ error: `No config found for environment '${from}'` });
    }
    const src = srcRows[0];

    // Upsert target
    const { rows } = await pool.query(
      `INSERT INTO truss_internal.flag_environments (flag_key, environment, state, targeting, rollout_pct, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (flag_key, environment, tenant_id)
       DO UPDATE SET state = $3, targeting = $4, rollout_pct = $5, updated_at = now()
       RETURNING *`,
      [req.params.key, to, src.state, JSON.stringify(src.targeting), src.rollout_pct, tenantId]
    );

    await syncToFlagd(pool, tenantId);
    writeAuditLog("dashboard", "flag.promoted", "feature_flag", req.params.key, { from, to }, tenantId);
    log.info({ flagKey: req.params.key, from, to }, "flag promoted");
    return res.json({ ok: true, environment: rows[0] });
  } catch (e) {
    log.error({ flagKey: req.params.key, err: e.message }, "failed to promote flag");
    return res.status(500).json({ error: e.message });
  }
});
