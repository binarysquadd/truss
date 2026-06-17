import express from "express";
import { KETO_READ_URL, KETO_WRITE_URL, KETO_ADMIN_TOKEN, getPool } from "../lib/state.js";
import { adminMiddleware } from "../lib/session.js";
import { fetchWithTimeout } from "../lib/helpers.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "keto" });

export const router = express.Router();

// ─── Tenant isolation ───
// NOTE: Keto is a shared Ory stack. True namespace-level isolation would require
// Ory-native multi-tenancy support. The practical approach here is:
//   1. Enforce that req.tenant exists on all endpoints (auth gate)
//   2. Prefix namespaces with tenant ID so tenants can't see each other's tuples
//   3. Strip the prefix on responses so the dashboard sees clean namespace names
//
// Namespace prefixing: "files" → "t_<tenantId>:files"
// This is transparent to the dashboard — prefixing/stripping happens server-side.

function tenantPrefix(req) {
  return `t_${req.tenant.id}__`;
}

function prefixNamespace(ns, prefix) {
  if (!ns) return ns;
  // Don't double-prefix
  if (ns.startsWith(prefix)) return ns;
  return `${prefix}${ns}`;
}

function stripPrefix(ns, prefix) {
  if (!ns || !ns.startsWith(prefix)) return ns;
  return ns.slice(prefix.length);
}

/** Strip tenant prefix from all namespaces in a Keto response object (tuples, trees, etc.) */
function stripTupleNamespaces(obj, prefix) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => stripTupleNamespaces(item, prefix));
  const out = { ...obj };
  if (out.namespace) out.namespace = stripPrefix(out.namespace, prefix);
  if (out.subject_set) {
    out.subject_set = { ...out.subject_set };
    if (out.subject_set.namespace) out.subject_set.namespace = stripPrefix(out.subject_set.namespace, prefix);
  }
  // Recurse into known collection fields
  if (out.relation_tuples) out.relation_tuples = out.relation_tuples.map((t) => stripTupleNamespaces(t, prefix));
  if (out.children) out.children = out.children.map((c) => stripTupleNamespaces(c, prefix));
  return out;
}

function requireTenant(req, res) {
  if (!req.tenant) {
    res.status(401).json({ error: "Authentication required." });
    return false;
  }
  return true;
}

// GET /api/keto/health (cached 30s) — no tenant scoping needed for health
let _ketoHealthCache = null;
let _ketoHealthAt = 0;
router.get("/api/keto/health", async (_req, res) => {
  if (_ketoHealthCache && Date.now() - _ketoHealthAt < 30000) return res.json(_ketoHealthCache);
  if (!KETO_READ_URL) {
    return res.json({ ok: false, status: "not_configured", writeConfigured: false });
  }
  try {
    const r = await fetchWithTimeout(`${KETO_READ_URL}/health/alive`, {}, 5000);
    const data = await r.json();
    _ketoHealthCache = { ok: true, read: data, writeConfigured: !!KETO_WRITE_URL };
    _ketoHealthAt = Date.now();
    return res.json(_ketoHealthCache);
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : "unknown" }, "Keto health check failed");
    const result = { ok: false, status: "unreachable", error: e instanceof Error ? e.message : "Keto unreachable", writeConfigured: !!KETO_WRITE_URL };
    _ketoHealthCache = result;
    _ketoHealthAt = Date.now();
    return res.json(result);
  }
});

// GET /api/keto/namespaces — list OPL namespaces (filtered to tenant's prefixed namespaces)
router.get("/api/keto/namespaces", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_READ_URL) return res.status(503).json({ error: "KETO_READ_URL not configured" });
  try {
    const r = await fetch(`${KETO_READ_URL}/namespaces`);
    const data = await r.json();
    // Filter to only this tenant's namespaces and strip prefix
    const prefix = tenantPrefix(req);
    if (data.namespaces && Array.isArray(data.namespaces)) {
      data.namespaces = data.namespaces
        .filter((ns) => {
          const name = typeof ns === "string" ? ns : ns.name;
          return name && name.startsWith(prefix);
        })
        .map((ns) => {
          if (typeof ns === "string") return stripPrefix(ns, prefix);
          return { ...ns, name: stripPrefix(ns.name, prefix) };
        });
    }
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto unreachable" });
  }
});

// GET /api/keto/relation-tuples — list tuples with filters (scoped to tenant)
router.get("/api/keto/relation-tuples", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_READ_URL) return res.status(503).json({ error: "KETO_READ_URL not configured" });
  try {
    const prefix = tenantPrefix(req);
    const qs = new URLSearchParams();
    for (const key of ["namespace", "object", "relation", "subject_id", "subject_set.namespace", "subject_set.object", "subject_set.relation", "page_token", "page_size"]) {
      if (req.query[key]) {
        let val = String(req.query[key]);
        // Prefix namespace fields with tenant scope
        if (key === "namespace" || key === "subject_set.namespace") {
          val = prefixNamespace(val, prefix);
        }
        qs.set(key, val);
      }
    }
    const r = await fetch(`${KETO_READ_URL}/relation-tuples?${qs.toString()}`);
    const data = await r.json();
    // Strip tenant prefix from response
    return res.json(stripTupleNamespaces(data, prefix));
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto unreachable" });
  }
});

// POST /api/keto/check — check a permission (scoped to tenant)
router.post("/api/keto/check", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_READ_URL) return res.status(503).json({ error: "KETO_READ_URL not configured" });
  try {
    const prefix = tenantPrefix(req);
    const body = { ...req.body };
    if (body.namespace) body.namespace = prefixNamespace(body.namespace, prefix);
    if (body.subject_set && body.subject_set.namespace) {
      body.subject_set = { ...body.subject_set, namespace: prefixNamespace(body.subject_set.namespace, prefix) };
    }
    const r = await fetch(`${KETO_READ_URL}/relation-tuples/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    // Audit log the permission check
    try {
      const original = req.body;
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["keto.permission.check", req.tenant?.id || "unknown", `${original.namespace}:${original.object}#${original.relation}`, JSON.stringify({ subject_id: original.subject_id, subject_set: original.subject_set, allowed: data.allowed ?? false })]
      );
    } catch { /* best-effort */ }
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto unreachable" });
  }
});

// POST /api/keto/batch-check — check multiple permissions at once
router.post("/api/keto/batch-check", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_READ_URL) return res.status(503).json({ error: "KETO_READ_URL not configured" });
  const { checks } = req.body || {};
  if (!Array.isArray(checks) || checks.length === 0) return res.status(400).json({ error: "checks array is required" });
  if (checks.length > 50) return res.status(400).json({ error: "Max 50 checks per batch" });
  try {
    const prefix = tenantPrefix(req);
    const results = await Promise.all(
      checks.map(async (check) => {
        const body = { ...check };
        if (body.namespace) body.namespace = prefixNamespace(body.namespace, prefix);
        if (body.subject_set?.namespace) body.subject_set = { ...body.subject_set, namespace: prefixNamespace(body.subject_set.namespace, prefix) };
        try {
          const r = await fetch(`${KETO_READ_URL}/relation-tuples/check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          return { ...check, allowed: data.allowed ?? false };
        } catch {
          return { ...check, allowed: false, error: "check failed" };
        }
      })
    );
    return res.json({ results });
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Batch check failed" });
  }
});

// GET /api/keto/expand — expand a permission tree (scoped to tenant)
router.get("/api/keto/expand", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_READ_URL) return res.status(503).json({ error: "KETO_READ_URL not configured" });
  try {
    const prefix = tenantPrefix(req);
    const qs = new URLSearchParams();
    for (const key of ["namespace", "object", "relation", "max-depth"]) {
      if (req.query[key]) {
        let val = String(req.query[key]);
        if (key === "namespace") val = prefixNamespace(val, prefix);
        qs.set(key, val);
      }
    }
    const r = await fetch(`${KETO_READ_URL}/relation-tuples/expand?${qs.toString()}`);
    const data = await r.json();
    return res.json(stripTupleNamespaces(data, prefix));
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto unreachable" });
  }
});

// PUT /api/keto/relation-tuples — create a relation tuple (scoped to tenant)
router.put("/api/keto/relation-tuples", adminMiddleware, async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_WRITE_URL) return res.status(503).json({ error: "KETO_WRITE_URL not configured" });
  try {
    const prefix = tenantPrefix(req);
    const body = { ...req.body };
    if (body.namespace) body.namespace = prefixNamespace(body.namespace, prefix);
    if (body.subject_set && body.subject_set.namespace) {
      body.subject_set = { ...body.subject_set, namespace: prefixNamespace(body.subject_set.namespace, prefix) };
    }
    const r = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KETO_ADMIN_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    // Audit log
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta)
         VALUES ($1, $2, $3, $4)`,
        ["keto.tuple.create", req.tenant.id, `${req.body.namespace}:${req.body.object}#${req.body.relation}`, JSON.stringify(req.body)]
      );
    } catch { /* best-effort audit */ }
    log.info({ namespace: req.body.namespace, object: req.body.object, relation: req.body.relation }, "tuple created");
    trackFeature(req.tenant?.id || null, "keto", "tuple.create");
    return res.status(r.status).json(stripTupleNamespaces(data, prefix));
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown" }, "failed to create tuple");
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto write unreachable" });
  }
});

// DELETE /api/keto/relation-tuples — delete a relation tuple (scoped to tenant)
router.delete("/api/keto/relation-tuples", adminMiddleware, async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!KETO_WRITE_URL) return res.status(503).json({ error: "KETO_WRITE_URL not configured" });
  try {
    const prefix = tenantPrefix(req);
    const qs = new URLSearchParams();
    for (const key of ["namespace", "object", "relation", "subject_id", "subject_set.namespace", "subject_set.object", "subject_set.relation"]) {
      if (req.query[key]) {
        let val = String(req.query[key]);
        if (key === "namespace" || key === "subject_set.namespace") {
          val = prefixNamespace(val, prefix);
        }
        qs.set(key, val);
      }
    }
    const r = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples?${qs.toString()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${KETO_ADMIN_TOKEN}` },
    });
    // Audit log
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta)
         VALUES ($1, $2, $3, $4)`,
        ["keto.tuple.delete", req.tenant.id, `${req.query.namespace}:${req.query.object}#${req.query.relation}`, JSON.stringify(req.query)]
      );
    } catch { /* best-effort audit */ }
    log.info({ namespace: req.query.namespace, object: req.query.object, relation: req.query.relation }, "tuple deleted");
    return res.status(r.status).json({ ok: true });
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown" }, "failed to delete tuple");
    return res.status(502).json({ error: e instanceof Error ? e.message : "Keto write unreachable" });
  }
});

// ─── OPL Version History ─────────────────────────────────────────────────────

// GET /api/keto/opl-versions — list saved OPL snapshots
router.get("/api/keto/opl-versions", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const pool = getPool();
    const name = String(req.query.name || "default");
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT id, name, content, created_by, created_at FROM truss_internal.opl_versions
       WHERE (tenant_id = $1 OR tenant_id IS NULL) AND name = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [req.tenant.id, name, limit, offset]
    );
    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total FROM truss_internal.opl_versions WHERE (tenant_id = $1 OR tenant_id IS NULL) AND name = $2`,
      [req.tenant.id, name]
    );
    return res.json({ versions: rows, total: countRows[0]?.total || 0 });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load OPL versions" });
  }
});

// POST /api/keto/opl-versions — save a new OPL snapshot
router.post("/api/keto/opl-versions", adminMiddleware, async (req, res) => {
  if (!requireTenant(req, res)) return;
  const { name = "default", content } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO truss_internal.opl_versions (tenant_id, name, content, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, content, created_by, created_at`,
      [req.tenant.id, name, content, req.tenant.id]
    );
    log.info({ tenant: req.tenant.id, name }, "OPL version saved");
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save OPL version" });
  }
});
