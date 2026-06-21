// Pure configuration helpers. No imports, no side effects, no env reads here —
// callers pass values in. Kept dependency-free so they are trivially unit-testable.

/**
 * Build the flagd base URL from host/port/explicit-url.
 * A bare host gets http:// + the port. A host that already carries a scheme
 * (e.g. "http://flagd") still needs the port appended, otherwise it resolves to
 * :80 and the evaluation API (8013) is never reached.
 */
export function buildFlagdUrl(host, port, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const withScheme = String(host).startsWith("http") ? String(host) : `http://${host}`;
  try {
    const u = new URL(withScheme);
    if (!u.port && port) u.port = String(port);
    return u.origin;
  } catch {
    return withScheme;
  }
}

/**
 * Decide whether the session cookie should carry the `Secure` flag.
 * Secure cookies are only sent over HTTPS, so forcing it on a plain-HTTP
 * self-host makes the browser drop the cookie and login never sticks.
 * Precedence: explicit COOKIE_SECURE override > public URL scheme > NODE_ENV.
 */
export function decideCookieSecure({ cookieSecureEnv, publicUrl, isProduction }) {
  if (cookieSecureEnv) return cookieSecureEnv === "true";
  if (publicUrl) return String(publicUrl).startsWith("https://");
  return Boolean(isProduction);
}
