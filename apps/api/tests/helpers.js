/**
 * Test helpers — shared utilities for all smoke tests.
 * Uses native fetch (Node 18+) against a running API server.
 */

const API_BASE = process.env.TEST_API_URL || "http://localhost:8787";

/** Make an API request with optional auth */
export async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { "accept": "application/json", ...opts.headers };
  // Add CSRF token for POST/PUT/PATCH/DELETE (bypass double-submit cookie check)
  if (opts.method && opts.method !== "GET" && opts.method !== "HEAD") {
    headers["x-csrf-token"] = "test";
    headers["cookie"] = (headers["cookie"] || "") + "; truss_csrf=test";
  }
  if (opts.json) {
    headers["content-type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }
  const res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(10_000) });
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) {
    try { data = await res.json(); } catch { data = null; }
  }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

/** Make a demo-mode request (adds X-Demo header) */
export async function demoApi(path, opts = {}) {
  const headers = { "x-demo": "true", ...opts.headers };
  return api(path, { ...opts, headers });
}

/** Assert helper — throws descriptive error on failure */
export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** Assert status code */
export function assertStatus(res, expected, context = "") {
  if (res.status !== expected) {
    const detail = res.data?.error || JSON.stringify(res.data)?.slice(0, 200) || "";
    throw new Error(`Expected ${expected}, got ${res.status}${context ? ` (${context})` : ""}${detail ? `: ${detail}` : ""}`);
  }
}

/** Assert response has expected keys */
export function assertKeys(obj, keys, context = "") {
  for (const key of keys) {
    if (!(key in obj)) {
      throw new Error(`Missing key "${key}" in response${context ? ` (${context})` : ""}. Keys present: ${Object.keys(obj).join(", ")}`);
    }
  }
}

export { API_BASE };
