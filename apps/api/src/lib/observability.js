import crypto from "node:crypto";
import { getPool } from "./state.js";
import logger from "./logger.js";

const log = logger.child({ module: "observability" });

// ─── Request ID + Structured Request Logger Middleware ─────────────────────

const SKIP_PATHS = new Set(["/api/health", "/favicon.ico"]);

export function requestLogger(req, res, next) {
  // Assign a unique request ID for correlation across all log entries
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  if (SKIP_PATHS.has(req.path)) return next();

  const start = Date.now();
  const originalEnd = res.end;
  let responseBytes = 0;

  res.end = function (chunk, encoding, callback) {
    if (chunk) {
      responseBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding || "utf8");
    }
    return originalEnd.call(this, chunk, encoding, callback);
  };

  res.on("finish", () => {
    const latencyMs = Date.now() - start;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    const tenantId = req.tenant?.id || null;
    const status = res.statusCode;

    // ── Structured Pino log ──
    // Beautiful, consistent format: every request gets a single info/warn/error line
    const logData = {
      reqId: req.id,
      method: req.method,
      path: req.path,
      status,
      latency: latencyMs,
      bytes: responseBytes,
      tenant: tenantId,
      ip,
    };

    if (status >= 500) {
      log.error(logData, `${req.method} ${req.path} → ${status} (${latencyMs}ms)`);
    } else if (status >= 400) {
      log.warn(logData, `${req.method} ${req.path} → ${status} (${latencyMs}ms)`);
    } else {
      log.info(logData, `${req.method} ${req.path} → ${status} (${latencyMs}ms)`);
    }

    // ── DB persistence ──
    const pool = getPool();
    if (!pool) return;
    pool.query(
      `INSERT INTO truss_internal.request_logs
        (method, path, status_code, latency_ms, response_bytes, api_key_id, tenant_id, ip_address, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.method, req.path, status, latencyMs, responseBytes, req.apiKey?.id || null, tenantId, ip, req.id]
    ).catch(() => {});
  });

  next();
}

// ─── Error Logger ──────────────────────────────────────────────────────────

export function logError(errorType, message, stackTrace, endpoint, statusCode, tenantId, reqId) {
  const pool = getPool();
  if (!pool) return;

  pool.query(
    `INSERT INTO truss_internal.error_logs
      (error_type, message, stack_trace, endpoint, status_code, tenant_id, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [errorType, message, stackTrace || null, endpoint || null, statusCode || null, tenantId || null, reqId || null]
  ).catch(() => {});
}

// ─── Global Error Handler Middleware ───────────────────────────────────────

export function globalErrorHandler(err, req, res, _next) {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  // Structured error log with request correlation
  log.error({
    reqId: req.id,
    err: message,
    stack: statusCode >= 500 ? err.stack : undefined,
    method: req.method,
    path: req.path,
    status: statusCode,
    tenant: req.tenant?.id || null,
  }, `ERROR ${req.method} ${req.path} → ${statusCode}: ${message}`);

  // Persist to error_logs table
  logError(
    err.name || "UnhandledError",
    message,
    err.stack || null,
    `${req.method} ${req.path}`,
    statusCode,
    req.tenant?.id || null,
    req.id
  );

  if (!res.headersSent) {
    let clientMessage = message;
    if (process.env.NODE_ENV === "production" && statusCode >= 500) {
      clientMessage = "Internal server error";
    }
    res.status(statusCode).json({
      error: clientMessage,
      requestId: req.id, // Always include — tenants can report this for debugging
    });
  }
}

// ─── Feature Usage Tracker ─────────────────────────────────────────────────
// Tracks which features tenants actually use. Powers the admin feature heatmap.

export function trackFeature(tenantId, feature, action) {
  const pool = getPool();
  if (!pool) return;

  pool.query(
    `INSERT INTO truss_internal.feature_usage (tenant_id, feature, action)
     VALUES ($1, $2, $3)`,
    [tenantId || null, feature, action || "use"]
  ).catch(() => {});
}

// ─── Security Event Logger ─────────────────────────────────────────────────
// Critical security-relevant events. Visible in admin security dashboard.
//
// Event types:
//   auth.login_failed      — failed login attempt
//   auth.password_changed  — password changed
//   auth.mfa_enabled       — MFA enabled/disabled
//   api_key.created        — new API key generated
//   api_key.revoked        — API key revoked
//   api_key.rate_limited   — rate limit hit
//   admin.tenant_suspended — admin suspended a tenant
//   admin.plan_override    — admin changed a tenant's plan
//   extension.enabled      — Postgres extension toggled
//   extension.disabled     — Postgres extension toggled

export function logSecurityEvent(eventType, details, ipAddress, tenantId) {
  const pool = getPool();
  if (!pool) return;

  log.warn({
    event: eventType,
    tenant: tenantId,
    ip: ipAddress,
    details: typeof details === "object" ? details : { info: details },
  }, `SECURITY ${eventType}${tenantId ? ` [${tenantId}]` : ""}`);

  pool.query(
    `INSERT INTO truss_internal.security_events (event_type, details, ip_address, tenant_id)
     VALUES ($1, $2, $3, $4)`,
    [eventType, typeof details === "object" ? JSON.stringify(details) : JSON.stringify({ info: details }), ipAddress || null, tenantId || null]
  ).catch(() => {});
}

// ─── Login History Logger ──────────────────────────────────────────────────

export function logLogin(tenantId, identityId, ipAddress, userAgent, success) {
  const pool = getPool();
  if (!pool) return;

  const level = success ? "info" : "warn";
  log[level]({
    tenant: tenantId,
    identity: identityId,
    ip: ipAddress,
    success,
  }, `AUTH ${success ? "login_success" : "login_failed"}${tenantId ? ` [${tenantId}]` : ""}`);

  pool.query(
    `INSERT INTO truss_internal.login_history (tenant_id, identity_id, ip_address, user_agent, success)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId || null, identityId || null, ipAddress || null, userAgent || null, success ?? true]
  ).catch(() => {});
}

// ─── Log Cleanup (retention enforcement) ───────────────────────────────────
// Run on startup + daily. Prevents log tables from growing unbounded.

const RETENTION = {
  request_logs: 30,    // High volume, low value after 30d
  error_logs: 90,      // Need for debugging patterns
  login_history: 90,   // Security audit
  feature_usage: 90,   // Analytics
  security_events: 365, // Incident investigation — keep 1 year
  webhook_logs: 30,    // Delivery debugging
  audit_logs: 365,     // Compliance — keep 1 year
};

export async function cleanupOldLogs() {
  const pool = getPool();
  if (!pool) return;

  let cleaned = 0;
  const results = [];

  for (const [table, days] of Object.entries(RETENTION)) {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM truss_internal.${table} WHERE created_at < NOW() - INTERVAL '${days} days'`
      );
      if (rowCount > 0) {
        results.push({ table, deleted: rowCount, retention: `${days}d` });
        cleaned += rowCount;
      }
    } catch {
      // Table may not exist yet — skip silently
    }
  }

  if (cleaned > 0) {
    log.info({ tables: results, totalDeleted: cleaned }, `LOG CLEANUP: purged ${cleaned} expired records`);
  }
}
