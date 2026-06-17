import express from "express";
import crypto from "node:crypto";
import { getPool, KETO_WRITE_URL, KETO_ADMIN_TOKEN } from "../lib/state.js";
import { ensureInternalSchema, writeAuditLog, upsertSettingsKey } from "../lib/internal.js";
import { sendInviteEmail, isEmailConfigured } from "../lib/email.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "orgs" });

export const router = express.Router();

// ─── Role hierarchy ───

const ROLE_RANK = { owner: 4, admin: 3, member: 2, viewer: 1 };

// ─── Keto relation tuple helpers (fire-and-forget) ───

async function writeKetoOrgTuple(orgId, tenantId, role) {
  if (!KETO_WRITE_URL) return;
  try {
    await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(KETO_ADMIN_TOKEN ? { Authorization: `Bearer ${KETO_ADMIN_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        namespace: "Organization",
        object: orgId,
        relation: role,
        subject_id: tenantId,
      }),
    });
  } catch { /* Keto unavailable — org membership still tracked in DB */ }
}

async function deleteKetoOrgTuple(orgId, tenantId, role) {
  if (!KETO_WRITE_URL) return;
  try {
    const qs = new URLSearchParams({
      namespace: "Organization",
      object: orgId,
      relation: role,
      subject_id: tenantId,
    });
    await fetch(`${KETO_WRITE_URL}/admin/relation-tuples?${qs}`, {
      method: "DELETE",
      headers: KETO_ADMIN_TOKEN ? { Authorization: `Bearer ${KETO_ADMIN_TOKEN}` } : {},
    });
  } catch { /* Keto unavailable — best effort */ }
}

async function replaceKetoOrgRole(orgId, tenantId, oldRole, newRole) {
  await deleteKetoOrgTuple(orgId, tenantId, oldRole);
  await writeKetoOrgTuple(orgId, tenantId, newRole);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// ─── Helper: check if tenant has required role in org ───

async function requireOrgRole(req, res, orgId, minRole) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    res.status(401).json({ error: "Unauthorized." });
    return null;
  }
  const result = await getPool().query(
    `SELECT id, role FROM truss_internal.org_members
     WHERE org_id = $1 AND tenant_id = $2`,
    [orgId, tenantId]
  );
  if (result.rowCount === 0) {
    res.status(403).json({ error: "You are not a member of this organization." });
    return null;
  }
  const member = result.rows[0];
  if ((ROLE_RANK[member.role] || 0) < (ROLE_RANK[minRole] || 0)) {
    res.status(403).json({ error: `Requires ${minRole} role or higher.` });
    return null;
  }
  return member;
}

// ─── GET /api/orgs — list orgs for current tenant ───

router.get("/api/orgs", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();
    const result = await getPool().query(
      `SELECT o.*, m.role AS my_role,
              (SELECT count(*)::int FROM truss_internal.org_members WHERE org_id = o.id) AS member_count
       FROM truss_internal.organizations o
       JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
       ORDER BY o.created_at DESC`,
      [tenantId]
    );
    return res.json({ orgs: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/orgs/active — set active org for current tenant ───

router.post("/api/orgs/active", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const orgId = req.body?.orgId ?? null; // null to clear active org (go solo)

  try {
    await ensureInternalSchema();

    // If setting an org, verify membership
    if (orgId) {
      const member = await getPool().query(
        `SELECT id FROM truss_internal.org_members WHERE org_id = $1 AND tenant_id = $2`,
        [orgId, tenantId]
      );
      if (member.rowCount === 0) {
        return res.status(403).json({ error: "You are not a member of this organization." });
      }
    }

    if (orgId) {
      await upsertSettingsKey("active_org", orgId, tenantId);
    } else {
      // Clear the active org preference
      await getPool().query(
        `DELETE FROM truss_internal.billing_config WHERE key = 'active_org' AND tenant_id = $1`,
        [tenantId]
      );
    }

    return res.json({ ok: true, active_org_id: orgId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/orgs — create new org ───

router.post("/api/orgs", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required." });

  const slug = req.body?.slug ? slugify(req.body.slug) : slugify(name);
  if (!slug) return res.status(400).json({ error: "Could not generate a valid slug from the name." });

  const pool = getPool();

  try {
    await ensureInternalSchema();

    // Single-instance core: one organization max. truss-cloud (TRUSS_MULTI_TENANT=true) lifts this.
    if (process.env.TRUSS_MULTI_TENANT !== "true") {
      const { rows: [cap] } = await pool.query("SELECT count(*)::int AS n FROM truss_internal.organizations");
      if (cap.n >= 1) return res.status(402).json({ error: "Single-instance edition is limited to one organization. Upgrade to Truss Cloud or deploy another instance." });
    }

    // Insert org
    const orgResult = await pool.query(
      `INSERT INTO truss_internal.organizations (name, slug, owner_tenant_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, slug, tenantId]
    );
    const org = orgResult.rows[0];

    // Add creator as owner
    await pool.query(
      `INSERT INTO truss_internal.org_members (org_id, tenant_id, role, joined_at)
       VALUES ($1, $2, 'owner', now())`,
      [org.id, tenantId]
    );

    // Write Keto relation tuple
    writeKetoOrgTuple(org.id, tenantId, "owner").catch(() => {});

    // Inherit the creating tenant's plan so seat limits match
    const tenantPlan = req.tenant?.plan || "starter";
    if (tenantPlan !== "starter") {
      await pool.query(`UPDATE truss_internal.organizations SET plan = $1 WHERE id = $2`, [tenantPlan, org.id]);
      org.plan = tenantPlan;
    }

    await writeAuditLog(tenantId, "org.create", "organization", org.id, { name, slug }, tenantId);
    return res.status(201).json(org);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: `An organization with slug "${slug}" already exists.` });
    }
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/orgs/:id — get org details + members + pending invites ───

router.get("/api/orgs/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const orgId = req.params.id;
  const pool = getPool();

  try {
    await ensureInternalSchema();

    // Verify membership
    const member = await requireOrgRole(req, res, orgId, "viewer");
    if (!member) return;

    const orgResult = await pool.query(
      `SELECT * FROM truss_internal.organizations WHERE id = $1`,
      [orgId]
    );
    if (orgResult.rowCount === 0) return res.status(404).json({ error: "Organization not found." });

    const membersResult = await pool.query(
      `SELECT m.id, m.tenant_id, m.role, m.invited_at, m.joined_at,
              t.email, t.display_name
       FROM truss_internal.org_members m
       LEFT JOIN truss_internal.tenants t ON t.id = m.tenant_id
       WHERE m.org_id = $1
       ORDER BY m.joined_at ASC NULLS LAST`,
      [orgId]
    );

    const invitesResult = await pool.query(
      `SELECT id, email, role, expires_at, created_at
       FROM truss_internal.invitations
       WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [orgId]
    );

    return res.json({
      ...orgResult.rows[0],
      members: membersResult.rows,
      invites: invitesResult.rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /api/orgs/:id — update org ───

router.patch("/api/orgs/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const orgId = req.params.id;

  try {
    await ensureInternalSchema();
    const member = await requireOrgRole(req, res, orgId, "admin");
    if (!member) return;

    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required." });

    const result = await getPool().query(
      `UPDATE truss_internal.organizations SET name = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [name, orgId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Organization not found." });

    await writeAuditLog(req.tenant.id, "org.update", "organization", orgId, { name }, req.tenant.id);
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /api/orgs/:id — delete org (owner only) ───

router.delete("/api/orgs/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const orgId = req.params.id;

  try {
    await ensureInternalSchema();
    const member = await requireOrgRole(req, res, orgId, "owner");
    if (!member) return;

    // Get all members to clean up Keto tuples
    const membersResult = await getPool().query(
      `SELECT tenant_id, role FROM truss_internal.org_members WHERE org_id = $1`, [orgId]
    );

    await getPool().query(`DELETE FROM truss_internal.organizations WHERE id = $1`, [orgId]);

    // Clean up Keto relation tuples (fire-and-forget)
    for (const m of membersResult.rows) {
      deleteKetoOrgTuple(orgId, m.tenant_id, m.role).catch(() => {});
    }

    await writeAuditLog(req.tenant.id, "org.delete", "organization", orgId, {}, req.tenant.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/orgs/:id/members — list members with roles ───

router.get("/api/orgs/:id/members", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const orgId = req.params.id;

  try {
    await ensureInternalSchema();
    const member = await requireOrgRole(req, res, orgId, "viewer");
    if (!member) return;

    const result = await getPool().query(
      `SELECT m.id, m.tenant_id, m.role, m.invited_at, m.joined_at,
              t.email, t.display_name
       FROM truss_internal.org_members m
       LEFT JOIN truss_internal.tenants t ON t.id = m.tenant_id
       WHERE m.org_id = $1
       ORDER BY m.joined_at ASC NULLS LAST`,
      [orgId]
    );
    return res.json({ members: result.rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /api/orgs/:id/members/:memberId — change member role ───

router.patch("/api/orgs/:id/members/:memberId", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { id: orgId, memberId } = req.params;
  const newRole = (req.body?.role || "").trim();

  if (!newRole || !ROLE_RANK[newRole]) {
    return res.status(400).json({ error: "Invalid role. Must be one of: owner, admin, member, viewer." });
  }

  try {
    await ensureInternalSchema();
    const caller = await requireOrgRole(req, res, orgId, "admin");
    if (!caller) return;

    // Look up the target member
    const targetResult = await getPool().query(
      `SELECT id, tenant_id, role FROM truss_internal.org_members WHERE id = $1 AND org_id = $2`,
      [memberId, orgId]
    );
    if (targetResult.rowCount === 0) return res.status(404).json({ error: "Member not found." });

    const target = targetResult.rows[0];

    // Cannot change own role
    if (target.tenant_id === req.tenant.id) {
      return res.status(400).json({ error: "Cannot change your own role." });
    }

    // Cannot change someone with equal or higher rank (unless you are owner)
    if (caller.role !== "owner" && ROLE_RANK[target.role] >= ROLE_RANK[caller.role]) {
      return res.status(403).json({ error: "Cannot change the role of a member with equal or higher rank." });
    }

    const result = await getPool().query(
      `UPDATE truss_internal.org_members SET role = $1 WHERE id = $2 RETURNING *`,
      [newRole, memberId]
    );

    // Update Keto relation tuple
    replaceKetoOrgRole(orgId, target.tenant_id, target.role, newRole).catch(() => {});

    await writeAuditLog(req.tenant.id, "org.member.role_change", "org_member", memberId, { orgId, newRole }, req.tenant.id);
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /api/orgs/:id/members/:memberId — remove member ───

router.delete("/api/orgs/:id/members/:memberId", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { id: orgId, memberId } = req.params;

  try {
    await ensureInternalSchema();
    const caller = await requireOrgRole(req, res, orgId, "admin");
    if (!caller) return;

    // Look up the target member
    const targetResult = await getPool().query(
      `SELECT id, tenant_id, role FROM truss_internal.org_members WHERE id = $1 AND org_id = $2`,
      [memberId, orgId]
    );
    if (targetResult.rowCount === 0) return res.status(404).json({ error: "Member not found." });

    const target = targetResult.rows[0];

    // Cannot remove owner
    if (target.role === "owner") {
      return res.status(400).json({ error: "Cannot remove the organization owner." });
    }

    // Cannot remove someone with equal or higher rank (unless you are owner)
    if (caller.role !== "owner" && ROLE_RANK[target.role] >= ROLE_RANK[caller.role]) {
      return res.status(403).json({ error: "Cannot remove a member with equal or higher rank." });
    }

    await getPool().query(
      `DELETE FROM truss_internal.org_members WHERE id = $1 AND org_id = $2`,
      [memberId, orgId]
    );

    // Remove Keto relation tuple
    deleteKetoOrgTuple(orgId, target.tenant_id, target.role).catch(() => {});

    await writeAuditLog(req.tenant.id, "org.member.remove", "org_member", memberId, { orgId }, req.tenant.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/orgs/:id/invite — create invitation ───

router.post("/api/orgs/:id/invite", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const orgId = req.params.id;
  const email = (req.body?.email || "").trim().toLowerCase();
  const role = (req.body?.role || "member").trim();

  if (!email) return res.status(400).json({ error: "email is required." });
  if (!ROLE_RANK[role] || role === "owner") {
    return res.status(400).json({ error: "Invalid role. Must be one of: admin, member, viewer." });
  }

  const pool = getPool();

  try {
    await ensureInternalSchema();
    const caller = await requireOrgRole(req, res, orgId, "admin");
    if (!caller) return;

    // Single-instance core: no seat caps (plans/seats live in truss-cloud).
    const orgExists = await pool.query(
      `SELECT 1 FROM truss_internal.organizations WHERE id = $1`,
      [orgId]
    );
    if (orgExists.rowCount === 0) return res.status(404).json({ error: "Organization not found." });

    // ─── Create invitation ───
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      `INSERT INTO truss_internal.invitations (org_id, email, role, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, role, token, expires_at, created_at`,
      [orgId, email, role, token, expiresAt]
    );

    // Fire-and-forget invite email (don't fail the invite if email fails)
    isEmailConfigured().then(async (configured) => {
      if (!configured) return;
      const orgName = (await pool.query(`SELECT name FROM truss_internal.organizations WHERE id = $1`, [orgId])).rows[0]?.name || "an organization";
      const inviterName = req.tenant?.display_name || req.tenant?.email || "A team member";
      sendInviteEmail({ to: email, orgName, inviterName, inviteToken: token }).catch((err) => {
        log.error({ err: err.message }, "Invite email error");
      });
    }).catch(() => {});

    await writeAuditLog(req.tenant.id, "org.invite.create", "invitation", result.rows[0].id, { orgId, email, role }, req.tenant.id);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/invites/:token — get invite details (for accept page) ───

router.get("/api/invites/:token", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  try {
    await ensureInternalSchema();
    const result = await getPool().query(
      `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.created_at,
              o.id AS org_id, o.name AS org_name, o.slug AS org_slug
       FROM truss_internal.invitations i
       JOIN truss_internal.organizations o ON o.id = i.org_id
       WHERE i.token = $1`,
      [req.params.token]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Invitation not found." });

    const invite = result.rows[0];
    if (invite.accepted_at) return res.status(410).json({ error: "Invitation has already been accepted." });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: "Invitation has expired." });

    return res.json(invite);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/invites/:token/accept — accept invite ───

router.post("/api/invites/:token/accept", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const pool = getPool();

  try {
    await ensureInternalSchema();

    // Look up invitation
    const invResult = await pool.query(
      `SELECT * FROM truss_internal.invitations WHERE token = $1`,
      [req.params.token]
    );
    if (invResult.rowCount === 0) return res.status(404).json({ error: "Invitation not found." });

    const invite = invResult.rows[0];
    if (invite.accepted_at) return res.status(410).json({ error: "Invitation has already been accepted." });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: "Invitation has expired." });

    // Check if already a member
    const existing = await pool.query(
      `SELECT id FROM truss_internal.org_members WHERE org_id = $1 AND tenant_id = $2`,
      [invite.org_id, tenantId]
    );
    if (existing.rowCount > 0) {
      // Mark invite accepted anyway
      await pool.query(`UPDATE truss_internal.invitations SET accepted_at = now() WHERE id = $1`, [invite.id]);
      return res.status(409).json({ error: "You are already a member of this organization." });
    }

    // Create membership
    await pool.query(
      `INSERT INTO truss_internal.org_members (org_id, tenant_id, role, joined_at)
       VALUES ($1, $2, $3, now())`,
      [invite.org_id, tenantId, invite.role]
    );

    // Write Keto relation tuple
    writeKetoOrgTuple(invite.org_id, tenantId, invite.role).catch(() => {});

    // Mark invite accepted
    await pool.query(
      `UPDATE truss_internal.invitations SET accepted_at = now() WHERE id = $1`,
      [invite.id]
    );

    await writeAuditLog(tenantId, "org.invite.accept", "invitation", invite.id, { orgId: invite.org_id, role: invite.role }, tenantId);
    return res.json({ ok: true, org_id: invite.org_id, role: invite.role });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /api/orgs/:id/invites/:inviteId — revoke invitation ───

router.delete("/api/orgs/:id/invites/:inviteId", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });

  const { id: orgId, inviteId } = req.params;

  try {
    await ensureInternalSchema();
    const caller = await requireOrgRole(req, res, orgId, "admin");
    if (!caller) return;

    const result = await getPool().query(
      `DELETE FROM truss_internal.invitations WHERE id = $1 AND org_id = $2 RETURNING id`,
      [inviteId, orgId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Invitation not found." });

    await writeAuditLog(req.tenant.id, "org.invite.revoke", "invitation", inviteId, { orgId }, req.tenant.id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
