/**
 * Auth-required path integration test. Runs ONLY in auth mode
 * (TEST_AUTH_MODE=1, stack brought up with docker-compose.test-auth.yml).
 *
 * Exercises the chain that the dev-mode suite never touches and that hid three
 * bugs this week: real Kratos login, the `authenticated` flag, the HttpOnly
 * session cookie surviving over plain HTTP, first-boot admin seeding, and the
 * isAdmin gate on a write (cache flush).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_API_URL || "http://localhost:8788";
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@truss.local";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!";

// Minimal cookie jar over node fetch.
const jar = new Map();
function stash(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function jfetch(path, opts = {}) {
  const headers = { accept: "application/json", ...opts.headers };
  if (jar.size) headers.cookie = cookieHeader();
  if (opts.method && opts.method !== "GET") headers["x-csrf-token"] = jar.get("truss_csrf") || "test";
  if (opts.json) { headers["content-type"] = "application/json"; opts.body = JSON.stringify(opts.json); }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, signal: AbortSignal.timeout(10_000) });
  stash(res);
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

describe("Auth-required login path", { skip: !process.env.TEST_AUTH_MODE ? "set TEST_AUTH_MODE=1 + auth stack" : false }, () => {
  before(async () => { await jfetch("/api/auth/login"); }); // prime CSRF cookie

  it("logs in the first-boot admin and sets a session", async () => {
    const flow = await jfetch("/api/auth/login");
    assert.ok(flow.data?.id, "login flow has an id");
    const res = await jfetch("/api/auth/login", {
      method: "POST",
      json: { flowId: flow.data.id, method: "password", identifier: EMAIL, password: PASSWORD },
    });
    assert.equal(res.status, 200, `login status (${JSON.stringify(res.data).slice(0, 120)})`);
    assert.equal(res.data.authenticated, true, "authenticated flag is true");
    assert.ok(jar.has("truss_session"), "session cookie was set (not dropped over HTTP)");
  });

  it("session resolves to an admin tenant", async () => {
    const res = await jfetch("/api/auth/session");
    assert.equal(res.status, 200, "session status");
    assert.ok(res.data.tenant, "tenant present");
    assert.equal(res.data.tenant.email, EMAIL, "tenant email matches seeded admin");
    assert.equal(res.data.tenant.isAdmin, true, "seeded admin has isAdmin");
  });

  it("admin can flush the cache (isAdmin gate + CSRF over the real session)", async () => {
    const res = await jfetch("/api/cache/flush", { method: "POST" });
    assert.equal(res.status, 200, `flush status (${JSON.stringify(res.data).slice(0, 120)})`);
    assert.equal(res.data.ok, true, "flush ok");
  });
});
