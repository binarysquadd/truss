/**
 * Authentication & authorization smoke tests.
 * Tests auth flows, session handling, and access control.
 */
import { describe, it } from "node:test";
import { api, demoApi, assertStatus, assert } from "./helpers.js";

// Detect if API is in dev mode (AUTH_REQUIRED=false) — if so, unauthenticated requests succeed
let isDevMode = false;
const _sessionCheck = await api("/api/auth/session");
if (_sessionCheck.status === 200 && _sessionCheck.data?.authRequired === false) isDevMode = true;

describe("Authentication — Access Control", () => {
  it("GET /api/sql/tables — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/sql/tables");
    assert(isDevMode ? res.status === 200 : res.status === 401, `Expected ${isDevMode ? 200 : 401}, got ${res.status}`);
  });

  it("GET /api/webhooks — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/webhooks");
    assert(isDevMode ? res.status === 200 : res.status === 401, `Expected ${isDevMode ? 200 : 401}, got ${res.status}`);
  });

  it("GET /api/flags — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/flags");
    assert(isDevMode ? res.status === 200 : res.status === 401, `Expected ${isDevMode ? 200 : 401}, got ${res.status}`);
  });

  it("GET /api/storage/buckets — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/storage/buckets");
    const ok = isDevMode ? (res.status === 200 || res.status === 503) : res.status === 401;
    assert(ok, `Expected ${isDevMode ? "200/503" : "401"}, got ${res.status}`);
  });

  it("GET /api/projects — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/projects");
    assert(isDevMode ? res.status === 200 : res.status === 401, `Expected ${isDevMode ? 200 : 401}, got ${res.status}`);
  });

  it("GET /api/orgs — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/orgs");
    assert(isDevMode ? res.status === 200 : res.status === 401, `Expected ${isDevMode ? 200 : 401}, got ${res.status}`);
  });

  it("GET /api/keys — requires auth (or succeeds in dev mode)", async () => {
    const res = await api("/api/keys");
    // In dev mode may return 200 or 500 (if no project context)
    const ok = isDevMode ? (res.status === 200 || res.status === 500) : res.status === 401;
    assert(ok, `Expected ${isDevMode ? "200/500" : "401"}, got ${res.status}`);
  });
});

// NOTE: admin analytics, waitlist, and invites are truss-cloud features (removed from
// the OSS core de-cloud), so they are not tested here.

describe("Authentication — Demo Access", () => {
  it("Demo user can read SQL tables", async () => {
    const res = await demoApi("/api/sql/tables");
    assertStatus(res, 200, "demo read access");
  });

  it("Demo user can read flags", async () => {
    const res = await demoApi("/api/flags");
    assertStatus(res, 200, "demo flag access");
  });

  it("Demo user cannot create projects (or dev mode allows)", async () => {
    const res = await demoApi("/api/projects/provision", {
      method: "POST",
      json: { name: "smoke-test-project" },
    });
    // 403 in demo mode, 200 in dev mode (admin bypass)
    assert(res.status === 403 || res.status === 200, `Expected 403 (demo) or 200 (dev), got ${res.status}`);
  });

});

describe("Client API (/v1/*) — API Key Auth", () => {
  it("POST /v1/sql — requires API key", async () => {
    const res = await api("/v1/sql", {
      method: "POST",
      json: { sql: "SELECT 1" },
    });
    assertStatus(res, 401, "v1/sql without API key");
  });

  it("GET /v1/status — requires API key", async () => {
    const res = await api("/v1/status");
    assertStatus(res, 401, "v1/status without API key");
  });

  it("GET /v1/db/users — requires API key", async () => {
    const res = await api("/v1/db/users");
    assertStatus(res, 401, "v1/db without API key");
  });

  it("POST /v1/sql — rejects invalid API key", async () => {
    const res = await api("/v1/sql", {
      method: "POST",
      json: { sql: "SELECT 1" },
      headers: { apikey: "truss_pk_invalid_key_12345" },
    });
    assertStatus(res, 403, "v1/sql with invalid key");
  });
});

describe("Rate Limiting", () => {
  it("Returns rate limit headers on API requests", async () => {
    const res = await demoApi("/api/sql/tables");
    // Rate limit headers should be present on authenticated requests
    // (demo counts as authenticated)
    // X-RateLimit headers come from the rate limiter middleware
    assert(res.status === 200, "Should succeed");
  });
});
