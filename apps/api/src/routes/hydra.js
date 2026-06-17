import express from "express";
import { HYDRA_ADMIN_URL, HYDRA_PUBLIC_URL, KRATOS_PUBLIC_URL, getPool } from "../lib/state.js";
import { hydraAdminRequest } from "../lib/hydra.js";
import { fetchWithTimeout } from "../lib/helpers.js";
import { upsertSettingsKey } from "../lib/internal.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "hydra" });

export const router = express.Router();

// ─── Tenant isolation ───
// Hydra is a shared Ory stack. Tenant isolation is enforced by storing the
// tenant_id in each OAuth2 client's metadata field. On reads we filter to only
// return clients belonging to the requesting tenant. On writes we inject the
// tenant_id and verify ownership before allowing mutations.

function requireTenant(req, res) {
  if (!req.tenant) {
    res.status(401).json({ error: "Authentication required." });
    return false;
  }
  return true;
}

function getTenantId(req) {
  return req.tenant.id;
}

/** Check if a Hydra client belongs to the requesting tenant */
function clientBelongsToTenant(client, tenantId) {
  if (!client || !client.metadata) return false;
  const meta = typeof client.metadata === "string" ? JSON.parse(client.metadata) : client.metadata;
  return meta.tenant_id === tenantId;
}

/** Inject tenant_id into client metadata */
function injectTenantMetadata(body, tenantId) {
  const existing = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  return { ...body, metadata: { ...existing, tenant_id: tenantId } };
}

// ─── Health (cached 30s) — no tenant scoping needed ───

let _hydraHealthCache = null;
let _hydraHealthAt = 0;
router.get("/api/hydra/health", async (_req, res) => {
  if (_hydraHealthCache && Date.now() - _hydraHealthAt < 30000) return res.json(_hydraHealthCache);
  if (!HYDRA_ADMIN_URL && !HYDRA_PUBLIC_URL) {
    return res.json({ ok: false, status: "not_configured", adminConfigured: false, publicUrl: null });
  }
  try {
    const publicBase = HYDRA_PUBLIC_URL || HYDRA_ADMIN_URL;
    const r = await fetchWithTimeout(`${publicBase}/health/alive`, {}, 5000);
    const data = await r.json();
    _hydraHealthCache = { ok: true, health: data, adminConfigured: !!HYDRA_ADMIN_URL, publicUrl: HYDRA_PUBLIC_URL || null };
    _hydraHealthAt = Date.now();
    return res.json(_hydraHealthCache);
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : "unknown" }, "Hydra health check failed");
    const result = { ok: false, status: "unreachable", error: e instanceof Error ? e.message : "Hydra unreachable", adminConfigured: !!HYDRA_ADMIN_URL, publicUrl: HYDRA_PUBLIC_URL || null };
    _hydraHealthCache = result;
    _hydraHealthAt = Date.now();
    return res.json(result);
  }
});

// ─── OIDC Discovery — public, no tenant scoping ───

router.get("/api/hydra/discovery", async (_req, res) => {
  if (!HYDRA_PUBLIC_URL) return res.status(503).json({ error: "HYDRA_PUBLIC_URL not configured" });
  try {
    const r = await fetch(`${HYDRA_PUBLIC_URL}/.well-known/openid-configuration`);
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Hydra unreachable" });
  }
});

// ─── JWKS — public, no tenant scoping ───

router.get("/api/hydra/jwks", async (_req, res) => {
  if (!HYDRA_PUBLIC_URL) return res.status(503).json({ error: "HYDRA_PUBLIC_URL not configured" });
  try {
    const r = await fetch(`${HYDRA_PUBLIC_URL}/.well-known/jwks.json`);
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : "Hydra unreachable" });
  }
});

// ─── OAuth2 Clients CRUD (tenant-scoped) ───

router.get("/api/hydra/clients", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const allClients = await hydraAdminRequest("/admin/clients");
    const tenantId = getTenantId(req);
    // Filter to only clients belonging to this tenant
    const clients = Array.isArray(allClients)
      ? allClients.filter((c) => clientBelongsToTenant(c, tenantId))
      : [];
    return res.json(clients);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch clients." });
  }
});

router.get("/api/hydra/clients/:id", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const client = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`);
    const tenantId = getTenantId(req);
    if (!clientBelongsToTenant(client, tenantId)) {
      return res.status(404).json({ error: "Client not found." });
    }
    return res.json(client);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch client." });
  }
});

router.post("/api/hydra/clients", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const tenantId = getTenantId(req);
    const body = injectTenantMetadata(req.body, tenantId);
    const client = await hydraAdminRequest("/admin/clients", {
      method: "POST",
      body,
    });
    // Audit log
    try {
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["hydra.client.create", tenantId, `client:${client.client_id}`, JSON.stringify({ client_name: req.body.client_name, grant_types: req.body.grant_types })]
      );
    } catch { /* best-effort */ }
    log.info({ clientId: client.client_id, clientName: req.body.client_name }, "OAuth2 client created");
    trackFeature(req.tenant?.id || null, "hydra", "client.create");
    return res.status(201).json(client);
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown" }, "failed to create OAuth2 client");
    return res.status(400).json({ error: e instanceof Error ? e.message : "Failed to create client." });
  }
});

router.put("/api/hydra/clients/:id", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const tenantId = getTenantId(req);
    // Verify ownership before update
    const existing = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`);
    if (!clientBelongsToTenant(existing, tenantId)) {
      return res.status(404).json({ error: "Client not found." });
    }
    // Ensure tenant_id stays in metadata even if caller omits it
    const body = injectTenantMetadata(req.body, tenantId);
    const client = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`, {
      method: "PUT",
      body,
    });
    try {
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["hydra.client.update", tenantId, `client:${req.params.id}`, JSON.stringify({ client_name: req.body.client_name })]
      );
    } catch { /* best-effort */ }
    return res.json(client);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Failed to update client." });
  }
});

router.delete("/api/hydra/clients/:id", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const tenantId = getTenantId(req);
    // Verify ownership before delete
    const existing = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`);
    if (!clientBelongsToTenant(existing, tenantId)) {
      return res.status(404).json({ error: "Client not found." });
    }
    await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`, {
      method: "DELETE",
    });
    try {
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["hydra.client.delete", tenantId, `client:${req.params.id}`, "{}"]
      );
    } catch { /* best-effort */ }
    log.info({ clientId: req.params.id }, "OAuth2 client deleted");
    return res.json({ ok: true });
  } catch (e) {
    log.error({ clientId: req.params.id, err: e instanceof Error ? e.message : "unknown" }, "failed to delete OAuth2 client");
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete client." });
  }
});

// ─── Client Secret Rotation (tenant-scoped) ───

router.post("/api/hydra/clients/:id/secret", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const tenantId = getTenantId(req);
    const existing = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`);
    if (!clientBelongsToTenant(existing, tenantId)) {
      return res.status(404).json({ error: "Client not found." });
    }
    // Rotate by updating client with a new empty secret — Hydra generates one
    const updated = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`, {
      method: "PUT",
      body: { ...existing, client_secret: "" },
    });
    try {
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["hydra.client.secret_rotated", tenantId, `client:${req.params.id}`, "{}"]
      );
    } catch { /* best-effort */ }
    log.info({ clientId: req.params.id }, "OAuth2 client secret rotated");
    return res.json({ client_id: updated.client_id, client_secret: updated.client_secret });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to rotate secret." });
  }
});

// ─── Key Management (JWKS) ───

router.post("/api/hydra/keys", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!req.tenant.isAdmin) return res.status(403).json({ error: "Admin access required." });
  const { set_id = "hydra.openid.id-token", algorithm = "RS256", use = "sig" } = req.body || {};
  try {
    const data = await hydraAdminRequest(`/admin/keys/${encodeURIComponent(set_id)}`, {
      method: "POST",
      body: { alg: algorithm, use, kid: `${set_id}-${Date.now()}` },
    });
    log.info({ set_id, algorithm }, "JWK created");
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create key." });
  }
});

router.delete("/api/hydra/keys/:set/:kid", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!req.tenant.isAdmin) return res.status(403).json({ error: "Admin access required." });
  try {
    await hydraAdminRequest(`/admin/keys/${encodeURIComponent(req.params.set)}/${encodeURIComponent(req.params.kid)}`, { method: "DELETE" });
    log.info({ set: req.params.set, kid: req.params.kid }, "JWK deleted");
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete key." });
  }
});

// ─── OAuth2 Consent Sessions (tenant-scoped) ───

router.get("/api/hydra/consent/:subject", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const sessions = await hydraAdminRequest(`/admin/oauth2/auth/sessions/consent?subject=${encodeURIComponent(req.params.subject)}`);
    // Filter consent sessions to only those for clients belonging to this tenant
    const tenantId = getTenantId(req);
    const filtered = Array.isArray(sessions)
      ? sessions.filter((s) => {
          // Each consent session has a consent_request.client object
          const client = s.consent_request?.client;
          return client ? clientBelongsToTenant(client, tenantId) : false;
        })
      : sessions;
    return res.json(filtered);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch consent sessions." });
  }
});

router.delete("/api/hydra/consent/:subject", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    // If a client filter is specified, verify the client belongs to this tenant
    if (req.query.client) {
      const tenantId = getTenantId(req);
      try {
        const client = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(String(req.query.client))}`);
        if (!clientBelongsToTenant(client, tenantId)) {
          return res.status(404).json({ error: "Client not found." });
        }
      } catch {
        return res.status(404).json({ error: "Client not found." });
      }
    }
    const qs = req.query.client ? `?subject=${encodeURIComponent(req.params.subject)}&client=${encodeURIComponent(String(req.query.client))}` : `?subject=${encodeURIComponent(req.params.subject)}`;
    await hydraAdminRequest(`/admin/oauth2/auth/sessions/consent${qs}`, { method: "DELETE" });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to revoke consent." });
  }
});

// ─── Token introspection (tenant-scoped) ───

router.post("/api/hydra/introspect", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const adminBase = HYDRA_ADMIN_URL.endsWith("/") ? HYDRA_ADMIN_URL : `${HYDRA_ADMIN_URL}/`;
    const url = new URL("/admin/oauth2/introspect", adminBase);
    const r = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(process.env.HYDRA_ADMIN_TOKEN ? { Authorization: `Bearer ${process.env.HYDRA_ADMIN_TOKEN}` } : {}),
      },
      body: `token=${encodeURIComponent(req.body.token || "")}`,
    });
    const data = await r.json();
    // Verify the introspected token's client belongs to this tenant
    if (data.active && data.client_id) {
      const tenantId = getTenantId(req);
      try {
        const client = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(data.client_id)}`);
        if (!clientBelongsToTenant(client, tenantId)) {
          // Token belongs to another tenant — mask it as inactive
          return res.json({ active: false });
        }
      } catch { /* if client lookup fails, still return the data */ }
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Introspection failed." });
  }
});

// ─── Revoke token (tenant auth enforced) ───

router.post("/api/hydra/revoke", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!HYDRA_PUBLIC_URL) return res.status(503).json({ error: "HYDRA_PUBLIC_URL not configured" });
  try {
    const r = await fetch(`${HYDRA_PUBLIC_URL}/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(req.body.token || "")}`,
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text || "Revocation failed" });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Revocation failed." });
  }
});

// ─── Token lifecycle config (tenant-scoped) ───

router.patch("/api/hydra/clients/:id/token-config", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const tenantId = getTenantId(req);
    // First fetch the existing client and verify ownership
    const existing = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`);
    if (!clientBelongsToTenant(existing, tenantId)) {
      return res.status(404).json({ error: "Client not found." });
    }
    const { access_token_ttl, refresh_token_ttl, id_token_ttl, access_token_strategy, frontchannel_logout_uri, backchannel_logout_uri } = req.body;

    // Hydra uses client_* fields for token lifetimes (in duration strings or seconds)
    const update = { ...existing };
    if (access_token_ttl !== undefined) update.client_credentials_grant_access_token_lifespan = `${access_token_ttl}s`;
    if (access_token_ttl !== undefined) update.authorization_code_grant_access_token_lifespan = `${access_token_ttl}s`;
    if (refresh_token_ttl !== undefined) update.authorization_code_grant_refresh_token_lifespan = `${refresh_token_ttl}s`;
    if (refresh_token_ttl !== undefined) update.refresh_token_grant_refresh_token_lifespan = `${refresh_token_ttl}s`;
    if (id_token_ttl !== undefined) update.authorization_code_grant_id_token_lifespan = `${id_token_ttl}s`;
    if (access_token_strategy !== undefined) update.access_token_strategy = access_token_strategy;
    if (frontchannel_logout_uri !== undefined) update.frontchannel_logout_uri = frontchannel_logout_uri;
    if (backchannel_logout_uri !== undefined) update.backchannel_logout_uri = backchannel_logout_uri;

    // Remove read-only fields that Hydra rejects on update
    delete update.client_id;
    delete update.client_secret;
    delete update.registration_access_token;
    delete update.registration_client_uri;
    delete update.created_at;
    delete update.updated_at;

    // Ensure tenant_id stays in metadata
    if (!update.metadata || typeof update.metadata !== "object") update.metadata = {};
    update.metadata.tenant_id = tenantId;

    const updated = await hydraAdminRequest(`/admin/clients/${encodeURIComponent(req.params.id)}`, {
      method: "PUT",
      body: update,
    });

    try {
      await getPool().query(
        `INSERT INTO truss_internal.audit_logs (action, actor, resource, meta) VALUES ($1, $2, $3, $4)`,
        ["hydra.client.token_config", tenantId, `client:${req.params.id}`, JSON.stringify({ access_token_ttl, refresh_token_ttl, id_token_ttl })]
      );
    } catch { /* best-effort */ }

    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Failed to update token config." });
  }
});

// ─── RP-Initiated Logout ───

router.post("/api/hydra/logout", async (req, res) => {
  if (!requireTenant(req, res)) return;
  const { subject } = req.body || {};
  if (!subject) return res.status(400).json({ error: "subject is required" });
  try {
    const tenantId = getTenantId(req);

    // Verify the subject has consent sessions through clients belonging to this tenant
    // before revoking. This prevents one tenant from revoking another tenant's sessions.
    const sessions = await hydraAdminRequest(`/admin/oauth2/auth/sessions/consent?subject=${encodeURIComponent(subject)}`);
    if (Array.isArray(sessions)) {
      const hasTenantSessions = sessions.some((s) => {
        const client = s.consent_request?.client;
        return client ? clientBelongsToTenant(client, tenantId) : false;
      });
      if (!hasTenantSessions && sessions.length > 0) {
        return res.status(403).json({ error: "Subject does not have sessions for this tenant's clients." });
      }
    }

    // Revoke all consent and login sessions for this subject
    await hydraAdminRequest(`/admin/oauth2/auth/sessions/login?subject=${encodeURIComponent(subject)}`, { method: "DELETE" });
    await hydraAdminRequest(`/admin/oauth2/auth/sessions/consent?subject=${encodeURIComponent(subject)}`, { method: "DELETE" });
    log.info({ subject, tenantId }, "RP-initiated logout completed");
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Logout failed." });
  }
});

// ─── Custom Claims Config ───
// Claims templates are stored in truss_internal.billing_config as JSON
// They get injected into the consent flow when Kratos→Hydra bridge is active

router.get("/api/hydra/claims-config", async (req, res) => {
  if (!requireTenant(req, res)) return;
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT value FROM truss_internal.billing_config WHERE key = $1`,
      [`oauth2_claims_${getTenantId(req)}`]
    );
    const config = rows[0]?.value ? JSON.parse(rows[0].value) : { id_token_claims: {}, access_token_claims: {} };
    return res.json(config);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load claims config" });
  }
});

router.put("/api/hydra/claims-config", async (req, res) => {
  if (!requireTenant(req, res)) return;
  const { id_token_claims, access_token_claims } = req.body || {};
  try {
    const tenantId = getTenantId(req);
    const value = JSON.stringify({ id_token_claims: id_token_claims || {}, access_token_claims: access_token_claims || {} });
    await upsertSettingsKey(`oauth2_claims_${tenantId}`, value, tenantId);
    log.info({ tenant: tenantId }, "Claims config updated");
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save claims config" });
  }
});

// ─── Flush inactive tokens (admin-only — affects all tenants) ───

router.post("/api/hydra/flush", async (req, res) => {
  if (!requireTenant(req, res)) return;
  if (!req.tenant.isAdmin) return res.status(403).json({ error: "Admin access required. Token flush affects all tenants." });
  try {
    await hydraAdminRequest("/admin/oauth2/flush", {
      method: "POST",
      body: { notAfter: new Date().toISOString() },
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Flush failed." });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Kratos → Hydra OAuth2 Consent Bridge
// ═══════════════════════════════════════════════════════════════════════════
// These endpoints allow Truss to act as Hydra's login and consent provider.
// Hydra redirects the user to these URLs. The endpoints verify the user's
// Kratos session and then accept/reject the Hydra login/consent challenge.
//
// Hydra config needed:
//   urls.login:   https://app.truss.example.com/api/hydra/bridge/login
//   urls.consent: https://app.truss.example.com/api/hydra/bridge/consent

// GET /api/hydra/bridge/login — Hydra redirects here for login
router.get("/api/hydra/bridge/login", async (req, res) => {
  const challenge = String(req.query.login_challenge || "");
  if (!challenge) return res.status(400).json({ error: "login_challenge is required" });
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "HYDRA_ADMIN_URL not configured" });

  try {
    // 1. Fetch the login request from Hydra
    const loginReq = await hydraAdminRequest(`/admin/oauth2/auth/requests/login?login_challenge=${encodeURIComponent(challenge)}`);

    // 2. If the user already has a session with Hydra (skip=true), accept immediately
    if (loginReq.skip) {
      const accept = await hydraAdminRequest("/admin/oauth2/auth/requests/login/accept", {
        method: "PUT",
        body: { subject: loginReq.subject, remember: true, remember_for: 3600 },
        headers: { "Content-Type": "application/json" },
      });
      // Redirect back to Hydra
      return res.redirect(accept.redirect_to);
    }

    // 3. Check if user has a Kratos session (via cookie)
    const kratosSession = await getKratosSession(req);
    if (kratosSession) {
      // User is authenticated via Kratos — accept the login
      const subject = kratosSession.identity?.id || kratosSession.identity?.traits?.email;
      const accept = await hydraAdminRequest("/admin/oauth2/auth/requests/login/accept", {
        method: "PUT",
        body: {
          subject,
          remember: true,
          remember_for: 3600,
          context: {
            identity: kratosSession.identity,
            traits: kratosSession.identity?.traits,
          },
        },
        headers: { "Content-Type": "application/json" },
      });
      log.info({ subject, challenge }, "OAuth2 login accepted via Kratos session");
      return res.redirect(accept.redirect_to);
    }

    // 4. No Kratos session — redirect to login page with return URL
    const loginUrl = new URL("/", KRATOS_PUBLIC_URL || "http://localhost:5173");
    loginUrl.searchParams.set("login_challenge", challenge);
    loginUrl.searchParams.set("return_to", `${req.protocol}://${req.get("host")}/api/hydra/bridge/login?login_challenge=${encodeURIComponent(challenge)}`);
    return res.redirect(loginUrl.toString());
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown", challenge }, "Login bridge error");
    return res.status(500).json({ error: e instanceof Error ? e.message : "Login bridge failed" });
  }
});

// GET /api/hydra/bridge/consent — Hydra redirects here for consent
router.get("/api/hydra/bridge/consent", async (req, res) => {
  const challenge = String(req.query.consent_challenge || "");
  if (!challenge) return res.status(400).json({ error: "consent_challenge is required" });
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "HYDRA_ADMIN_URL not configured" });

  try {
    // 1. Fetch the consent request from Hydra
    const consentReq = await hydraAdminRequest(`/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`);

    // 2. If the user previously granted consent for this client+scope, skip
    if (consentReq.skip) {
      const accept = await hydraAdminRequest("/admin/oauth2/auth/requests/consent/accept", {
        method: "PUT",
        body: {
          grant_scope: consentReq.requested_scope,
          grant_access_token_audience: consentReq.requested_access_token_audience,
        },
        headers: { "Content-Type": "application/json" },
      });
      return res.redirect(accept.redirect_to);
    }

    // 3. Check if the client has skip_consent enabled (first-party app)
    const client = consentReq.client || {};
    if (client.skip_consent || client.metadata?.skip_consent) {
      // Auto-approve consent for first-party apps
      const claims = await buildCustomClaims(consentReq, req);
      const accept = await hydraAdminRequest("/admin/oauth2/auth/requests/consent/accept", {
        method: "PUT",
        body: {
          grant_scope: consentReq.requested_scope,
          grant_access_token_audience: consentReq.requested_access_token_audience,
          session: {
            id_token: claims.id_token_claims || {},
            access_token: claims.access_token_claims || {},
          },
          remember: true,
          remember_for: 3600,
        },
        headers: { "Content-Type": "application/json" },
      });
      log.info({ subject: consentReq.subject, client_id: client.client_id, challenge }, "Consent auto-approved (skip_consent)");
      return res.redirect(accept.redirect_to);
    }

    // 4. Redirect to dashboard consent screen with challenge param
    // The dashboard reads consent_challenge from URL and fetches consent details
    const dashboardUrl = process.env.DASHBOARD_URL || `${req.protocol}://${req.get("host").replace(/:8787$/, ":5173")}`;
    return res.redirect(`${dashboardUrl}?consent_challenge=${encodeURIComponent(challenge)}`);
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : "unknown", challenge }, "Consent bridge error");
    return res.status(500).json({ error: e instanceof Error ? e.message : "Consent bridge failed" });
  }
});

// GET /api/hydra/bridge/consent/info — Get consent challenge details for the UI
router.get("/api/hydra/bridge/consent/info", async (req, res) => {
  const challenge = String(req.query.consent_challenge || "");
  if (!challenge) return res.status(400).json({ error: "consent_challenge is required" });
  if (!HYDRA_ADMIN_URL) return res.status(503).json({ error: "HYDRA_ADMIN_URL not configured" });
  try {
    const consentReq = await hydraAdminRequest(`/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`);
    const client = consentReq.client || {};
    return res.json({
      challenge,
      client: { client_id: client.client_id, client_name: client.client_name, logo_uri: client.logo_uri, tos_uri: client.tos_uri, policy_uri: client.policy_uri },
      requested_scope: consentReq.requested_scope || [],
      requested_access_token_audience: consentReq.requested_access_token_audience || [],
      subject: consentReq.subject,
      oidc_context: consentReq.oidc_context,
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch consent info" });
  }
});

// POST /api/hydra/bridge/consent/accept — Accept the consent challenge
router.post("/api/hydra/bridge/consent/accept", async (req, res) => {
  const { challenge, grant_scope, remember } = req.body || {};
  if (!challenge) return res.status(400).json({ error: "challenge is required" });
  try {
    // Fetch consent request to get context
    const consentReq = await hydraAdminRequest(`/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`);

    // Verify the consent challenge's client belongs to the authenticated tenant
    if (req.tenant) {
      const tenantId = getTenantId(req);
      const client = consentReq.client;
      if (client && !clientBelongsToTenant(client, tenantId)) {
        return res.status(403).json({ error: "Consent challenge client does not belong to this tenant." });
      }
    }

    const claims = await buildCustomClaims(consentReq, req);

    const accept = await hydraAdminRequest("/admin/oauth2/auth/requests/consent/accept", {
      method: "PUT",
      body: {
        grant_scope: grant_scope || consentReq.requested_scope,
        grant_access_token_audience: consentReq.requested_access_token_audience,
        session: {
          id_token: claims.id_token_claims || {},
          access_token: claims.access_token_claims || {},
        },
        remember: remember !== false,
        remember_for: 3600,
      },
      headers: { "Content-Type": "application/json" },
    });

    log.info({ subject: consentReq.subject, client_id: consentReq.client?.client_id }, "Consent accepted");
    return res.json({ redirect_to: accept.redirect_to });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to accept consent" });
  }
});

// POST /api/hydra/bridge/consent/reject — Reject the consent challenge
router.post("/api/hydra/bridge/consent/reject", async (req, res) => {
  const { challenge, error: errCode, error_description } = req.body || {};
  if (!challenge) return res.status(400).json({ error: "challenge is required" });
  try {
    // Verify the consent challenge's client belongs to the authenticated tenant
    if (req.tenant) {
      const consentReq = await hydraAdminRequest(`/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`);
      const tenantId = getTenantId(req);
      const client = consentReq.client;
      if (client && !clientBelongsToTenant(client, tenantId)) {
        return res.status(403).json({ error: "Consent challenge client does not belong to this tenant." });
      }
    }

    const reject = await hydraAdminRequest("/admin/oauth2/auth/requests/consent/reject", {
      method: "PUT",
      body: {
        error: errCode || "access_denied",
        error_description: error_description || "The user denied the request",
      },
      headers: { "Content-Type": "application/json" },
    });
    return res.json({ redirect_to: reject.redirect_to });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to reject consent" });
  }
});

// GET /api/hydra/bridge/status — Check bridge configuration status
router.get("/api/hydra/bridge/status", async (req, res) => {
  const status = {
    hydra_configured: !!HYDRA_ADMIN_URL,
    kratos_configured: !!KRATOS_PUBLIC_URL,
    bridge_ready: !!HYDRA_ADMIN_URL && !!KRATOS_PUBLIC_URL,
    login_url: `${req.protocol}://${req.get("host")}/api/hydra/bridge/login`,
    consent_url: `${req.protocol}://${req.get("host")}/api/hydra/bridge/consent`,
  };
  return res.json(status);
});

// ─── Helper: Get Kratos session from request cookies ───
async function getKratosSession(req) {
  if (!KRATOS_PUBLIC_URL) return null;
  const sessionCookie = req.cookies?.ory_kratos_session || req.headers?.["x-session-token"];
  if (!sessionCookie) return null;
  try {
    const headers = {};
    if (req.cookies?.ory_kratos_session) {
      headers.cookie = `ory_kratos_session=${req.cookies.ory_kratos_session}`;
    } else {
      headers["x-session-token"] = sessionCookie;
    }
    const r = await fetchWithTimeout(`${KRATOS_PUBLIC_URL}/sessions/whoami`, { headers }, 5000);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── Helper: Build custom claims from stored config ───
async function buildCustomClaims(consentReq, req) {
  try {
    const pool = getPool();
    const tenantId = req.tenant?.id || "default";
    const { rows } = await pool.query(
      `SELECT value FROM truss_internal.billing_config WHERE key = $1`,
      [`oauth2_claims_${tenantId}`]
    );
    if (rows[0]?.value) {
      const config = JSON.parse(rows[0].value);
      // Template variable resolution
      const identity = consentReq.context?.identity || {};
      const resolve = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        const resolved = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && v.startsWith("{{") && v.endsWith("}}")) {
            const path = v.slice(2, -2).trim();
            resolved[k] = resolvePath(identity, path);
          } else {
            resolved[k] = v;
          }
        }
        return resolved;
      };
      return {
        id_token_claims: resolve(config.id_token_claims || {}),
        access_token_claims: resolve(config.access_token_claims || {}),
      };
    }
  } catch { /* use empty claims */ }
  return { id_token_claims: {}, access_token_claims: {} };
}

function resolvePath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj) ?? null;
}
