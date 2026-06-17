import crypto from "node:crypto";

// Paths exempt from CSRF validation (auth flows + external webhooks)
const CSRF_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/billing/webhook",
  // Only exempt dev tenant switcher outside production
  ...(process.env.NODE_ENV !== "production" ? ["/api/dev/switch-tenant"] : []),
];

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

/** Extract ALL values of a named cookie (handles duplicate cookies from different domains). */
function parseAllCookieValues(cookieHeader, name) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";")
    .map(c => c.trim())
    .filter(c => c.startsWith(name + "="))
    .map(c => c.slice(name.length + 1));
}

/** Detect the registrable cookie domain from the request Host header. */
function detectCookieDomain(req) {
  const host = (req.headers.host || "").split(":")[0]; // strip port
  // Skip domain cookies for IP addresses (localhost, 100.64.x.x, 192.168.x.x, etc.)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost") return undefined;
  const parts = host.split(".").filter(Boolean);
  return parts.length >= 3 ? "." + parts.slice(-2).join(".") : undefined;
}

/**
 * Clear the truss_csrf cookie with the CORRECT domain attribute.
 * Without matching the domain, the browser silently ignores the clear and keeps the old cookie.
 */
export function clearCsrfCookie(req, res) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const cookieDomain = detectCookieDomain(req);
  res.cookie("truss_csrf", "", {
    maxAge: 0,
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
    secure: isSecure,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

export function csrfMiddleware(req, res, next) {
  const cookieHeader = req.headers.cookie || "";

  // Always ensure the CSRF cookie exists on the response
  const existingToken = parseCookie(cookieHeader, "truss_csrf");
  if (!existingToken) {
    const token = crypto.randomBytes(32).toString("hex");
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
    const cookieDomain = detectCookieDomain(req);
    res.cookie("truss_csrf", token, {
      httpOnly: false, // JS needs to read this cookie
      sameSite: "Lax", // Lax (not Strict) for cross-subdomain compatibility
      secure: isSecure,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }

  // Only validate on state-changing methods
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  // Skip demo users (read-only, mutations blocked by demoWriteProtection)
  if (req.tenant?.isDemo) return next();

  // Skip /v1/* routes (API key auth, no cookies)
  if (req.path.startsWith("/v1/")) return next();

  // Skip /api paths that don't need CSRF
  if (!req.path.startsWith("/api/")) return next();

  // Skip exempt paths
  if (CSRF_EXEMPT_PATHS.some(p => req.path === p || req.path.startsWith(p + "/"))) return next();

  // Validate: compare X-CSRF-Token header with cookie value.
  // The browser may send duplicate truss_csrf cookies (e.g. one scoped to the
  // API domain and one to the parent domain).  document.cookie in the SPA will
  // read whichever value the browser exposes — which may differ from the first
  // one in the Cookie header.  Accept the request if the header matches ANY of
  // the cookie values to avoid false CSRF rejections after login/domain changes.
  const headerToken = req.headers["x-csrf-token"];
  const allCsrfTokens = parseAllCookieValues(cookieHeader, "truss_csrf");
  if (!allCsrfTokens.length || !headerToken || !allCsrfTokens.some(t => timingSafeCompare(headerToken, t))) {
    return res.status(403).json({ error: "CSRF token mismatch." });
  }

  next();
}
