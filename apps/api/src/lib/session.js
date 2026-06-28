import crypto from "node:crypto";
import { getPool, getPoolForDatabase } from "./state.js";
import { getTenantDbName, provisionTenantDatabase } from "./tenant-db.js";
import { logLogin, logSecurityEvent } from "./observability.js";
import { ensureInternalSchema, writeAuditLog } from "./internal.js";
import { generateApiKey } from "./api-keys.js";
import { encryptValue } from "../routes/connections.js";
import logger from "./logger.js";

const API_BASE_URL = process.env.API_URL || process.env.VITE_API_BASE_URL || `http://localhost:${process.env.API_PORT || 8787}`;

const log = logger.child({ module: "session" });

export function parseCookie(cookieHeader, name) {
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Sanitize error messages for API responses.
 * In production: returns a generic message to avoid leaking SQL/internal details.
 * In development: returns the full error message for debugging.
 */
function sanitizeError(error) {
  if (process.env.NODE_ENV === "production") {
    return "An internal error occurred";
  }
  return error instanceof Error ? error.message : String(error);
}

const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL || "http://127.0.0.1:4433";
let AUTH_REQUIRED = process.env.TRUSS_AUTH_REQUIRED !== "false"; // default true
const ADMIN_IDENTITY_IDS = (process.env.TRUSS_ADMIN_IDENTITY_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

// Safety: force auth on in production even if TRUSS_AUTH_REQUIRED=false
if (!AUTH_REQUIRED && process.env.NODE_ENV === "production") {
  log.warn("TRUSS_AUTH_REQUIRED=false in production — forcing authentication ON");
  AUTH_REQUIRED = true;
}
if (!AUTH_REQUIRED) {
  log.warn("authentication DISABLED (TRUSS_AUTH_REQUIRED=false) — all requests get admin access");
}

// Simple session cache: cookie -> { tenant, expiresAt }
const sessionCache = new Map();
const CACHE_TTL_MS = 30_000;

// Evict stale entries every 60s to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionCache) {
    if (entry.expiresAt <= now) sessionCache.delete(key);
  }
}, 60_000).unref();

export function invalidateSessionCache(sessionToken) {
  if (sessionToken) sessionCache.delete(sessionToken);
}

export async function verifySession(req) {
  // Extract truss_session token from our cookie
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("truss_session="));
  const sessionToken = match ? match.split("=").slice(1).join("=") : null;
  if (!sessionToken) return null;

  // Check cache
  const cached = sessionCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) return cached.tenant;

  try {
    // Verify with Kratos using X-Session-Token header (API flow token)
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { "x-session-token": sessionToken },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;

    const session = await resp.json();
    const identityId = session.identity?.id;
    const email = session.identity?.traits?.email || "";
    if (!identityId) return null;

    // Look up or auto-provision tenant
    const pool = getPool();
    if (!pool) return null;

    let result = await pool.query(
      `SELECT id, identity_id, email, display_name, plan, is_admin, status FROM truss_internal.tenants WHERE identity_id = $1`,
      [identityId]
    );

    if (result.rows.length === 0) {
      // Auto-provision tenant on first login. Single-instance core has no plans/trials.
      const isAdmin = ADMIN_IDENTITY_IDS.includes(identityId) || session.identity?.metadata_public?.truss_admin === true;
      const initialPlan = "business";
      result = await pool.query(
        `INSERT INTO truss_internal.tenants (identity_id, email, display_name, is_admin, plan)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, identity_id, email, display_name, plan, is_admin`,
        [identityId, email, email.split("@")[0], isAdmin, initialPlan]
      );
      // Insert default billing config for new tenant
      const tenantId = result.rows[0].id;
      await pool.query(
        `INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ('plan', $2, $1) ON CONFLICT DO NOTHING`,
        [tenantId, initialPlan]
      );

      // Auto-provision default org + project (fire-and-forget, don't block login)
      autoProvisionDefaults(tenantId, email, pool).catch(err => {
        log.warn({ err: err.message, tenantId }, "failed to auto-provision defaults for new tenant");
      });
    }

    // Update last_login_at
    const tenant = result.rows[0];
    pool.query(
      `UPDATE truss_internal.tenants SET last_login_at = now() WHERE id = $1 AND (last_login_at IS NULL OR last_login_at < now() - interval '1 hour')`,
      [tenant.id]
    ).catch(() => {});

    const tenantInfo = {
      id: tenant.id,
      identityId: tenant.identity_id,
      email: tenant.email,
      displayName: tenant.display_name,
      plan: tenant.plan,
      isAdmin: tenant.is_admin || ADMIN_IDENTITY_IDS.includes(tenant.identity_id) || session.identity?.metadata_public?.truss_admin === true,
    };

    // Cache
    sessionCache.set(sessionToken, { tenant: tenantInfo, expiresAt: Date.now() + CACHE_TTL_MS });

    // Log successful login (fire-and-forget)
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    const ua = req.headers["user-agent"] || "";
    logLogin(tenantInfo.id, identityId, ip, ua, true);

    return tenantInfo;
  } catch (err) {
    log.error({ err: err.message }, "session verification error");
    // Log failed login attempt
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    logLogin(null, null, ip, req.headers["user-agent"] || "", false);
    logSecurityEvent("failed_login", { error: err.message }, ip, null);
    return null;
  }
}

// ── Auto-provision default org + project for new tenants ──

async function autoProvisionDefaults(tenantId, email, pool) {
  await ensureInternalSchema();

  // 1. Create default org (named after user)
  const displayName = email.split("@")[0] || "User";
  const orgName = `${displayName}'s Workspace`;
  const baseSlug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
  // Add short suffix to avoid slug conflicts
  const suffix = crypto.randomBytes(2).toString("hex");
  const orgSlug = `${baseSlug}-${suffix}`;

  const orgResult = await pool.query(
    `INSERT INTO truss_internal.organizations (name, slug, owner_tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [orgName, orgSlug, tenantId]
  );

  if (orgResult.rows.length === 0) {
    log.warn({ tenantId, orgSlug }, "default org slug conflict, skipping auto-provision");
    return;
  }
  const org = orgResult.rows[0];

  // Add tenant as org owner
  await pool.query(
    `INSERT INTO truss_internal.org_members (org_id, tenant_id, role, joined_at)
     VALUES ($1, $2, 'owner', now()) ON CONFLICT DO NOTHING`,
    [org.id, tenantId]
  );

  // 2. Provision tenant database
  let dbName = await getTenantDbName(tenantId);
  if (!dbName) {
    dbName = await provisionTenantDatabase(tenantId);
  }

  // 3. Create default project inside the org
  const projectSlug = "default";
  const schemaName = `project_${projectSlug}`;
  const tenantShort = tenantId.replace(/-/g, "").slice(0, 12).toLowerCase();
  const bucketName = `t-${tenantShort}-${projectSlug}`;

  const anonKey = generateApiKey("anon");
  const serviceKey = generateApiKey("service_role");

  // service_role_key is a retrievable (Supabase-style) secret displayed in the
  // dashboard, so it cannot be hashed here. Encrypt it at rest (AES-256-GCM via
  // connections.js) instead of storing plaintext. anon_key is a public key and
  // is stored as-is. The api_keys table still holds bcrypt-style hashes for auth.
  const projResult = await pool.query(
    `INSERT INTO truss_internal.projects
      (name, slug, region, schema_name, bucket_name, anon_key, service_role_key, api_url, status, tenant_id, org_id, db_name, db_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, 'dedicated')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    ["Default Project", projectSlug, "auto", schemaName, bucketName, anonKey.fullKey, encryptValue(serviceKey.fullKey), `${API_BASE_URL}/v1/projects/${projectSlug}`, tenantId, org.id, dbName]
  );

  if (projResult.rows.length > 0) {
    const project = projResult.rows[0];
    // Insert API keys
    await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["anon", anonKey.prefix, anonKey.hash, "Default Project anon key", project.id, tenantId]
    );
    await pool.query(
      `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["service_role", serviceKey.prefix, serviceKey.hash, "Default Project service_role key", project.id, tenantId]
    );

    // 4. Create default environments (Production + Staging)
    await pool.query(
      `INSERT INTO truss_internal.environments
        (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
       VALUES ($1, 'Production', 'production', $2, $3, $4, true, $5)
       ON CONFLICT DO NOTHING`,
      [project.id, dbName, schemaName, bucketName, tenantId]
    );
    await pool.query(
      `INSERT INTO truss_internal.environments
        (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
       VALUES ($1, 'Staging', 'staging', $2, $3, $4, false, $5)
       ON CONFLICT DO NOTHING`,
      [project.id, dbName, `${schemaName}_staging`, `${bucketName}-staging`, tenantId]
    );

    // 5. Create a sample branch so the hierarchy is fully visible
    const branchLabel = "dev/feature-sample";
    const branchDb = `truss_branch_sample_${Date.now()}`;
    await pool.query(
      `INSERT INTO truss_internal.branches
        (parent_db, branch_db, label, status, ttl_hours, tenant_id, project_id)
       VALUES ($1, $2, $3, 'active', 168, $4, $5)
       ON CONFLICT DO NOTHING`,
      [dbName, branchDb, branchLabel, tenantId, project.id]
    );

    writeAuditLog("system", "auto_provision", "project", project.id, { org: orgSlug, project: projectSlug }, tenantId);
  }

  writeAuditLog("system", "auto_provision", "organization", org.id, { name: orgName, slug: orgSlug }, tenantId);
  log.info({ tenantId, orgSlug, projectSlug }, "auto-provisioned default org + project for new tenant");
}

// Exempt paths that don't need auth
// Paths that skip auth entirely (login/register must be reachable without a session)
const EXEMPT_PATHS = ["/api/health", "/api/auth/login", "/api/auth/register", "/api/auth/recovery", "/api/billing/webhook"];

export function sessionMiddleware(req, res, next) {
  // Skip auth for exempt paths
  if (EXEMPT_PATHS.some(p => req.path === p || req.path.startsWith(p + "/"))) return next();
  // Skip for /v1/* (uses apiKeyAuth instead)
  if (req.path.startsWith("/v1/")) return next();
  // Cloud overlay (truss-cloud) may have already attached a tenant in a preSession
  // middleware (e.g. the demo-tenant resolver). If so, auth is already resolved.
  if (req.tenant) return next();
  if (!AUTH_REQUIRED) {
    // Dev mode: if user explicitly logged out, don't auto-attach tenant
    const loggedOut = parseCookie(req.headers.cookie || "", "truss_logged_out");
    if (loggedOut) {
      // Return no tenant — the frontend will show the login screen
      return next();
    }
    // Dev mode: check for dev tenant switcher cookie
    const devTenantId = parseCookie(req.headers.cookie || "", "truss_dev_tenant");
    if (devTenantId && devTenantId !== "local") {
      // Look up the dev tenant from the database
      const pool = getPool();
      if (pool) {
        return pool.query(`SELECT id, identity_id, email, display_name, plan, is_admin FROM truss_internal.tenants WHERE id = $1`, [devTenantId])
          .then(({ rows }) => {
            if (rows.length > 0) {
              const t = rows[0];
              req.tenant = { id: t.id, identityId: t.identity_id, email: t.email, displayName: t.display_name, plan: t.plan, isAdmin: t.is_admin };
            } else {
              req.tenant = { id: "local", identityId: "local", email: "dev@localhost", displayName: "Local Dev", plan: "business", isAdmin: true };
            }
            next();
          })
          .catch(() => {
            req.tenant = { id: "local", identityId: "local", email: "dev@localhost", displayName: "Local Dev", plan: "business", isAdmin: true };
            next();
          });
      }
    }
    // Default: attach local dev tenant
    req.tenant = { id: "local", identityId: "local", email: "dev@localhost", displayName: "Local Dev", plan: "business", isAdmin: true };
    return next();
  }

  verifySession(req).then(tenant => {
    if (!tenant) {
      // /api/auth/session should return 401 gracefully, not block
      if (req.path === "/api/auth/session") return res.status(401).json({ error: "Not authenticated" });
      return res.status(401).json({ error: "Authentication required. Please log in." });
    }
    req.tenant = tenant;
    next();
  }).catch(() => {
    if (req.path === "/api/auth/session") return res.status(401).json({ error: "Not authenticated" });
    res.status(401).json({ error: "Authentication required." });
  });
}

export function adminMiddleware(req, res, next) {
  // Demo users get read-only admin access — demoWriteProtection blocks mutations separately
  if (!req.tenant?.isAdmin && !req.tenant?.isDemo) return res.status(403).json({ error: "Admin access required." });
  next();
}

// ─── Org resolution middleware ───
// Resolves the active org for the current tenant and attaches it as req.org.
// Priority: x-org-id header > stored active_org preference > first membership > null (solo user).

export function resolveOrg(req, res, next) {
  // Skip for unauthenticated, demo, exempt, or /v1/* paths
  if (!req.tenant || req.tenant.isDemo || req.path.startsWith("/api/auth/") || req.path.startsWith("/v1/")) {
    return next();
  }

  const pool = getPool();
  if (!pool) return next();

  const tenantId = req.tenant.id;
  const headerOrgId = req.headers["x-org-id"] || null;

  _resolveOrgForTenant(tenantId, headerOrgId, pool)
    .then(org => {
      req.org = org; // null if solo user
      next();
    })
    .catch(() => {
      req.org = null;
      next();
    });
}

async function _resolveOrgForTenant(tenantId, headerOrgId, pool) {
  // 1) If explicit header, validate membership and return
  if (headerOrgId) {
    const result = await pool.query(
      `SELECT o.id, o.name, o.slug, o.plan, m.role,
              (SELECT count(*)::int FROM truss_internal.org_members WHERE org_id = o.id) AS member_count
       FROM truss_internal.organizations o
       JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
       WHERE o.id = $2`,
      [tenantId, headerOrgId]
    );
    if (result.rows.length > 0) {
      const r = result.rows[0];
      return { id: r.id, name: r.name, slug: r.slug, role: r.role, plan: r.plan, memberCount: r.member_count };
    }
  }

  // 2) Check stored active_org preference in billing_config
  try {
    const prefResult = await pool.query(
      `SELECT value FROM truss_internal.billing_config WHERE key = 'active_org' AND tenant_id = $1`,
      [tenantId]
    );
    if (prefResult.rows.length > 0) {
      const storedOrgId = prefResult.rows[0].value;
      const result = await pool.query(
        `SELECT o.id, o.name, o.slug, o.plan, m.role,
                (SELECT count(*)::int FROM truss_internal.org_members WHERE org_id = o.id) AS member_count
         FROM truss_internal.organizations o
         JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
         WHERE o.id = $2`,
        [tenantId, storedOrgId]
      );
      if (result.rows.length > 0) {
        const r = result.rows[0];
        return { id: r.id, name: r.name, slug: r.slug, role: r.role, plan: r.plan, memberCount: r.member_count };
      }
    }
  } catch { /* billing_config may not exist yet */ }

  // 3) Fall back to first org membership
  const fallback = await pool.query(
    `SELECT o.id, o.name, o.slug, o.plan, m.role,
            (SELECT count(*)::int FROM truss_internal.org_members WHERE org_id = o.id) AS member_count
     FROM truss_internal.organizations o
     JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
     ORDER BY m.joined_at ASC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  if (fallback.rows.length > 0) {
    const r = fallback.rows[0];
    return { id: r.id, name: r.name, slug: r.slug, role: r.role, plan: r.plan, memberCount: r.member_count };
  }

  // 4) No orgs — solo user
  return null;
}

/**
 * Middleware that checks if the current user has the required abilities.
 * Admins bypass all checks. For non-admin users, the check currently passes
 * (the API is the security boundary; this is a hook for future Keto integration).
 */
function requirePermission(...abilities) {
  return (req, res, next) => {
    if (!req.tenant) return res.status(401).json({ error: "Authentication required." });
    if (req.tenant.isAdmin) return next(); // admins bypass all checks
    // For now, allow all authenticated users through — the real security
    // boundary is the individual route handlers + adminMiddleware.
    // Future: query Keto or check cached abilities against the required set.
    next();
  };
}

// ─── Tenant pool resolution ───
// Resolves the tenant's dedicated database pool and attaches it to req.tenantPool.

const SKIP_TENANT_POOL_PREFIXES = [
  "/api/auth/", "/api/billing/", "/api/admin/", "/api/orgs/",
  "/api/settings/", "/api/dev/", "/api/health",
];

export function resolveTenantPool(req, res, next) {
  // Skip if no tenant, demo user, or platform-only routes
  if (!req.tenant || req.tenant.isDemo) return next();
  const p = req.path;
  if (SKIP_TENANT_POOL_PREFIXES.some(prefix => p === prefix.slice(0, -1) || p.startsWith(prefix))) return next();

  // Async resolution — look up tenant's database, attach pool
  getTenantDbName(req.tenant.id).then(dbName => {
    if (dbName) {
      req.tenantPool = getPoolForDatabase(dbName);
      req.tenantDbName = dbName;
    }
    // If no dbName, tenantPool stays null → getCustomerPool() will fallback to platform pool
    next();
  }).catch(err => {
    // Don't block the request — just log and continue with platform pool
    log.warn({ err: err.message, tenantId: req.tenant.id }, "Failed to resolve tenant pool");
    next();
  });
}

// ─── Demo write protection ───
// Blocks all mutations for demo users. Safe read-only preview.
// ─── Environment resolution middleware ───
// Resolves the active environment from x-environment-id header and attaches it as req.environment.

export function resolveEnvironment(req, res, next) {
  const envId = req.headers["x-environment-id"];
  if (!envId) return next();
  const pool = getPool();
  if (!pool || !req.tenant) return next();
  pool.query(
    `SELECT * FROM truss_internal.environments WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
    [envId, req.tenant.id]
  ).then(result => {
    if (result.rows.length > 0) req.environment = result.rows[0];
    next();
  }).catch(() => next());
}

/**
 * Get the effective role a tenant has on a project.
 * Returns: "owner" | "admin" | "member" | "viewer" | null
 * - Direct ownership (tenant_id match) → "owner"
 * - Org membership → their org role
 * - No access → null
 */
export async function getProjectRole(tenantId, projectId, pool) {
  if (!tenantId || !projectId || !pool) return null;
  try {
    const result = await pool.query(
      `SELECT tenant_id, org_id FROM truss_internal.projects WHERE id = $1`,
      [projectId]
    );
    if (result.rows.length === 0) return null;
    const project = result.rows[0];

    // Direct owner
    if (project.tenant_id === tenantId) return "owner";

    // Org membership
    if (project.org_id) {
      const memberResult = await pool.query(
        `SELECT role FROM truss_internal.org_members WHERE org_id = $1 AND tenant_id = $2`,
        [project.org_id, tenantId]
      );
      if (memberResult.rows.length > 0) return memberResult.rows[0].role;
    }

    return null;
  } catch {
    return null;
  }
}

