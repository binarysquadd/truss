import express from "express";
import { getPool } from "../lib/state.js";
import { ensureInternalSchema, writeAuditLog } from "../lib/internal.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "environments" });

export const router = express.Router();

// ─── Slug validation ───

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function isValidSlug(slug) {
  return typeof slug === "string" && slug.length >= 1 && slug.length <= 60 && SLUG_RE.test(slug);
}

// ─── GET /api/projects/:projectId/environments — list environments for a project ───

router.get("/api/projects/:projectId/environments", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();
    const result = await pool.query(
      `SELECT * FROM truss_internal.environments
       WHERE project_id = $1 AND tenant_id = $2 AND status != 'deleted'
       ORDER BY is_default DESC, name ASC`,
      [req.params.projectId, tenantId]
    );
    return res.json({ environments: result.rows });
  } catch (error) {
    log.error({ err: error.message }, "Failed to list environments");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list environments." });
  }
});

// ─── POST /api/projects/:projectId/environments — create environment ───

router.post("/api/projects/:projectId/environments", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const name = (req.body?.name || "").trim();
  const slug = (req.body?.slug || "").trim().toLowerCase();

  if (!name) return res.status(400).json({ error: "name is required." });
  if (!isValidSlug(slug)) return res.status(400).json({ error: "slug must be URL-safe (lowercase alphanumeric and hyphens, 1-60 chars)." });

  const projectId = req.params.projectId;

  try {
    await ensureInternalSchema();

    // Single-instance core: one environment max. truss-cloud (TRUSS_MULTI_TENANT=true) lifts this.
    if (process.env.TRUSS_MULTI_TENANT !== "true") {
      const { rows: [cap] } = await pool.query("SELECT count(*)::int AS n FROM truss_internal.environments WHERE status != 'deleted'");
      if (cap.n >= 1) return res.status(402).json({ error: "Single-instance edition is limited to one environment. Upgrade to Truss Cloud or deploy another instance." });
    }

    // Look up the project (verify ownership)
    const projResult = await pool.query(
      `SELECT * FROM truss_internal.projects
       WHERE id = $1 AND tenant_id = $2 AND status != 'deleted'`,
      [projectId, tenantId]
    );
    if (projResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const project = projResult.rows[0];

    // Check for duplicate slug within the project
    const dupeCheck = await pool.query(
      `SELECT id FROM truss_internal.environments
       WHERE project_id = $1 AND slug = $2 AND status != 'deleted'`,
      [projectId, slug]
    );
    if (dupeCheck.rows.length > 0) {
      return res.status(409).json({ error: `An environment with slug "${slug}" already exists in this project.` });
    }

    // Derive schema_name and bucket_name from the project
    const schemaName = `${project.schema_name}_${slug.replace(/-/g, "_")}`;
    const bucketName = `${project.bucket_name}-${slug}`;
    const dbName = project.db_name || null;

    const result = await pool.query(
      `INSERT INTO truss_internal.environments
        (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7)
       RETURNING *`,
      [projectId, name, slug, dbName, schemaName, bucketName, tenantId]
    );

    const env = result.rows[0];
    writeAuditLog(tenantId, "environment.create", "environment", env.id, { projectId, name, slug }, tenantId);
    log.info({ tenantId, projectId, envId: env.id, slug }, "created environment");

    return res.status(201).json(env);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: `An environment with slug "${slug}" already exists in this project.` });
    }
    log.error({ err: error.message }, "Failed to create environment");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create environment." });
  }
});

// ─── PATCH /api/environments/:id — update environment ───

router.patch("/api/environments/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();

    // Verify ownership
    const existing = await pool.query(
      `SELECT * FROM truss_internal.environments WHERE id = $1 AND tenant_id = $2 AND status != 'deleted'`,
      [req.params.id, tenantId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Environment not found." });
    }

    const sets = [];
    const vals = [];
    let idx = 1;

    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      sets.push(`name = $${idx++}`);
      vals.push(req.body.name.trim());
    }
    if (req.body?.config !== undefined && typeof req.body.config === "object") {
      sets.push(`config = $${idx++}`);
      vals.push(JSON.stringify(req.body.config));
    }

    if (sets.length === 0) return res.status(400).json({ error: "No valid fields to update." });

    sets.push(`updated_at = now()`);
    vals.push(req.params.id);
    vals.push(tenantId);

    const result = await pool.query(
      `UPDATE truss_internal.environments SET ${sets.join(", ")}
       WHERE id = $${idx} AND tenant_id = $${idx + 1} AND status != 'deleted'
       RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Environment not found." });

    writeAuditLog(tenantId, "environment.update", "environment", req.params.id, { name: result.rows[0].name }, tenantId);
    return res.json(result.rows[0]);
  } catch (error) {
    log.error({ err: error.message }, "Failed to update environment");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update environment." });
  }
});

// ─── DELETE /api/environments/:id — soft-delete environment ───

router.delete("/api/environments/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();

    // Verify ownership and check is_default
    const existing = await pool.query(
      `SELECT * FROM truss_internal.environments WHERE id = $1 AND tenant_id = $2 AND status != 'deleted'`,
      [req.params.id, tenantId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Environment not found." });
    }

    if (existing.rows[0].is_default) {
      return res.status(400).json({ error: "Cannot delete the default environment." });
    }

    await pool.query(
      `UPDATE truss_internal.environments SET status = 'deleted', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId]
    );

    writeAuditLog(tenantId, "environment.delete", "environment", req.params.id, {}, tenantId);
    return res.json({ ok: true });
  } catch (error) {
    log.error({ err: error.message }, "Failed to delete environment");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete environment." });
  }
});
