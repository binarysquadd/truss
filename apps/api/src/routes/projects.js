import express from "express";
import crypto from "node:crypto";
import { getPool, getCustomerPool, API_PORT, getActiveDatabaseUrl } from "../lib/state.js";
import { provisionTenantDatabase, getTenantDbName, listTenantDatabases } from "../lib/tenant-db.js";
import { ensureInternalSchema, measureStorageSizeBytes, measureAuthMau, writeAuditLog } from "../lib/internal.js";
import { generateApiKey } from "../lib/api-keys.js";
import { getS3Client } from "../lib/s3.js";
import { maskConnectionString } from "../lib/helpers.js";
import { adminMiddleware, getProjectRole } from "../lib/session.js";
import { encryptValue, decryptValue } from "./connections.js";
import logger from "../lib/logger.js";

// service_role_key is a retrievable (Supabase-style) secret stored encrypted at
// rest (AES-256-GCM via ENCRYPTION_KEY). Encrypt on every write, decrypt on every
// read that returns it to a client. decryptValue() passes legacy plaintext through
// unchanged, so this is backward-compatible with rows written before encryption.
const decryptKey = (v) => (v ? decryptValue(v) : v);
const encryptKey = (v) => (v ? encryptValue(v) : v);

const log = logger.child({ module: "projects" });
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const API_BASE_URL = process.env.API_URL || process.env.VITE_API_BASE_URL || `http://localhost:${process.env.API_PORT || 8787}`;

export const router = express.Router();

// POST /api/projects/provision
router.post("/api/projects/provision", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const region = typeof req.body?.region === "string" ? req.body.region.trim() : "india-mumbai";
  if (!name) return res.status(400).json({ error: "name is required." });

  try {
    await ensureInternalSchema();

    // Single-instance core: one project max. truss-cloud (TRUSS_MULTI_TENANT=true) lifts this.
    if (process.env.TRUSS_MULTI_TENANT !== "true") {
      const { rows: [cap] } = await pool.query("SELECT count(*)::int AS n FROM truss_internal.projects WHERE status != 'deleted'");
      if (cap.n >= 1) return res.status(402).json({ error: "Single-instance edition is limited to one project. Upgrade to Truss Cloud or deploy another instance." });
    }
    const tenantId = req.tenant?.id || null;

    // Optional org_id — verify tenant is a member of the org
    const orgId = typeof req.body?.orgId === "string" ? req.body.orgId.trim() : null;
    if (orgId) {
      const memberCheck = await pool.query(
        `SELECT role FROM truss_internal.org_members WHERE org_id = $1 AND tenant_id = $2`,
        [orgId, tenantId]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: "You are not a member of this organization." });
      }
    }

    // Idempotency: check if a project with the same name already exists for this tenant/org
    const existingCheck = await pool.query(
      `SELECT * FROM truss_internal.projects
       WHERE name = $1 AND tenant_id = $2 AND status != 'deleted'
       ${orgId ? "AND org_id = $3" : "AND org_id IS NULL"}
       LIMIT 1`,
      orgId ? [name, tenantId, orgId] : [name, tenantId]
    );
    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      return res.json({
        project: {
          id: existing.id, name: existing.name, slug: existing.slug, region: existing.region,
          status: existing.status, schema_name: existing.schema_name, bucket_name: existing.bucket_name,
          anon_key: existing.anon_key, service_role_key: decryptKey(existing.service_role_key), api_url: existing.api_url,
          org_id: existing.org_id || null, created_at: existing.created_at,
        },
        existing: true,
      });
    }

    // Generate slug from name
    const baseSlug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const suffix = crypto.randomBytes(2).toString("hex");
    const slug = `${baseSlug}-${suffix}`;
    const schemaName = `project_${slug.replace(/-/g, "_")}`;

    // Validate schema name (only allow safe chars)
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      return res.status(400).json({ error: "Invalid project name — produces unsafe schema name." });
    }

    // Provision tenant database if not already done (database-per-tenant isolation)
    let dbName = await getTenantDbName(tenantId);
    if (!dbName) {
      dbName = await provisionTenantDatabase(tenantId);
    }

    // Create project schema within tenant's database
    const tenantPool = req.tenantPool || getCustomerPool(req);
    await tenantPool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // Bucket name includes tenant prefix for isolation
    const tenantShort = tenantId.replace(/-/g, "").slice(0, 12).toLowerCase();
    const bucketName = `t-${tenantShort}-${slug}`;

    // Create MinIO bucket
    try {
      const s3 = getS3Client();
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    } catch (bucketErr) {
      // Bucket may already exist — ignore BucketAlreadyOwnedByYou / BucketAlreadyExists
      if (
        bucketErr?.name !== "BucketAlreadyOwnedByYou" &&
        bucketErr?.name !== "BucketAlreadyExists"
      ) {
        log.error({ err: bucketErr?.message }, "Failed to create project bucket");
      }
    }

    // Generate API keys for the project
    const anonKey = generateApiKey("anon");
    const serviceKey = generateApiKey("service_role");

    // Insert project record
    const result = await pool.query(
      `INSERT INTO truss_internal.projects
        (name, slug, region, schema_name, bucket_name, anon_key, service_role_key, api_url, status, tenant_id, org_id, db_name, db_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, 'dedicated')
       RETURNING *`,
      [name, slug, region, schemaName, bucketName, anonKey.fullKey, encryptKey(serviceKey.fullKey), `${API_BASE_URL}/v1/projects/${slug}`, tenantId, orgId, dbName]
    );

    const project = result.rows[0];

    // Insert API keys linked to project
    await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["anon", anonKey.prefix, anonKey.hash, `${name} anon key`, project.id, tenantId]
    );
    await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["service_role", serviceKey.prefix, serviceKey.hash, `${name} service_role key`, project.id, tenantId]
    );

    // Create default "Production" environment for the project
    await pool.query(
      `INSERT INTO truss_internal.environments
        (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
       VALUES ($1, 'Production', 'production', $2, $3, $4, true, $5)
       ON CONFLICT DO NOTHING`,
      [project.id, dbName, schemaName, bucketName, tenantId]
    );

    writeAuditLog('dashboard', 'create', 'project', project.id, { name, slug, region, org_id: orgId }, req.tenant?.id || req.apiKey?.tenantId || tenantId);

    return res.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        region: project.region,
        status: project.status,
        schema_name: project.schema_name,
        bucket_name: project.bucket_name,
        anon_key: project.anon_key,
        service_role_key: serviceKey.fullKey,
        api_url: project.api_url,
        org_id: project.org_id || null,
        created_at: project.created_at,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to provision project." });
  }
});

// GET /api/projects
router.get("/api/projects", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;

    let result;
    if (req.query.all === "true") {
      // Return ALL projects for this tenant (across all orgs + personal)
      // Used by the hierarchy tree to show the full workspace
      const orgIds = await pool.query(
        `SELECT org_id FROM truss_internal.org_members WHERE tenant_id = $1`, [tenantId]
      );
      const orgIdList = orgIds.rows.map(r => r.org_id);
      if (orgIdList.length > 0) {
        result = await pool.query(
          `SELECT id, name, slug, region, status, schema_name, bucket_name, api_url, org_id, tenant_id, created_at
           FROM truss_internal.projects
           WHERE status != 'deleted' AND (org_id = ANY($1) OR (tenant_id = $2 AND org_id IS NULL))
           ORDER BY created_at DESC`,
          [orgIdList, tenantId]
        );
      } else {
        result = await pool.query(
          `SELECT id, name, slug, region, status, schema_name, bucket_name, api_url, org_id, tenant_id, created_at
           FROM truss_internal.projects
           WHERE status != 'deleted' AND tenant_id = $1
           ORDER BY created_at DESC`,
          [tenantId]
        );
      }
    } else if (req.org) {
      // Org context active — show only this org's projects
      result = await pool.query(
        `SELECT id, name, slug, region, status, schema_name, bucket_name, api_url, org_id, tenant_id, created_at
         FROM truss_internal.projects
         WHERE status != 'deleted' AND org_id = $1
         ORDER BY created_at DESC`,
        [req.org.id]
      );
    } else {
      // No org context — show personal projects (no org) only
      result = await pool.query(
        `SELECT id, name, slug, region, status, schema_name, bucket_name, api_url, org_id, tenant_id, created_at
         FROM truss_internal.projects
         WHERE status != 'deleted' AND tenant_id = $1 AND org_id IS NULL
         ORDER BY created_at DESC`,
        [tenantId]
      );
    }
    const projectRows = result.rows;

    // When ?all=true, also include environments + branches per project (avoids N+1 from client)
    if (req.query.all === "true" && projectRows.length > 0) {
      const projectIds = projectRows.map(p => p.id);
      const [envResult, branchResult] = await Promise.all([
        pool.query(
          `SELECT * FROM truss_internal.environments WHERE project_id = ANY($1) AND status = 'active' ORDER BY is_default DESC, name`,
          [projectIds]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT * FROM truss_internal.branches WHERE project_id = ANY($1) AND status = 'active' ORDER BY created_at DESC`,
          [projectIds]
        ).catch(() => ({ rows: [] })),
      ]);
      // Attach environments + branches to each project
      for (const p of projectRows) {
        p.environments = envResult.rows.filter(e => e.project_id === p.id);
        p.branches = branchResult.rows.filter(b => b.project_id === p.id);
      }
    }

    return res.json({ projects: projectRows });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list projects." });
  }
});

// GET /api/admin/stats — platform owner admin dashboard (tenants, per-tenant usage, infra)
router.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();

    // --- Platform-wide queries ---
    const [projectsResult, keyCounts, dbSize, queryStats, branchCount, tableCount] = await Promise.all([
      pool.query(`SELECT * FROM truss_internal.projects ORDER BY created_at DESC`),
      pool.query(`SELECT count(*) AS total, count(*) FILTER (WHERE NOT revoked) AS active FROM truss_internal.api_keys`),
      pool.query(`SELECT pg_database_size(current_database()) AS bytes`),
      pool.query(`SELECT sum(calls) AS total_queries, sum(rows) AS total_rows FROM pg_stat_statements`).catch(() => ({ rows: [{ total_queries: 0, total_rows: 0 }] })),
      pool.query(`SELECT count(*) AS count FROM truss_internal.branches WHERE status = 'active'`),
      pool.query(`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'truss_internal')`),
    ]);

    // --- Tenant list with per-tenant usage ---
    let tenantRows = [];
    try {
      const tenantResult = await pool.query(`
        SELECT t.id, t.email, t.display_name, t.plan, t.is_admin, t.created_at, t.last_login_at,
          (SELECT count(*) FROM truss_internal.projects WHERE tenant_id = t.id AND status != 'deleted') as project_count,
          (SELECT count(*) FROM truss_internal.api_keys WHERE project_id IN (SELECT id FROM truss_internal.projects WHERE tenant_id = t.id)) as api_key_count
        FROM truss_internal.tenants t ORDER BY t.created_at DESC
      `);
      tenantRows = tenantResult.rows;
    } catch { /* tenants table may not exist yet */ }

    // --- Per-tenant billing summary (plan + boosters) ---
    let tenantBilling = {};
    try {
      const billingResult = await pool.query(`
        SELECT t.id as tenant_id, t.email, t.plan,
          COALESCE(bc.value, 'starter') as current_plan,
          (SELECT count(*) FROM truss_internal.active_boosters WHERE tenant_id = t.id) as booster_count
        FROM truss_internal.tenants t
        LEFT JOIN truss_internal.billing_config bc ON bc.tenant_id = t.id AND bc.key = 'plan'
      `);
      for (const row of billingResult.rows) {
        tenantBilling[row.tenant_id] = { current_plan: row.current_plan, booster_count: Number(row.booster_count || 0) };
      }
    } catch { /* billing tables may not be ready */ }

    // --- Recent audit logs (last 50) ---
    let auditLogs = [];
    try {
      const auditResult = await pool.query(`
        SELECT al.*, t.email as tenant_email
        FROM truss_internal.audit_logs al
        LEFT JOIN truss_internal.tenants t ON al.tenant_id = t.id
        ORDER BY al.created_at DESC LIMIT 50
      `);
      auditLogs = auditResult.rows;
    } catch { /* audit_logs may not have tenant_id yet */ }

    // --- Per-tenant schema sizes (DB) ---
    const schemaNames = projectsResult.rows.filter(p => p.schema_name).map(p => p.schema_name);
    let schemaSizes = {};
    if (schemaNames.length > 0) {
      const schemaSizeResult = await pool.query(`
        SELECT schemaname AS schema_name,
               sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS size_bytes,
               count(*) AS table_count
        FROM pg_tables
        WHERE schemaname = ANY($1)
        GROUP BY schemaname
      `, [schemaNames]);
      for (const row of schemaSizeResult.rows) {
        schemaSizes[row.schema_name] = { size_bytes: Number(row.size_bytes || 0), table_count: Number(row.table_count || 0) };
      }
    }

    // --- Per-tenant storage sizes (MinIO buckets) ---
    let bucketSizes = {};
    try {
      const client = getS3Client();
      const bucketsResp = await client.send(new ListBucketsCommand({}));
      for (const bucket of bucketsResp.Buckets || []) {
        let total = 0, objectCount = 0, token;
        do {
          const listResp = await client.send(new ListObjectsV2Command({ Bucket: bucket.Name, ContinuationToken: token }));
          for (const obj of listResp.Contents || []) { total += obj.Size || 0; objectCount++; }
          token = listResp.NextContinuationToken;
        } while (token);
        bucketSizes[bucket.Name] = { size_bytes: total, object_count: objectCount };
      }
    } catch { /* MinIO unavailable */ }

    // --- Per-tenant API key counts ---
    let perProjectKeys = {};
    try {
      const keyResult = await pool.query(`
        SELECT project_id, count(*) AS total, count(*) FILTER (WHERE NOT revoked) AS active
        FROM truss_internal.api_keys WHERE project_id IS NOT NULL GROUP BY project_id
      `);
      for (const row of keyResult.rows) {
        perProjectKeys[row.project_id] = { total: Number(row.total), active: Number(row.active) };
      }
    } catch { /* no project_id column yet */ }

    // --- Per-tenant branches ---
    let perProjectBranches = {};
    try {
      const branchResult = await pool.query(`
        SELECT project_id, count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active
        FROM truss_internal.branches WHERE project_id IS NOT NULL GROUP BY project_id
      `);
      for (const row of branchResult.rows) {
        perProjectBranches[row.project_id] = { total: Number(row.total), active: Number(row.active) };
      }
    } catch { /* no project_id column */ }

    // --- Tenant databases ---
    let tenantDatabases = [];
    try {
      tenantDatabases = await listTenantDatabases();
      // Update sizes for active tenant DBs
      for (const td of tenantDatabases) {
        try {
          const sizeResult = await pool.query(`SELECT pg_database_size($1) AS bytes`, [td.db_name]);
          td.pg_size_bytes = Number(sizeResult.rows[0]?.bytes || 0);
        } catch { td.pg_size_bytes = 0; }
      }
    } catch { /* tenant_databases table may not exist yet */ }

    // --- Storage + Auth totals ---
    const [totalStorageBytes, totalAuthMau] = await Promise.all([
      measureStorageSizeBytes(),
      measureAuthMau(),
    ]);

    // --- Enrich tenants with billing info ---
    const tenantsEnriched = tenantRows.map(t => ({
      ...t,
      project_count: Number(t.project_count || 0),
      api_key_count: Number(t.api_key_count || 0),
      billing: tenantBilling[t.id] || { current_plan: t.plan || 'starter', booster_count: 0 },
    }));

    // --- Enrich projects with per-tenant metrics (legacy "tenants" field = projects) ---
    const projects = projectsResult.rows.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      region: p.region,
      status: p.status,
      schema_name: p.schema_name,
      bucket_name: p.bucket_name,
      tenant_id: p.tenant_id,
      created_at: p.created_at,
      updated_at: p.updated_at,
      db: schemaSizes[p.schema_name] || { size_bytes: 0, table_count: 0 },
      storage: bucketSizes[p.bucket_name] || { size_bytes: 0, object_count: 0 },
      api_keys: perProjectKeys[p.id] || { total: 0, active: 0 },
      branches: perProjectBranches[p.id] || { total: 0, active: 0 },
    }));

    return res.json({
      platform: {
        total_projects: projectsResult.rows.length,
        active_projects: projectsResult.rows.filter(p => p.status === "active").length,
        deleted_projects: projectsResult.rows.filter(p => p.status === "deleted").length,
        total_api_keys: Number(keyCounts.rows[0]?.total || 0),
        active_api_keys: Number(keyCounts.rows[0]?.active || 0),
        total_branches: Number(branchCount.rows[0]?.count || 0),
        total_tenants: tenantsEnriched.length,
      },
      infrastructure: {
        db_size_bytes: Number(dbSize.rows[0]?.bytes || 0),
        storage_size_bytes: totalStorageBytes,
        auth_mau: totalAuthMau,
        total_queries: Number(queryStats.rows[0]?.total_queries || 0),
        total_rows_processed: Number(queryStats.rows[0]?.total_rows || 0),
        table_count: Number(tableCount.rows[0]?.count || 0),
      },
      tenants: tenantsEnriched,
      // Legacy: projects array (formerly called "tenants" in older admin.html)
      projects,
      audit_logs: auditLogs,
      tenant_databases: tenantDatabases,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch admin stats." });
  }
});

// GET /api/projects/by-slug/:slug
router.get("/api/projects/by-slug/:slug", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await pool.query(
      `SELECT * FROM truss_internal.projects
       WHERE slug = $1
         AND (tenant_id = $2 OR org_id IN (SELECT org_id FROM truss_internal.org_members WHERE tenant_id = $2))`,
      [req.params.slug, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found." });
    return res.json({ project: { ...result.rows[0], service_role_key: decryptKey(result.rows[0].service_role_key) } });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get project by slug." });
  }
});

// GET /api/projects/:id
router.get("/api/projects/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;
    const result = await pool.query(
      `SELECT * FROM truss_internal.projects
       WHERE id = $1
         AND (tenant_id = $2 OR org_id IN (SELECT org_id FROM truss_internal.org_members WHERE tenant_id = $2))`,
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found." });

    // Include environments for the project
    let environments = [];
    try {
      const envResult = await pool.query(
        `SELECT * FROM truss_internal.environments
         WHERE project_id = $1 AND status != 'deleted'
         ORDER BY is_default DESC, name ASC`,
        [req.params.id]
      );
      environments = envResult.rows;
    } catch { /* environments table may not exist yet */ }

    return res.json({ project: { ...result.rows[0], service_role_key: decryptKey(result.rows[0].service_role_key), environments } });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get project." });
  }
});

// PATCH /api/projects/:id — requires owner, admin, or member role
router.patch("/api/projects/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;

    // Check role — viewers cannot edit
    const role = await getProjectRole(tenantId, req.params.id, pool);
    if (!role) return res.status(404).json({ error: "Project not found." });
    if (role === "viewer") return res.status(403).json({ error: "Viewer role cannot modify projects." });

    const sets = [];
    const vals = [];
    let idx = 1;

    if (typeof req.body?.name === "string") {
      sets.push(`name = $${idx++}`);
      vals.push(req.body.name.trim());
    }
    if (typeof req.body?.status === "string" && ["provisioning", "active", "paused", "deleted"].includes(req.body.status)) {
      sets.push(`status = $${idx++}`);
      vals.push(req.body.status);
    }

    if (sets.length === 0) return res.status(400).json({ error: "No valid fields to update." });

    sets.push(`updated_at = now()`);
    vals.push(req.params.id);

    const result = await pool.query(
      `UPDATE truss_internal.projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found." });
    const updated = result.rows[0];
    writeAuditLog('dashboard', 'update', 'project', updated.id, { name: updated.name, status: updated.status }, req.tenant?.id || req.apiKey?.tenantId || tenantId);
    return res.json({ project: updated });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update project." });
  }
});

// DELETE /api/projects/:id — requires owner role (direct owner or org owner)
router.delete("/api/projects/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DATABASE_URL is not set." });
  try {
    await ensureInternalSchema();

    const tenantId = req.tenant?.id || null;

    // Check role — only owners can delete
    const role = await getProjectRole(tenantId, req.params.id, pool);
    if (!role) return res.status(404).json({ error: "Project not found." });
    if (role !== "owner") return res.status(403).json({ error: "Only project owners can delete projects." });

    const projResult = await pool.query(
      `SELECT * FROM truss_internal.projects WHERE id = $1`,
      [req.params.id]
    );
    if (projResult.rows.length === 0) return res.status(404).json({ error: "Project not found." });
    const project = projResult.rows[0];

    // Soft delete — set status to 'deleted'
    await pool.query(
      `UPDATE truss_internal.projects SET status = 'deleted', updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    // Drop the schema from the tenant's database (or platform DB for legacy projects)
    const safeSchema = project.schema_name.replace(/[^a-z0-9_]/g, "");
    const targetPool = getCustomerPool(req);
    await targetPool.query(`DROP SCHEMA IF EXISTS ${safeSchema} CASCADE`);

    // Delete MinIO bucket (empty it first)
    try {
      const s3 = getS3Client();
      let continuationToken;
      do {
        const listed = await s3.send(
          new ListObjectsV2Command({
            Bucket: project.bucket_name,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          })
        );
        const objects = listed.Contents || [];
        if (objects.length > 0) {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: project.bucket_name,
              Delete: {
                Objects: objects.map((item) => ({ Key: item.Key || "" })).filter((item) => Boolean(item.Key)),
                Quiet: true,
              },
            })
          );
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
      await s3.send(new DeleteBucketCommand({ Bucket: project.bucket_name }));
    } catch (bucketErr) {
      log.error({ err: bucketErr?.message }, "Failed to delete project bucket");
    }

    // Revoke all API keys for this project
    await pool.query(
      `UPDATE truss_internal.api_keys SET revoked = true WHERE project_id = $1`,
      [req.params.id]
    );

    writeAuditLog('dashboard', 'delete', 'project', req.params.id, { name: project.name, slug: project.slug }, req.tenant?.id || req.apiKey?.tenantId || tenantId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete project." });
  }
});
