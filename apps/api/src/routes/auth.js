import express from "express";
import { z } from "zod";
import { kratosAdminRequest } from "../lib/kratos.js";
import {
  KRATOS_PUBLIC_URL,
  KRATOS_ADMIN_URL,
  KRATOS_ADMIN_TOKEN,
  getPool,
} from "../lib/state.js";
import { sendWelcomeEmail } from "../lib/email.js";
import { invalidateSessionCache } from "../lib/session.js";
import { clearCsrfCookie } from "../lib/csrf.js";
import { validate } from "../lib/validate.js";
import logger from "../lib/logger.js";
import { logSecurityEvent } from "../lib/observability.js";
import { createRequire } from "node:module";
const log = logger.child({ module: "auth" });

// Fast Set lookup for disposable email domains (~121K domains)
const _require = createRequire(import.meta.url);
const DISPOSABLE_DOMAINS = new Set(_require("disposable-email-domains"));

// ─── Zod schemas for auth endpoints ───
// Schemas use passthrough() to allow extra Kratos-specific fields through.
// flowId is optional to support dev mode (AUTH_REQUIRED=false) where Kratos is skipped.
const loginSchema = z.object({
  flowId: z.string().min(1).optional(),
  method: z.string().optional(),
  identifier: z.string().optional(),
  password: z.string().optional(),
}).passthrough();

const registerSchema = z.object({
  flowId: z.string().min(1).optional(),
  method: z.string().optional(),
  traits: z.object({
    email: z.string().email("Valid email is required"),
  }).passthrough().optional(),
  password: z.string().optional(),
}).passthrough();

export const router = express.Router();

// ---------------------------------------------------------------------------
// Dashboard Auth (Kratos API flows — no CSRF, token-based)
// ---------------------------------------------------------------------------
// Uses Kratos API flows (not browser flows) to avoid CSRF issues when proxying.
// Session tokens are stored in an HttpOnly cookie managed by our server.

const AUTH_REQUIRED = process.env.TRUSS_AUTH_REQUIRED !== "false";
const TRUSS_SESSION_COOKIE = "truss_session";
// Cross-origin deployments (CF Pages → backend) need SameSite=None + Secure
// In production, always set Secure regardless of cross-origin detection
const IS_CROSS_ORIGIN = Boolean(process.env.CORS_ALLOWED_ORIGINS);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Cookie Domain attribute — ONLY set when COOKIE_DOMAIN is explicitly configured.
// Default is host-only (no Domain attribute), the safe self-hosted default. Setting a
// parent registrable domain (e.g. .parent.tld) would scope the session/CSRF cookie to
// every subdomain, widening the attack surface — opt into that explicitly.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN
  ? `; Domain=${process.env.COOKIE_DOMAIN}`
  : "";

// When a Domain is explicitly set we keep cross-origin behavior (SameSite=None; Secure).
// Host-only (no Domain) defaults to SameSite=Lax, which is safe and works same-origin.
const COOKIE_OPTS = (IS_CROSS_ORIGIN && COOKIE_DOMAIN)
  ? `; HttpOnly; Path=/; SameSite=None; Secure${COOKIE_DOMAIN}; Max-Age=${60 * 60 * 24 * 30}`
  : IS_CROSS_ORIGIN
    ? `; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=${60 * 60 * 24 * 30}`
    : `; HttpOnly; Path=/; SameSite=Lax${IS_PRODUCTION ? "; Secure" : ""}; Max-Age=${60 * 60 * 24 * 30}`;

function setSessionCookie(res, token) {
  res.setHeader("set-cookie", `${TRUSS_SESSION_COOKIE}=${token}${COOKIE_OPTS}`);
}

function clearSessionCookie(res) {
  // Production always gets Secure flag; cross-origin needs SameSite=None + Secure; dev same-origin has no Secure
  const clearOpts = IS_CROSS_ORIGIN
    ? `; HttpOnly; Path=/; SameSite=None; Secure${COOKIE_DOMAIN}; Max-Age=0`
    : `; HttpOnly; Path=/; SameSite=Lax${IS_PRODUCTION ? "; Secure" : ""}; Max-Age=0`;
  res.setHeader("set-cookie", `${TRUSS_SESSION_COOKIE}=${clearOpts}`);
}

// ---------------------------------------------------------------------------
// Permissions — returns the current user's full permission set
// ---------------------------------------------------------------------------

router.get("/api/auth/permissions", async (req, res) => {
  if (!req.tenant) return res.status(401).json({ error: "Not authenticated" });

  const tenantId = req.tenant.id;
  const isAdmin = req.tenant.isAdmin;
  const plan = req.tenant.plan || "starter";
  const pool = getPool();

  // Compute abilities from role hierarchy
  // admin: all abilities
  // owner: project.create, project.delete, settings.edit, billing.edit, modules.toggle + below
  // admin role: settings.view, billing.view + below
  // member: project.create + below
  // viewer: settings.view, billing.view (read-only)
  const ALL_ABILITIES = [
    "project.create", "project.delete",
    "settings.view", "settings.edit",
    "billing.view", "billing.edit",
    "admin.stats", "admin.identities",
    "modules.toggle",
  ];

  if (isAdmin) {
    // Admins get everything — return early with minimal queries
    let orgs = [];
    let projects = [];
    if (pool) {
      try {
        const orgResult = await pool.query(
          `SELECT o.id, o.name, m.role
           FROM truss_internal.organizations o
           JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
           ORDER BY o.created_at DESC`,
          [tenantId]
        );
        orgs = orgResult.rows;
      } catch { /* tables may not exist yet */ }
      try {
        const projResult = await pool.query(
          `SELECT id, slug, name FROM truss_internal.projects
           WHERE tenant_id = $1 AND status != 'deleted'
           ORDER BY created_at DESC`,
          [tenantId]
        );
        projects = projResult.rows.map(p => ({ ...p, role: "owner" }));
      } catch { /* tables may not exist yet */ }
    }
    return res.json({
      tenantId,
      isAdmin: true,
      plan,
      orgs,
      projects,
      abilities: ALL_ABILITIES,
    });
  }

  // Non-admin: compute from org memberships
  let orgs = [];
  let projects = [];
  let highestRole = null; // track the highest role across all orgs

  if (pool) {
    try {
      const orgResult = await pool.query(
        `SELECT o.id, o.name, m.role
         FROM truss_internal.organizations o
         JOIN truss_internal.org_members m ON m.org_id = o.id AND m.tenant_id = $1
         ORDER BY o.created_at DESC`,
        [tenantId]
      );
      orgs = orgResult.rows;

      const ROLE_RANK = { owner: 4, admin: 3, member: 2, viewer: 1 };
      for (const org of orgs) {
        if (!highestRole || (ROLE_RANK[org.role] || 0) > (ROLE_RANK[highestRole] || 0)) {
          highestRole = org.role;
        }
      }
    } catch { /* tables may not exist yet */ }

    try {
      const projResult = await pool.query(
        `SELECT id, slug, name FROM truss_internal.projects
         WHERE tenant_id = $1 AND status != 'deleted'
         ORDER BY created_at DESC`,
        [tenantId]
      );
      projects = projResult.rows.map(p => ({ ...p, role: "owner" }));
    } catch { /* tables may not exist yet */ }
  }

  // Derive abilities from highest role
  const abilities = new Set();

  if (highestRole === "owner") {
    abilities.add("project.create");
    abilities.add("project.delete");
    abilities.add("settings.view");
    abilities.add("settings.edit");
    abilities.add("billing.view");
    abilities.add("billing.edit");
    abilities.add("modules.toggle");
  } else if (highestRole === "admin") {
    abilities.add("project.create");
    abilities.add("settings.view");
    abilities.add("billing.view");
  } else if (highestRole === "member") {
    abilities.add("project.create");
    abilities.add("settings.view");
    abilities.add("billing.view");
  } else if (highestRole === "viewer") {
    abilities.add("settings.view");
    abilities.add("billing.view");
  }

  // If user owns any projects directly, grant project abilities
  if (projects.length > 0) {
    abilities.add("project.create");
    abilities.add("settings.view");
    abilities.add("billing.view");
  }

  // If user has no orgs and no projects (solo user), grant sensible defaults
  if (orgs.length === 0 && projects.length === 0) {
    abilities.add("project.create");
    abilities.add("settings.view");
    abilities.add("settings.edit");
    abilities.add("billing.view");
    abilities.add("billing.edit");
    abilities.add("modules.toggle");
  }

  return res.json({
    tenantId,
    isAdmin: false,
    plan,
    orgs,
    projects,
    abilities: [...abilities],
  });
});

// Check current session
router.get("/api/auth/session", async (req, res) => {
  if (req.tenant) {
    return res.json({ tenant: req.tenant, authRequired: AUTH_REQUIRED });
  }
  return res.status(401).json({ error: "Not authenticated", authRequired: AUTH_REQUIRED });
});

// Initialize login flow (API flow — no CSRF)
router.get("/api/auth/login", async (req, res) => {
  // Dev mode: return a fake flow ID
  if (!AUTH_REQUIRED) return res.json({ id: "dev-flow" });
  try {
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login/api`, {
      headers: { accept: "application/json" },
    });
    const flow = await resp.json();
    res.json(flow);
  } catch (err) {
    res.status(500).json({ error: "Failed to initialize login flow" });
  }
});

// Submit login
router.post("/api/auth/login", validate(loginSchema), async (req, res) => {
  // Dev mode: skip Kratos, return success with dev session
  if (!AUTH_REQUIRED) {
    res.clearCookie("truss_logged_out", { path: "/" });
    setSessionCookie(res, "dev-session-token");
    return res.json({ session_token: "dev-session-token", session: { identity: { traits: { email: "dev@localhost" } } } });
  }
  try {
    const { flowId, ...body } = req.body;
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login?flow=${flowId}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      log.warn({ status: resp.status }, "login attempt failed");
      return res.status(resp.status).json(data);
    }

    // API flow returns session_token in the body
    if (data.session_token) {
      clearCsrfCookie(req, res);
      setSessionCookie(res, data.session_token);
    }

    log.info({ email: data.session?.identity?.traits?.email }, "user logged in");
    // Don't echo the session token in the body — the HttpOnly cookie is the auth mechanism.
    delete data.session_token;
    res.json(data);
  } catch (err) {
    log.error({ err: err.message }, "login flow error");
    res.status(500).json({ error: "Login failed" });
  }
});

// Magic link login — send a one-time login link via email
router.post("/api/auth/login/magic-link", async (req, res) => {
  if (!AUTH_REQUIRED) return res.status(400).json({ error: "Auth not required in dev mode" });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email is required." });
  try {
    // Create login flow
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login/api`, {
      headers: { accept: "application/json" },
    });
    const flow = await flowResp.json();
    if (!flow?.id) return res.status(502).json({ error: "Failed to create login flow" });

    // Submit with method=link (Kratos sends the magic link email)
    const submitResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login?flow=${flow.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ method: "link", identifier: email }),
    });
    const data = await submitResp.json();

    // Kratos may return a 422 with a "browser_location_change_required" if it redirects,
    // or 200 with a message about the email being sent
    if (submitResp.status === 422 || submitResp.ok) {
      log.info({ email }, "Magic link login requested");
      return res.json({ ok: true, message: `If an account exists for ${email}, a login link has been sent.` });
    }

    // If Kratos doesn't support link method, return helpful error
    if (data?.ui?.messages?.some((m) => m.text?.includes("link"))) {
      return res.json({ ok: true, message: `If an account exists for ${email}, a login link has been sent.` });
    }

    return res.status(400).json({ error: data?.ui?.messages?.[0]?.text || "Magic link login not available. Enable the 'link' strategy in Kratos config." });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "magic link login error");
    return res.status(500).json({ error: "Failed to send magic link." });
  }
});

// Passkey login — init flow and extract passkey options from UI nodes
router.get("/api/auth/login/passkey", async (req, res) => {
  if (!AUTH_REQUIRED) return res.status(400).json({ error: "Auth not required in dev mode" });
  try {
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login/api`, {
      headers: { accept: "application/json" },
    });
    const flow = await resp.json();
    if (!flow?.ui?.nodes) return res.status(400).json({ error: "No passkey support in login flow" });

    // Find passkey trigger node (hidden input with passkey_challenge data)
    let passkeyOptions = null;
    for (const node of flow.ui.nodes) {
      if (node.group === "passkey" && node.attributes?.name === "passkey_login_trigger") {
        // The onclick contains the WebAuthn options as a JS call
        const onclick = node.attributes?.onclick || "";
        // Extract JSON from __oryPasskeyLogin(...) call
        const match = onclick.match(/__oryPasskeyLogin\((.+)\)/s);
        if (match) {
          try { passkeyOptions = JSON.parse(match[1]); } catch { /* ignore */ }
        }
      }
      // Also check for hidden input with passkey_login value
      if (node.group === "passkey" && node.attributes?.name === "passkey_login" && node.attributes?.value) {
        try { passkeyOptions = JSON.parse(node.attributes.value); } catch { /* ignore */ }
      }
    }

    // Alternative: check for webauthn_login_trigger for webauthn method
    if (!passkeyOptions) {
      for (const node of flow.ui.nodes) {
        if (node.group === "passkey" && node.attributes?.type === "hidden" && node.attributes?.value) {
          try {
            const val = JSON.parse(node.attributes.value);
            if (val.publicKey) { passkeyOptions = val; break; }
          } catch { /* ignore */ }
        }
      }
    }

    if (!passkeyOptions) {
      return res.status(400).json({ error: "Passkey login not available. No passkey credentials found or passkey method not enabled." });
    }

    return res.json({ flow_id: flow.id, passkey_options: passkeyOptions });
  } catch (err) {
    log.error({ err: err.message }, "passkey login init error");
    res.status(500).json({ error: "Failed to initialize passkey login" });
  }
});

// Submit passkey login assertion
router.post("/api/auth/login/passkey", async (req, res) => {
  if (!AUTH_REQUIRED) return res.status(400).json({ error: "Auth not required in dev mode" });
  try {
    const { flow_id, passkey_login } = req.body;
    if (!flow_id || !passkey_login) return res.status(400).json({ error: "Missing flow_id or passkey_login" });

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login?flow=${flow_id}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ method: "passkey", passkey_login }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.ui?.messages?.[0]?.text || data.error?.message || "Passkey login failed";
      return res.status(resp.status).json({ error: msg });
    }

    if (data.session_token) {
      clearCsrfCookie(req, res);
      setSessionCookie(res, data.session_token);
    }

    log.info({ email: data.session?.identity?.traits?.email }, "user logged in via passkey");
    // Don't echo the session token in the body — the HttpOnly cookie is the auth mechanism.
    delete data.session_token;
    return res.json(data);
  } catch (err) {
    log.error({ err: err.message }, "passkey login error");
    res.status(500).json({ error: "Passkey login failed" });
  }
});

// Initialize registration flow (API flow — no CSRF)
router.get("/api/auth/register", async (req, res) => {
  // Dev mode: return a fake flow ID
  if (!AUTH_REQUIRED) return res.json({ id: "dev-flow" });
  try {
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/registration/api`, {
      headers: { accept: "application/json" },
    });
    const flow = await resp.json();
    res.json(flow);
  } catch (err) {
    res.status(500).json({ error: "Failed to initialize registration flow" });
  }
});

// Submit registration. Single-instance core: registration is open — the first
// person to sign up is the de-facto owner. (Invite-only gating is a cloud concern.)
router.post("/api/auth/register", validate(registerSchema), async (req, res) => {
  // Dev mode: skip Kratos, return success with dev session
  if (!AUTH_REQUIRED) {
    setSessionCookie(res, "dev-session-token");
    return res.json({ session_token: "dev-session-token", session: { identity: { traits: { email: "dev@localhost" } } } });
  }

  // ─── Disposable email gate ───
  const regEmail = req.body.traits?.email || "";
  if (regEmail) {
    const domain = regEmail.split("@")[1]?.toLowerCase();
    if (domain && DISPOSABLE_DOMAINS.has(domain)) {
      logSecurityEvent("disposable_email_blocked", { email: regEmail, domain }, req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip, null);
      return res.status(422).json({
        error: "Disposable email addresses are not allowed. Please use a permanent email.",
        disposable_blocked: true,
      });
    }
  }

  try {
    const { flowId, ...body } = req.body;
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/registration?flow=${flowId}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }

    // API flow returns session_token on successful registration
    if (data.session_token) {
      clearCsrfCookie(req, res);
      setSessionCookie(res, data.session_token);
    }

    const regEmail = data.session?.identity?.traits?.email;
    log.info({ email: regEmail }, "user registered");

    // Trial welcome email is sent by the trial email cron (with trial-specific content).
    // Admins get a generic welcome email immediately.
    if (regEmail && req.tenant?.isAdmin) {
      sendWelcomeEmail({ to: regEmail, displayName: data.session?.identity?.traits?.name?.first || "" }).catch(() => {});
    }

    // Don't echo the session token in the body — the HttpOnly cookie is the auth mechanism.
    delete data.session_token;
    res.json(data);
  } catch (err) {
    log.error({ err: err.message }, "registration flow error");
    res.status(500).json({ error: "Registration failed" });
  }
});

// Logout — revoke session token + clear cookie
router.post("/api/auth/logout", async (req, res) => {
  if (AUTH_REQUIRED) {
    try {
      const sessionToken = extractSessionToken(req);
      if (sessionToken) {
        invalidateSessionCache(sessionToken);
        await fetch(`${KRATOS_ADMIN_URL}/admin/sessions`, {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...(KRATOS_ADMIN_TOKEN ? { authorization: `Bearer ${KRATOS_ADMIN_TOKEN}` } : {}),
          },
          body: JSON.stringify({ session_token: sessionToken }),
        }).catch(() => {});
      }
    } catch {}
  }
  clearSessionCookie(res);
  // In dev mode, set a "logged out" flag so session middleware doesn't auto-attach tenant
  if (!AUTH_REQUIRED) {
    res.cookie("truss_logged_out", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 1000 });
  }
  log.info({ tenantId: req.tenant?.id }, "user logged out");
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Self-service password recovery (public — no auth required)
// ---------------------------------------------------------------------------

// GET /api/auth/recovery — Create a recovery flow (returns flow ID + UI nodes)
router.get("/api/auth/recovery", async (req, res) => {
  try {
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/recovery/api`, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return res.status(resp.status).json({ error: "Failed to create recovery flow" });
    const flow = await resp.json();
    res.json(flow);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, "recovery flow init error");
    res.status(500).json({ error: "Failed to initialize recovery flow" });
  }
});

// POST /api/auth/recovery — Submit recovery flow (email → code → new password)
router.post("/api/auth/recovery", async (req, res) => {
  try {
    const { flowId, ...body } = req.body;
    if (!flowId) return res.status(400).json({ error: "flowId is required" });
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/recovery?flow=${flowId}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    res.json(data);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, "recovery flow submit error");
    res.status(500).json({ error: "Recovery request failed" });
  }
});

// Self-service settings (password change) — uses session token
router.get("/api/auth/settings", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) return res.status(401).json({ error: "Not authenticated" });

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    const flow = await resp.json();
    res.json(flow);
  } catch (err) {
    res.status(500).json({ error: "Failed to initialize settings flow" });
  }
});

router.post("/api/auth/settings", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) return res.status(401).json({ error: "Not authenticated" });

    const { flowId, ...body } = req.body;
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flowId}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-session-token": sessionToken },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) return res.status(resp.status).json(data);

    // Log password change if the settings flow included a password update
    if (body.method === "password" || body.password) {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
      const tenantId = req.tenant?.id || null;
      logSecurityEvent("auth.password_changed", {}, ip, tenantId);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Settings update failed" });
  }
});

// Helper: extract session token from our cookie
function extractSessionToken(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").map(c => c.trim()).find(c => c.startsWith(`${TRUSS_SESSION_COOKIE}=`));
  return match ? match.split("=").slice(1).join("=") : null;
}

// ---------------------------------------------------------------------------
// MFA (Multi-Factor Authentication) — self-service via Kratos settings flow
// ---------------------------------------------------------------------------

// GET /api/auth/mfa/status — Check if current user has TOTP/WebAuthn configured
router.get("/api/auth/mfa/status", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });

    // In dev mode, return mock status
    if (!AUTH_REQUIRED) {
      return res.json({ totp: false, webauthn: false, webauthn_credentials: [], lookup_secret: false, lookup_secrets_count: 0, lookup_secrets_used: 0 });
    }

    // Get session to find identity ID
    const sessionResp = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { "x-session-token": sessionToken },
    });
    if (!sessionResp.ok) return res.status(401).json({ error: "Session invalid" });
    const session = await sessionResp.json();
    const identityId = session.identity?.id;
    if (!identityId) return res.status(400).json({ error: "No identity found in session" });

    // Fetch identity with credentials via admin API
    const identity = await kratosAdminRequest(
      `/admin/identities/${encodeURIComponent(identityId)}?include_credential=totp&include_credential=webauthn&include_credential=lookup_secret`
    );

    const credentials = identity.credentials || {};
    const hasTotp = Boolean(credentials.totp?.identifiers?.length);
    const hasWebauthn = Boolean(credentials.webauthn?.identifiers?.length);
    const hasLookupSecret = Boolean(credentials.lookup_secret?.identifiers?.length);
    const lookupSecretsCount = credentials.lookup_secret?.config?.recovery_codes?.length || 0;
    const lookupSecretsUsed = (credentials.lookup_secret?.config?.recovery_codes || []).filter(c => c.used_at).length;
    const webauthnCredentials = [];

    // Extract WebAuthn credential names if available
    if (credentials.webauthn?.config?.credentials) {
      for (const cred of credentials.webauthn.config.credentials) {
        webauthnCredentials.push({
          id: cred.id,
          display_name: cred.display_name || "Security Key",
          added_at: cred.added_at || null,
        });
      }
    }

    return res.json({
      totp: hasTotp,
      webauthn: hasWebauthn,
      webauthn_credentials: webauthnCredentials,
      lookup_secret: hasLookupSecret,
      lookup_secrets_count: lookupSecretsCount,
      lookup_secrets_used: lookupSecretsUsed,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to check MFA status" });
  }
});

// POST /api/auth/mfa/totp/setup — Initialize TOTP setup via Kratos settings flow
router.post("/api/auth/mfa/totp/setup", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ flow_id: "dev-flow", totp_url: "otpauth://totp/Truss:dev@localhost?secret=JBSWY3DPEHPK3PXP&issuer=Truss", totp_secret: "JBSWY3DPEHPK3PXP" });

    // Create a settings flow
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) {
      const err = await flowResp.text();
      return res.status(flowResp.status).json({ error: `Failed to create settings flow: ${err}` });
    }
    const flow = await flowResp.json();

    // Extract TOTP setup info from flow UI nodes
    let totpUrl = null;
    let totpSecret = null;
    const nodes = flow.ui?.nodes || [];
    for (const node of nodes) {
      if (node.attributes?.id === "totp_qr") {
        totpUrl = node.attributes?.src || null;
      }
      if (node.attributes?.name === "totp_secret_key" || node.attributes?.id === "totp_secret_key") {
        totpSecret = node.attributes?.text?.text || node.attributes?.value || null;
      }
      // Also check text nodes for the secret
      if (node.attributes?.text?.id === 1050006) {
        totpSecret = node.attributes.text.text;
      }
      // Look for the otpauth URI in image src
      if (node.type === "img" && node.attributes?.src?.startsWith("data:image")) {
        totpUrl = node.attributes.src;
      }
    }

    // If we got the secret from the QR node's context
    for (const node of nodes) {
      if (node.group === "totp") {
        if (node.attributes?.src) totpUrl = node.attributes.src;
        if (node.meta?.label?.text && node.meta.label.text.includes("otpauth://")) {
          totpSecret = node.meta.label.text;
        }
      }
    }

    return res.json({
      flow_id: flow.id,
      totp_url: totpUrl,
      totp_secret: totpSecret,
      nodes: nodes.filter(n => n.group === "totp"),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to initialize TOTP setup" });
  }
});

// POST /api/auth/mfa/totp/verify — Verify TOTP code to complete setup
router.post("/api/auth/mfa/totp/verify", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    const { flow_id, totp_code } = req.body;
    if (!flow_id || !totp_code) return res.status(400).json({ error: "flow_id and totp_code are required" });

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ method: "totp", totp_code }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to verify TOTP code" });
  }
});

// DELETE /api/auth/mfa/totp — Disable TOTP for current user
router.delete("/api/auth/mfa/totp", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    // Get identity ID from session
    const sessionResp = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { "x-session-token": sessionToken },
    });
    if (!sessionResp.ok) return res.status(401).json({ error: "Session invalid" });
    const session = await sessionResp.json();
    const identityId = session.identity?.id;
    if (!identityId) return res.status(400).json({ error: "No identity found in session" });

    // Use settings flow to unlink TOTP
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) return res.status(500).json({ error: "Failed to create settings flow" });
    const flow = await flowResp.json();

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ method: "totp", totp_unlink: true }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to disable TOTP" });
  }
});

// POST /api/auth/mfa/webauthn/setup — Initialize WebAuthn registration via settings flow
router.post("/api/auth/mfa/webauthn/setup", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ flow_id: "dev-flow", webauthn_options: null });

    // Create a settings flow
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) return res.status(500).json({ error: "Failed to create settings flow" });
    const flow = await flowResp.json();

    // Extract WebAuthn challenge from flow UI nodes
    let webauthnOptions = null;
    const nodes = flow.ui?.nodes || [];
    for (const node of nodes) {
      if (node.group === "webauthn" && node.attributes?.name === "webauthn_register") {
        webauthnOptions = node.attributes?.value ? JSON.parse(node.attributes.value) : null;
      }
    }

    return res.json({
      flow_id: flow.id,
      webauthn_options: webauthnOptions,
      nodes: nodes.filter(n => n.group === "webauthn"),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to initialize WebAuthn setup" });
  }
});

// POST /api/auth/mfa/webauthn/verify — Complete WebAuthn registration
router.post("/api/auth/mfa/webauthn/verify", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    const { flow_id, webauthn_register, webauthn_register_displayname } = req.body;
    if (!flow_id || !webauthn_register) return res.status(400).json({ error: "flow_id and webauthn_register are required" });

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        method: "webauthn",
        webauthn_register: webauthn_register,
        webauthn_register_displayname: webauthn_register_displayname || "Security Key",
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to complete WebAuthn registration" });
  }
});

// DELETE /api/auth/mfa/webauthn — Remove a WebAuthn credential
router.delete("/api/auth/mfa/webauthn", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    const { credential_id } = req.body;

    // Use settings flow to unlink WebAuthn
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) return res.status(500).json({ error: "Failed to create settings flow" });
    const flow = await flowResp.json();

    const body = { method: "webauthn", webauthn_remove: credential_id || true };
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to remove WebAuthn credential" });
  }
});

// ---------------------------------------------------------------------------
// MFA Recovery Codes (Kratos lookup_secret strategy)
// ---------------------------------------------------------------------------

// POST /api/auth/mfa/recovery-codes/generate — Generate recovery codes via Kratos settings flow
router.post("/api/auth/mfa/recovery-codes/generate", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) {
      // Dev mode: return mock codes
      return res.json({
        codes: [
          "abcde-12345", "fghij-67890", "klmno-11111", "pqrst-22222",
          "uvwxy-33333", "zabcd-44444", "efghi-55555", "jklmn-66666",
          "opqrs-77777", "tuvwx-88888", "yzabc-99999", "defgh-00000",
        ],
        flow_id: "dev-flow",
      });
    }

    // Create a settings flow
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) return res.status(500).json({ error: "Failed to create settings flow" });
    const flow = await flowResp.json();

    // Submit lookup_secret method to generate codes
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ method: "lookup_secret" }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);

    // Extract recovery codes from the response UI nodes
    const codes = [];
    const nodes = data.ui?.nodes || [];
    for (const node of nodes) {
      if (node.group === "lookup_secret" && node.attributes?.node_type === "text" && node.attributes?.text?.text) {
        codes.push(node.attributes.text.text);
      }
      // Also check for the secrets in the id pattern
      if (node.attributes?.id?.startsWith("lookup_secret_codes") && node.attributes?.text?.text) {
        if (!codes.includes(node.attributes.text.text)) codes.push(node.attributes.text.text);
      }
    }

    return res.json({ codes, flow_id: flow.id, nodes: nodes.filter(n => n.group === "lookup_secret") });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate recovery codes" });
  }
});

// POST /api/auth/mfa/recovery-codes/confirm — Confirm the user has saved their recovery codes
router.post("/api/auth/mfa/recovery-codes/confirm", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    const { flow_id } = req.body;
    if (!flow_id) return res.status(400).json({ error: "flow_id is required" });

    // Confirm by submitting lookup_secret_confirm = true
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ method: "lookup_secret", lookup_secret_confirm: true }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to confirm recovery codes" });
  }
});

// DELETE /api/auth/mfa/recovery-codes — Revoke/regenerate recovery codes
router.delete("/api/auth/mfa/recovery-codes", async (req, res) => {
  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken && AUTH_REQUIRED) return res.status(401).json({ error: "Not authenticated" });
    if (!AUTH_REQUIRED) return res.json({ ok: true });

    // Create a settings flow and submit with lookup_secret_disable = true
    const flowResp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings/api`, {
      headers: { accept: "application/json", "x-session-token": sessionToken },
    });
    if (!flowResp.ok) return res.status(500).json({ error: "Failed to create settings flow" });
    const flow = await flowResp.json();

    const resp = await fetch(`${KRATOS_PUBLIC_URL}/self-service/settings?flow=${flow.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({ method: "lookup_secret", lookup_secret_disable: true }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to revoke recovery codes" });
  }
});

