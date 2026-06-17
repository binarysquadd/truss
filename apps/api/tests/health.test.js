/**
 * Health & public endpoint smoke tests.
 * These endpoints require NO authentication.
 * Tests: health check, billing plans, integrations status, OpenAPI docs, waitlist.
 */
import { describe, it } from "node:test";
import { api, assertStatus, assertKeys, assert } from "./helpers.js";

describe("Health & Public Endpoints", () => {
  it("GET /api/health — returns 200 with database info", async () => {
    const res = await api("/api/health");
    assertStatus(res, 200, "/api/health");
    // Health endpoint returns { ok, connection, pool, version, started_at }
    assert(res.data?.ok === true, "Health check should return ok: true");
    assertKeys(res.data, ["ok", "connection", "pool"], "/api/health");
  });

  it("GET /api/billing/plans — returns plan catalog", async () => {
    const res = await api("/api/billing/plans");
    assertStatus(res, 200, "/api/billing/plans");
    assertKeys(res.data, ["plans", "boosters"], "/api/billing/plans");
    // Verify trial plan exists
    assert(res.data.plans.trial, "Trial plan should exist in plans catalog");
    assert(res.data.plans.starter, "Starter plan should exist");
    assert(res.data.plans.pro, "Pro plan should exist");
    assert(res.data.plans.team, "Team plan should exist");
    assert(res.data.plans.business, "Business plan should exist");
    // Verify trial plan is $0
    assert(res.data.plans.trial.price_monthly === 0, "Trial plan should be $0/mo");
    // Verify boosters exist
    assert(Object.keys(res.data.boosters).length >= 4, "Should have at least 4 booster types");
  });

  it("GET /api/integrations/status — returns integration health", async () => {
    const res = await api("/api/integrations/status");
    assertStatus(res, 200, "/api/integrations/status");
    assertKeys(res.data, ["auth", "storage"], "/api/integrations/status");
    assertKeys(res.data.auth, ["configured", "reachable"], "integrations.auth");
    assertKeys(res.data.storage, ["console", "s3"], "integrations.storage");
  });

  it("GET /v1/docs — Swagger UI loads", async () => {
    const res = await api("/v1/docs/");
    // Swagger UI returns HTML
    assert(res.status === 200 || res.status === 301 || res.status === 304, `Swagger UI should return 200/301, got ${res.status}`);
  });

  it("GET /v1/openapi.json — OpenAPI spec is valid JSON", async () => {
    const res = await api("/v1/openapi.json");
    assertStatus(res, 200, "/v1/openapi.json");
    assertKeys(res.data, ["openapi", "info", "paths"], "OpenAPI spec");
    assert(res.data.openapi.startsWith("3."), "OpenAPI version should be 3.x");
    assert(Object.keys(res.data.paths).length > 50, `Should have >50 paths, got ${Object.keys(res.data.paths).length}`);
  });

  it("POST /api/waitlist — rejects empty email", async () => {
    const res = await api("/api/waitlist", { method: "POST", json: { email: "" } });
    assert(res.status >= 400, "Should reject empty email");
  });

  it("POST /api/waitlist — rejects invalid email", async () => {
    const res = await api("/api/waitlist", { method: "POST", json: { email: "not-an-email" } });
    assert(res.status >= 400, "Should reject invalid email");
  });

  it("GET /api/config/sdk-snippets/auth — returns SDK snippets", async () => {
    const res = await api("/api/config/sdk-snippets/auth");
    // May return 200 or 404 depending on config, but shouldn't 500
    assert(res.status !== 500, "SDK snippets should not 500");
  });
});

describe("Auth Flow Endpoints (Public)", () => {
  it("GET /api/auth/session — returns 401 without cookie (or 200 in dev mode)", async () => {
    const res = await api("/api/auth/session");
    // In dev mode (AUTH_REQUIRED=false), returns 200 with local dev tenant
    // In production, returns 401
    assert(res.status === 401 || (res.status === 200 && res.data?.authRequired === false),
      `Should return 401 (prod) or 200 with authRequired=false (dev), got ${res.status}`);
  });

  it("GET /api/auth/login — returns login flow or dev flow", async () => {
    const res = await api("/api/auth/login");
    // In dev mode returns { id: "dev-flow" }, in prod returns Kratos flow
    assert(res.status === 200, `Login flow init should return 200, got ${res.status}`);
    assert(res.data?.id, "Login flow should have an id");
  });

  it("GET /api/auth/register — returns register flow", async () => {
    const res = await api("/api/auth/register");
    assert(res.status === 200, `Register flow init should return 200, got ${res.status}`);
  });

  it("POST /api/auth/register — rejects disposable email (or dev mode skips)", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      json: {
        flowId: "test-flow",
        method: "password",
        traits: { email: "test@mailinator.com" },
        password: "testpassword123",
      },
    });
    // In production: 422 with disposable_blocked=true
    // In dev mode (AUTH_REQUIRED=false): skips Kratos, returns 200 with dev session
    assert(res.status === 422 || (res.status === 200 && res.data?.session_token),
      `Should reject disposable (422) or pass in dev mode (200), got ${res.status}`);
    if (res.status === 422) {
      assert(res.data?.disposable_blocked === true, "Should flag disposable_blocked");
    }
  });
});
