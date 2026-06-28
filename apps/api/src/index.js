import cors from "cors";
import crypto from "node:crypto";
import helmet from "helmet";
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import express from "express";
import { WebSocketServer } from "ws";

globalThis.__API_START_TIME__ = new Date().toISOString();
globalThis.__API_GIT_HASH__ = process.env.TRUSS_BUILD_HASH || (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { try { return readFileSync("GIT_HASH", "utf8").trim(); } catch { return "unknown"; } } })();

// ─── Structured logger ───
import logger from "./lib/logger.js";

// ─── Shared state & helpers ───
import { API_PORT, getActiveDatabaseUrl, getPool, consumptionMetrics } from "./lib/state.js";
import { maskConnectionString } from "./lib/helpers.js";
import { ensureInternalSchema } from "./lib/internal.js";
import { realtimeClients, realtimeChannels, bootstrapRealtimeListener, presenceJoin, presenceLeave, presenceDisconnect, presenceHeartbeat } from "./lib/realtime.js";
import { sessionMiddleware, verifySession, resolveOrg, resolveEnvironment, resolveTenantPool } from "./lib/session.js";
import { bootstrapAdmin } from "./lib/bootstrap-admin.js";
import { csrfMiddleware } from "./lib/csrf.js";
import { resolveApiKey } from "./lib/api-keys.js";
import { requestLogger, globalErrorHandler, cleanupOldLogs } from "./lib/observability.js";
import { metricsMiddleware, metricsHandler } from "./lib/metrics.js";
import { seedDevTenants } from "./lib/dev-tenants.js";
import swaggerUi from "swagger-ui-express";
import { openApiBase } from "./docs/openapi-base.js";
// NOTE: `express-rate-limit` must be installed: npm i express-rate-limit
import rateLimit from "express-rate-limit";

// ─── Route modules ───
import { router as sqlRoutes } from "./routes/sql.js";
import { router as clientApiRoutes } from "./routes/client-api.js";
import { router as authRoutes } from "./routes/auth.js";
import { router as authWebhookRoutes } from "./routes/auth-webhooks.js";
import { router as storageRoutes } from "./routes/storage.js";
import { router as branchesRoutes } from "./routes/branches.js";
import { router as featuresRoutes } from "./routes/features.js";
import { router as fdwRoutes } from "./routes/fdw.js";
import { router as migrationsRoutes } from "./routes/migrations.js";
import { router as ketoRoutes } from "./routes/keto.js";
import { router as realtimeRoutes } from "./routes/realtime.js";
import { router as vectorsRoutes } from "./routes/vectors.js";
import { router as searchRoutes } from "./routes/search.js";
import { router as webhooksRoutes } from "./routes/webhooks.js";
import { router as projectsRoutes } from "./routes/projects.js";
import { router as hydraRoutes } from "./routes/hydra.js";
import { router as oathkeeperRoutes } from "./routes/oathkeeper.js";
import { router as connectionsRoutes } from "./routes/connections.js";
import { router as orgsRoutes } from "./routes/orgs.js";
import { router as sampleAppRoutes } from "./routes/sample-app.js";
import { router as configRoutes } from "./routes/config.js";
import { router as flagsRoutes } from "./routes/flags.js";
import { router as cacheRoutes } from "./routes/cache.js";
import { router as integrationsRoutes } from "./routes/integrations.js";
import { router as extensionsRoutes } from "./routes/extensions.js";
import { router as environmentsRoutes } from "./routes/environments.js";

// ─── Startup security validation ───
if (process.env.NODE_ENV === "production") {
  const encKey = process.env.ENCRYPTION_KEY || "";
  if (!encKey || encKey.length < 32 || encKey.includes("change-me")) {
    logger.error("ENCRYPTION_KEY must be set to a random 32+ character string in production. Generate with: openssl rand -hex 32");
    process.exit(1);
  }
}

// ─── Express setup ───
const app = express();

// ─── Cloud overlay hook (open-core composition) ───
// OSS builds have no ./cloud/ module, so this is a no-op and the app runs as the
// single-instance core. The hosted (truss-cloud) image overlays ./cloud/index.js,
// whose registerCloud() pushes platform middleware/routes into the named slots
// below. Slots are applied at fixed points in the pipeline so ordering is explicit.
const cloudHooks = { preSession: [], postSession: [], routes: [], wsUpgrade: [] };
try {
  const cloud = await import("./cloud/index.js");
  await cloud.registerCloud({ app, hooks: cloudHooks });
  logger.info("Cloud overlay loaded");
} catch (err) {
  if (err?.code !== "ERR_MODULE_NOT_FOUND") {
    logger.error({ err: err.message }, "Cloud overlay failed to load");
  }
}

// ─── Waitlist CORS (must be before Helmet to handle OPTIONS preflight) ───
app.use((req, res, next) => {
  if (req.path !== "/api/waitlist") return next();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // API serves JSON, not HTML — CSP not applicable
  crossOriginEmbedderPolicy: false, // Would break Swagger UI
}));

// CORS: allow credentials (cookies) from configured frontend origins
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"];
const dashboardCors = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Explicit allowlist is the only trusted source of cross-origin (set CORS_ALLOWED_ORIGINS).
    if (ALLOWED_ORIGINS.length > 0) {
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
      return callback(null, false);
    }
    // No allowlist configured: only localhost dev origins. Fail closed in production
    // (never reflect arbitrary origins) — self-hosters MUST set CORS_ALLOWED_ORIGINS.
    if (process.env.NODE_ENV !== "production" && DEV_ORIGINS.includes(origin)) {
      return callback(null, origin);
    }
    callback(null, false);
  },
  credentials: true,
});
// Skip dashboard CORS for public endpoints that handle their own CORS
app.use((req, res, next) => {
  if (req.path === "/api/waitlist") return next();
  dashboardCors(req, res, next);
});
app.use((req, res, next) => {
  // Skip JSON parsing for webhook endpoint — needs raw body for HMAC verification
  if (req.path === "/api/billing/webhook") return next();
  express.json({ limit: "256kb" })(req, res, next);
});

// ─── Observability: time every request + expose Prometheus metrics ───
// /metrics is intentionally unauthenticated (Prometheus scrapes it on the internal
// network) and lives at the root, so the /api/ rate limiter never throttles scrapes.
app.use(metricsMiddleware);
app.get("/metrics", metricsHandler);

// ─── Waitlist signup (public endpoint — CORS handled above, before Helmet) ───
let _waitlistTableReady = false;

async function ensureWaitlistTable() {
  if (_waitlistTableReady) return;
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS truss_internal.waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'landing-page',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  _waitlistTableReady = true;
}

app.post("/api/waitlist", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Service unavailable." });

    await ensureWaitlistTable();
    await pool.query(
      `INSERT INTO truss_internal.waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email.trim().toLowerCase()]
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Waitlist signup error");
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
});

// ─── Request ID middleware ───
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});

// ─── Consumption tracking middleware ───
app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    const bytes = typeof body === "string" ? Buffer.byteLength(body) : (body?.length || 0);
    consumptionMetrics.queries++;
    consumptionMetrics.bandwidth += bytes;

    const route = req.route?.path || req.path;
    const ep = consumptionMetrics.perEndpoint.get(route) || { count: 0, bandwidth: 0 };
    ep.count++;
    ep.bandwidth += bytes;
    consumptionMetrics.perEndpoint.set(route, ep);

    const keyId = req.apiKey?.id;
    if (keyId) {
      const km = consumptionMetrics.perKey.get(keyId) || { queries: 0, bandwidth: 0, lastSeen: null };
      km.queries++;
      km.bandwidth += bytes;
      km.lastSeen = new Date().toISOString();
      consumptionMetrics.perKey.set(keyId, km);
    }

    return originalSend(body);
  };
  next();
});

// ─── Request logging (persists to DB, replaces in-memory only metrics) ───
app.use(requestLogger);

// Redact secret-bearing query params (e.g. ?apikey=...) so keys/tokens never land in logs.
const SECRET_QUERY_PARAMS = new Set(["apikey", "api_key", "token", "access_token"]);
function redactUrl(rawUrl) {
  if (!rawUrl || !rawUrl.includes("?")) return rawUrl;
  try {
    const u = new URL(rawUrl, "http://localhost");
    let redacted = false;
    for (const key of u.searchParams.keys()) {
      if (SECRET_QUERY_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, "***");
        redacted = true;
      }
    }
    if (!redacted) return rawUrl;
    return `${u.pathname}${u.search}`;
  } catch {
    return rawUrl;
  }
}

// ─── Structured request logging (pino) ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({ reqId: req.id, method: req.method, url: redactUrl(req.originalUrl), status: res.statusCode, duration }, "request");
  });
  next();
});

// ─── Cloud pre-session middleware (e.g. demo-tenant resolver in truss-cloud) ───
cloudHooks.preSession.forEach((m) => app.use(m));

// ─── Session authentication ───
app.use(sessionMiddleware);

// ─── Org resolution (must be after session middleware) ───
app.use(resolveOrg);

// ─── Environment resolution (must be after session + org) ───
app.use(resolveEnvironment);

// ─── Cloud post-session middleware (e.g. demo write protection in truss-cloud) ───
cloudHooks.postSession.forEach((m) => app.use(m));

// Single-instance core: no multi-tenant pool routing, trial, or freeze middleware
// (those live in truss-cloud). getCustomerPool() serves the single configured DB.

// ─── CSRF protection (double-submit cookie) ───
app.use(csrfMiddleware);

// ─── Sanitize error responses in production — prevent leaking SQL/internal details ───
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (res.statusCode >= 400 && body?.error && typeof body.error === "string") {
        const safeErrors = [
          "Authentication required", "Admin access required", "Not authenticated",
          "Demo mode is read-only", "Rate limit exceeded", "CSRF token mismatch",
          "Missing API key", "Invalid or revoked API key", "trial has expired",
          "Database not available", "DATABASE_URL is not set",
        ];
        const isSafe = safeErrors.some(safe => body.error.includes(safe));
        if (!isSafe && res.statusCode === 500) {
          body = { ...body, error: "An internal error occurred" };
        }
      }
      return originalJson(body);
    };
    next();
  });
}

// ─── API Documentation (OpenAPI / Swagger UI) ───
const swaggerCustomCss = `
  /* ── Fonts ── */
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  /* ── Base / Dark Theme ── */
  html, body { background: #0c1222 !important; }
  .swagger-ui { font-family: 'DM Sans', -apple-system, sans-serif; color: #e2e8f0; }
  .swagger-ui .topbar { display: none; }
  .swagger-ui .scheme-container { background: #0f172a; border-bottom: 1px solid #1e293b; padding: 12px 0; }
  .swagger-ui .wrapper { max-width: 1200px; }

  /* ── Custom Header ── */
  .swagger-ui .info { margin: 40px 0 24px; padding: 32px; background: linear-gradient(135deg, #0f172a 0%, #1a0a12 100%); border: 1px solid #2d1520; border-radius: 12px; }
  .swagger-ui .info hgroup.main { margin: 0; }
  .swagger-ui .info .title { font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 28px; color: #f8fafc; }
  .swagger-ui .info .title small { background: #9f1239; color: #fff; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; vertical-align: middle; margin-left: 10px; }
  .swagger-ui .info .title small pre { color: #fecdd3; padding: 0; }
  .swagger-ui .info .description, .swagger-ui .info .description p { color: #94a3b8; font-size: 14.5px; line-height: 1.7; }
  .swagger-ui .info .description a { color: #fb7185; }
  .swagger-ui .info .description a:hover { color: #fda4af; }
  .swagger-ui .info a.link { color: #fb7185; font-family: 'DM Sans', sans-serif; }
  .swagger-ui .info .base-url { color: #64748b; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .swagger-ui .info li, .swagger-ui .info p, .swagger-ui .info table { color: #94a3b8; }

  /* ── Tag Sections ── */
  .swagger-ui .opblock-tag-section { margin-bottom: 4px; }
  .swagger-ui .opblock-tag { color: #f1f5f9; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 18px; border-bottom: 1px solid #1e293b; padding: 14px 0; }
  .swagger-ui .opblock-tag:hover { color: #fb7185; }
  .swagger-ui .opblock-tag small { color: #64748b; font-size: 13px; font-weight: 400; }
  .swagger-ui .opblock-tag svg { fill: #64748b; }

  /* ── Method Badges: GET = emerald, POST = accent/wine, DELETE = red, PUT = blue, PATCH = amber ── */
  .swagger-ui .opblock.opblock-get { background: rgba(16, 185, 129, 0.06); border-color: #065f46; }
  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #059669; }
  .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #065f46; }
  .swagger-ui .opblock.opblock-get .tab-header .tab-item.active h4 span::after { background: #059669; }

  .swagger-ui .opblock.opblock-post { background: rgba(159, 18, 57, 0.08); border-color: #4c0519; }
  .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #9f1239; }
  .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #4c0519; }
  .swagger-ui .opblock.opblock-post .tab-header .tab-item.active h4 span::after { background: #9f1239; }

  .swagger-ui .opblock.opblock-delete { background: rgba(239, 68, 68, 0.06); border-color: #7f1d1d; }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #dc2626; }
  .swagger-ui .opblock.opblock-delete .opblock-summary { border-color: #7f1d1d; }
  .swagger-ui .opblock.opblock-delete .tab-header .tab-item.active h4 span::after { background: #dc2626; }

  .swagger-ui .opblock.opblock-put { background: rgba(59, 130, 246, 0.06); border-color: #1e3a5f; }
  .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #2563eb; }
  .swagger-ui .opblock.opblock-put .opblock-summary { border-color: #1e3a5f; }

  .swagger-ui .opblock.opblock-patch { background: rgba(245, 158, 11, 0.06); border-color: #78350f; }
  .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #d97706; }
  .swagger-ui .opblock.opblock-patch .opblock-summary { border-color: #78350f; }
  .swagger-ui .opblock.opblock-patch .tab-header .tab-item.active h4 span::after { background: #d97706; }

  /* ── Method badge text ── */
  .swagger-ui .opblock .opblock-summary-method { color: #fff; font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 12px; padding: 6px 14px; border-radius: 6px; min-width: 70px; text-align: center; }

  /* ── Operation Summary ── */
  .swagger-ui .opblock .opblock-summary-path { color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; }
  .swagger-ui .opblock .opblock-summary-path__deprecated { color: #64748b; text-decoration: line-through; }
  .swagger-ui .opblock .opblock-summary-description { color: #94a3b8; font-size: 13px; }
  .swagger-ui .opblock .opblock-summary { padding: 8px 12px; border: none !important; }
  .swagger-ui .opblock .opblock-summary:hover { background: rgba(255, 255, 255, 0.03); }
  .swagger-ui .opblock { border-radius: 8px; margin-bottom: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

  /* ── Expanded Operation Body ── */
  .swagger-ui .opblock-body { background: #0c1222; }
  .swagger-ui .opblock-body pre { background: #0f172a; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 13px; border: 1px solid #1e293b; border-radius: 6px; padding: 14px; }
  .swagger-ui .opblock-description-wrapper, .swagger-ui .opblock-external-docs-wrapper { color: #94a3b8; font-size: 13.5px; padding: 12px 20px; }
  .swagger-ui .opblock-description-wrapper p, .swagger-ui .opblock-external-docs-wrapper p { color: #94a3b8; }
  .swagger-ui .opblock-section-header { background: #0f172a; border-bottom: 1px solid #1e293b; box-shadow: none; padding: 10px 20px; }
  .swagger-ui .opblock-section-header h4 { color: #e2e8f0; font-family: 'DM Sans', sans-serif; font-weight: 600; }
  .swagger-ui .opblock-section-header label { color: #94a3b8; }

  /* ── Tab Headers ── */
  .swagger-ui .tab-header .tab-item.active h4 span { color: #f8fafc; }
  .swagger-ui .tab-header .tab-item h4 span { color: #64748b; }

  /* ── Parameters Table ── */
  .swagger-ui table thead tr th { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #1e293b; padding: 10px 0; }
  .swagger-ui table thead tr td { color: #e2e8f0; border-bottom: 1px solid #1e293b; }
  .swagger-ui .parameters-col_description p { color: #94a3b8; }
  .swagger-ui .parameters-col_name { color: #f1f5f9; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .swagger-ui .parameter__name { color: #f1f5f9; }
  .swagger-ui .parameter__name.required span { color: #fb7185; }
  .swagger-ui .parameter__name.required::after { color: #fb7185; }
  .swagger-ui .parameter__type { color: #64748b; font-size: 12px; }
  .swagger-ui .parameter__in { color: #475569; font-size: 12px; }
  .swagger-ui table tbody tr td { border-bottom: 1px solid #1e293b; padding: 10px 0; }

  /* ── Inputs / Selects ── */
  .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select {
    background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 8px 12px;
  }
  .swagger-ui input[type=text]:focus, .swagger-ui textarea:focus, .swagger-ui select:focus {
    border-color: #9f1239; outline: none; box-shadow: 0 0 0 2px rgba(159, 18, 57, 0.25);
  }
  .swagger-ui select { appearance: auto; }
  .swagger-ui .body-param textarea { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; }

  /* ── Buttons ── */
  .swagger-ui .btn { border-radius: 6px; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 13px; padding: 6px 16px; transition: all 0.15s; }
  .swagger-ui .btn.execute { background: #9f1239; color: #fff; border: none; }
  .swagger-ui .btn.execute:hover { background: #be123c; }
  .swagger-ui .btn.cancel { background: transparent; color: #94a3b8; border: 1px solid #334155; }
  .swagger-ui .btn.cancel:hover { color: #e2e8f0; border-color: #475569; }
  .swagger-ui .btn.authorize { color: #fb7185; border-color: #9f1239; background: rgba(159, 18, 57, 0.1); }
  .swagger-ui .btn.authorize:hover { background: rgba(159, 18, 57, 0.2); }
  .swagger-ui .btn.authorize svg { fill: #fb7185; }

  /* ── Authorize / Lock Icons ── */
  .swagger-ui .authorization__btn { fill: #64748b; }
  .swagger-ui .authorization__btn.locked { fill: #fb7185; }
  .swagger-ui .authorization__btn:hover { fill: #fb7185; }

  /* ── Responses ── */
  .swagger-ui .responses-inner { padding: 12px 20px; }
  .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #e2e8f0; }
  .swagger-ui .response-col_status { color: #f1f5f9; font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .swagger-ui .response-col_description { color: #94a3b8; }
  .swagger-ui .response-col_links { color: #64748b; }

  /* ── Response Codes ── */
  .swagger-ui .responses-table .response > td:first-child { font-size: 14px; }

  /* ── Models / Schemas ── */
  .swagger-ui section.models { border: 1px solid #1e293b; border-radius: 8px; background: #0f172a; }
  .swagger-ui section.models h4 { color: #e2e8f0; font-family: 'DM Sans', sans-serif; border-bottom: 1px solid #1e293b; }
  .swagger-ui section.models h4 span { color: #e2e8f0; }
  .swagger-ui section.models .model-container { background: #0c1222; border: 1px solid #1e293b; border-radius: 6px; margin: 8px 0; padding: 12px; }
  .swagger-ui .model { color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .swagger-ui .model-title { color: #f1f5f9; font-family: 'DM Sans', sans-serif; font-weight: 600; }
  .swagger-ui .model .property { color: #94a3b8; }
  .swagger-ui .model .property.primitive { color: #fb7185; }
  .swagger-ui span.model-toggle::after { background: none; }
  .swagger-ui .model-toggle:after { color: #64748b; }

  /* ── JSON Highlighting ── */
  .swagger-ui .highlight-code > .microlight { background: #0f172a !important; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 13px; border: 1px solid #1e293b; border-radius: 6px; padding: 14px !important; }

  /* ── Response MIME type selector ── */
  .swagger-ui .responses-wrapper .content-type { color: #94a3b8; }

  /* ── Copy to clipboard ── */
  .swagger-ui .copy-to-clipboard { background: #1e293b; border-radius: 4px; right: 10px; top: 10px; }
  .swagger-ui .copy-to-clipboard button { background: transparent; }

  /* ── Server dropdown ── */
  .swagger-ui .servers > label { color: #94a3b8; font-family: 'DM Sans', sans-serif; }
  .swagger-ui .servers > label select { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; }

  /* ── Dialog / Modal ── */
  .swagger-ui .dialog-ux .modal-ux { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; }
  .swagger-ui .dialog-ux .modal-ux-header { border-bottom: 1px solid #1e293b; }
  .swagger-ui .dialog-ux .modal-ux-header h3 { color: #f1f5f9; font-family: 'DM Sans', sans-serif; }
  .swagger-ui .dialog-ux .modal-ux-content p { color: #94a3b8; }
  .swagger-ui .dialog-ux .modal-ux-content h4 { color: #e2e8f0; }
  .swagger-ui .dialog-ux .modal-ux-content label { color: #94a3b8; }
  .swagger-ui .dialog-ux .backdrop-ux { background: rgba(12, 18, 34, 0.8); }

  /* ── Scrollbar (Webkit) ── */
  .swagger-ui ::-webkit-scrollbar { width: 6px; height: 6px; }
  .swagger-ui ::-webkit-scrollbar-track { background: #0c1222; }
  .swagger-ui ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  .swagger-ui ::-webkit-scrollbar-thumb:hover { background: #475569; }

  /* ── Loading ── */
  .swagger-ui .loading-container .loading::after { color: #94a3b8; }

  /* ── Filter ── */
  .swagger-ui .filter .operation-filter-input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; }

  /* ── Markdown in descriptions ── */
  .swagger-ui .markdown p, .swagger-ui .markdown li { color: #94a3b8; }
  .swagger-ui .markdown code { background: #1e293b; color: #fb7185; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
  .swagger-ui .markdown a { color: #fb7185; }
  .swagger-ui .markdown a:hover { color: #fda4af; }

  /* ── Try-it-out area ── */
  .swagger-ui .try-out__btn { color: #94a3b8; border-color: #334155; }
  .swagger-ui .try-out__btn:hover { color: #e2e8f0; border-color: #475569; }

  /* ── Expand/collapse arrows ── */
  .swagger-ui .expand-operation svg { fill: #64748b; transition: fill 0.15s; }
  .swagger-ui .expand-operation:hover svg { fill: #fb7185; }
  .swagger-ui .arrow { fill: #64748b; }

  /* ── No margin on wrapper ── */
  .swagger-ui .information-container { background: #0c1222; padding: 0; }
`;

app.use("/v1/docs", swaggerUi.serve, swaggerUi.setup(openApiBase, {
  customCss: swaggerCustomCss,
  customSiteTitle: "Truss API Documentation",
  customfavIcon: "",
}));
app.get("/v1/openapi.json", (_req, res) => res.json(openApiBase));

// ─── Rate limiting ───
// Opt-out for test runs: a full smoke suite fires hundreds of requests from one IP
// and would otherwise trip these limits. NEVER set this in production.
const RATE_LIMIT_DISABLED = process.env.TRUSS_DISABLE_RATE_LIMIT === "true";

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,            // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: () => RATE_LIMIT_DISABLED,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 requests per minute per IP for expensive operations
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: () => RATE_LIMIT_DISABLED,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 requests per minute per IP for admin endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests. Please try again later." },
  skip: (req) => RATE_LIMIT_DISABLED || req.method === "GET", // only limit state-changing admin operations
});

app.use("/api/", generalLimiter);
app.use("/v1/", generalLimiter);
app.use("/api/admin/", adminLimiter);
app.post("/api/sql/query", strictLimiter);
app.post("/api/backups/snapshot", strictLimiter);
app.post("/api/branches", strictLimiter);
app.post("/api/webhooks/:id/test", strictLimiter);
app.post("/api/webhooks/:id/replay/:logId", strictLimiter);
app.post("/api/auth/register", strictLimiter);
app.post("/api/auth/recovery", strictLimiter);
app.post("/api/auth/login/magic-link", strictLimiter);

// ─── Mount routes ───
app.use(sqlRoutes);
app.use(clientApiRoutes);
app.use(authRoutes);
app.use(authWebhookRoutes);
app.use(storageRoutes);
app.use(branchesRoutes);
app.use(featuresRoutes);
app.use(fdwRoutes);
app.use(migrationsRoutes);
app.use(ketoRoutes);
app.use(realtimeRoutes);
app.use(vectorsRoutes);
app.use(searchRoutes);
app.use(webhooksRoutes);
app.use(projectsRoutes);
app.use(environmentsRoutes);
app.use(hydraRoutes);
app.use(oathkeeperRoutes);
app.use(connectionsRoutes);
app.use(orgsRoutes);
app.use(sampleAppRoutes);
app.use(configRoutes);
app.use(flagsRoutes);
app.use(cacheRoutes);
app.use(integrationsRoutes);
app.use(extensionsRoutes);

// ─── Cloud routes (e.g. /demo routes in truss-cloud) — must be before the error handler ───
cloudHooks.routes.forEach((r) => app.use(r));

// ─── Global error handler (must be after all routes) ───
app.use(globalErrorHandler);

// ─── HTTP + WebSocket server ───
const httpServer = createServer(app);
const AUTH_REQUIRED_WS = process.env.TRUSS_AUTH_REQUIRED !== "false";
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });

// ─── WebSocket per-IP connection limiter ───
const wsConnectionsPerIp = new Map();
const WS_MAX_PER_IP = 50;

// Authenticate WebSocket upgrades before accepting
httpServer.on("upgrade", async (req, socket, head) => {
  if (req.url?.split("?")[0] !== "/realtime") {
    socket.destroy();
    return;
  }

  // Per-IP WebSocket connection limit
  const wsIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const wsIpCount = wsConnectionsPerIp.get(wsIp) || 0;
  if (wsIpCount >= WS_MAX_PER_IP) {
    socket.write("HTTP/1.1 429 Too Many Connections\r\n\r\n");
    socket.destroy();
    return;
  }

  // Helper: track IP on successful upgrade and clean up on close
  const trackWsIp = (ws) => {
    wsConnectionsPerIp.set(wsIp, (wsConnectionsPerIp.get(wsIp) || 0) + 1);
    ws.on("close", () => {
      const c = wsConnectionsPerIp.get(wsIp) || 1;
      if (c <= 1) wsConnectionsPerIp.delete(wsIp);
      else wsConnectionsPerIp.set(wsIp, c - 1);
    });
  };

  // In dev mode (auth not required), allow all connections
  if (!AUTH_REQUIRED_WS) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._authMode = "dev";
      ws.tenantId = null;
      trackWsIp(ws);
      wss.emit("connection", ws, req);
    });
    return;
  }

  try {
    // Check for API key in query string
    // NOTE: API keys in query strings may appear in server access logs and proxy logs.
    // This is a known limitation of the WebSocket protocol — the browser upgrade request
    // does not support custom headers, so query params are the only option for client-side WS auth.
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const apiKeyParam = url.searchParams.get("apikey");
    if (apiKeyParam) {
      const key = await resolveApiKey(apiKeyParam);
      if (key) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws._authMode = "apikey";
          ws._apiKey = key;
          ws.tenantId = key.tenant_id || null;
          trackWsIp(ws);
          wss.emit("connection", ws, req);
        });
        return;
      }
    }

    // Check for session cookie
    const tenant = await verifySession(req);
    if (tenant) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws._authMode = "session";
        ws._tenant = tenant;
        ws.tenantId = tenant.id || null;
        trackWsIp(ws);
        wss.emit("connection", ws, req);
      });
      return;
    }

    // Cloud overlay WS auth (e.g. demo connections in truss-cloud). Each handler
    // returns { authMode, tenantId } to accept the upgrade, or null to pass.
    for (const handler of cloudHooks.wsUpgrade) {
      const decision = handler(req);
      if (decision) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws._authMode = decision.authMode;
          ws.tenantId = decision.tenantId || null;
          trackWsIp(ws);
          wss.emit("connection", ws, req);
        });
        return;
      }
    }

    // Reject unauthorized
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  realtimeClients.add(ws);
  ws.send(JSON.stringify({ type: "connected", channels: [...realtimeChannels], ts: new Date().toISOString() }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "presence_join":
          if (msg.channel && msg.user_id)
            presenceJoin(ws, String(msg.channel).slice(0, 128), String(msg.user_id).slice(0, 128), msg.meta || {});
          break;
        case "presence_leave":
          if (msg.channel) presenceLeave(ws, String(msg.channel));
          break;
        case "presence_heartbeat":
          presenceHeartbeat(ws);
          break;
      }
    } catch { /* malformed */ }
  });

  ws.on("close", () => { presenceDisconnect(ws); realtimeClients.delete(ws); });
  ws.on("error", () => { presenceDisconnect(ws); realtimeClients.delete(ws); });
});

// ─── Bootstrap internal schema before accepting requests ───
ensureInternalSchema().then(async () => {
  logger.info("Truss internal schema ready");

  // Seed dev tenants when TRUSS_DEV_MODE is enabled
  if (process.env.TRUSS_DEV_MODE === "true" || process.env.NODE_ENV !== "production") {
    try {
      logger.info("Dev mode: seeding dev tenants...");
      await seedDevTenants();
    } catch (err) {
      logger.error({ err: err.message }, "Dev tenant seed warning");
    }
  }
}).catch(err => {
  logger.error({ err: err.message }, "Failed to bootstrap internal schema");
}).finally(() => {
  httpServer.listen(API_PORT, "0.0.0.0", () => {
    const masked = getActiveDatabaseUrl() ? maskConnectionString(getActiveDatabaseUrl()) : "not configured";
    logger.info({ port: API_PORT, database: masked }, `Truss API listening on http://localhost:${API_PORT}`);
    logger.info(`Realtime WebSocket at ws://localhost:${API_PORT}/realtime`);
    bootstrapRealtimeListener();
    // First-boot default admin (no-op if any identity already exists)
    bootstrapAdmin();
    // Clean up old logs daily (24h interval)
    cleanupOldLogs();
    setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
  });

  // ─── Graceful shutdown ───
  // On SIGTERM (Docker stop / Coolify redeploy):
  // 1. Stop accepting new connections
  // 2. Let in-flight requests finish (up to 10s)
  // 3. Close DB pool + WebSocket connections
  // 4. Exit cleanly
  let shuttingDown = false;
  // Return 503 on health check during shutdown so load balancers stop routing
  app.use((req, res, next) => {
    if (shuttingDown && req.path === "/api/health") {
      return res.status(503).json({ ok: false, shutting_down: true });
    }
    next();
  });

  const shutdown = (signal) => {
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown initiated — draining connections...");
    // Stop accepting new connections
    httpServer.close(() => {
      logger.info("HTTP server closed — all connections drained");
      // Close DB pool
      const pool = getPool();
      if (pool) pool.end().catch(() => {});
      process.exit(0);
    });
    // Close all WebSocket connections gracefully
    for (const [, clients] of realtimeChannels) {
      for (const ws of clients) {
        try { ws.close(1001, "Server shutting down"); } catch {}
      }
    }
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      logger.warn("Forced shutdown after 10s timeout");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
