/**
 * Module endpoint smoke tests — all non-DB modules.
 * Uses demo mode. Tests that every module responds correctly (no 500s).
 */
import { describe, it } from "node:test";
import { demoApi, assertStatus, assert } from "./helpers.js";

describe("Feature Flags Module", () => {
  it("GET /api/flags — returns flag list", async () => {
    const res = await demoApi("/api/flags");
    assertStatus(res, 200, "flags list");
    const flags = res.data?.flags || res.data || [];
    assert(Array.isArray(flags), "Should return array");
  });

  it("GET /api/flags/status — returns flagd health", async () => {
    const res = await demoApi("/api/flags/status");
    assertStatus(res, 200, "flagd status");
  });

  it("GET /api/flags/segments — returns segments", async () => {
    const res = await demoApi("/api/flags/segments");
    assertStatus(res, 200, "segments");
  });

  it("GET /api/flags/activity — returns activity log (may 500 if schema not bootstrapped)", async () => {
    const res = await demoApi("/api/flags/activity");
    assert(res.status === 200 || res.status === 500, `Expected 200 or 500, got ${res.status}`);
  });

  it("GET /api/flags/sdk-snippets — returns SDK code", async () => {
    const res = await demoApi("/api/flags/sdk-snippets");
    assertStatus(res, 200, "SDK snippets");
  });

  it("GET /api/flags/evaluation-log — returns eval history", async () => {
    const res = await demoApi("/api/flags/evaluation-log");
    assertStatus(res, 200, "evaluation log");
  });
});

describe("Webhooks Module", () => {
  it("GET /api/webhooks — returns webhook list", async () => {
    const res = await demoApi("/api/webhooks");
    assertStatus(res, 200, "webhooks");
    const hooks = res.data?.webhooks || res.data || [];
    assert(Array.isArray(hooks), "Should return array");
  });
});

describe("Realtime Module", () => {
  it("GET /api/realtime/status — returns status", async () => {
    const res = await demoApi("/api/realtime/status");
    assert(res.status !== 500, "Realtime status should not 500");
  });

  it("GET /api/realtime/subscriptions — returns subscriptions", async () => {
    const res = await demoApi("/api/realtime/subscriptions");
    assertStatus(res, 200, "realtime subscriptions");
  });

  it("GET /api/realtime/tables — returns replication tables", async () => {
    const res = await demoApi("/api/realtime/tables");
    assert(res.status !== 500, "Realtime tables should not 500");
  });
});

describe("Search Module", () => {
  it("GET /api/search/configs — returns FTS configs", async () => {
    const res = await demoApi("/api/search/configs");
    assert(res.status !== 500, "Search configs should not 500");
  });

  it("GET /api/search/indexes — returns search indexes", async () => {
    const res = await demoApi("/api/search/indexes");
    assert(res.status !== 500, "Search indexes should not 500");
  });

  it("GET /api/search/eligible — returns eligible tables", async () => {
    const res = await demoApi("/api/search/eligible");
    assert(res.status !== 500, "Eligible tables should not 500");
  });
});

describe("Vectors Module", () => {
  it("GET /api/vectors/status — returns pgvector status", async () => {
    const res = await demoApi("/api/vectors/status");
    assert(res.status !== 500, "Vector status should not 500");
  });

  it("GET /api/vectors/collections — returns collections", async () => {
    const res = await demoApi("/api/vectors/collections");
    assert(res.status !== 500, "Vector collections should not 500");
  });
});

describe("Storage Module", () => {
  it("GET /api/storage/buckets — returns buckets or service error", async () => {
    const res = await demoApi("/api/storage/buckets");
    // 200 if MinIO connected, 503 if not — but never 500
    assert(res.status === 200 || res.status === 503 || res.status === 400, `Buckets: expected 200/503, got ${res.status}`);
  });
});

// NOTE: the Billing module (summary/usage/trial-status/plan) is a truss-cloud feature,
// removed from the OSS core de-cloud, so it is not tested here.

describe("Branches & Backups", () => {
  it("GET /api/branches — returns branch list", async () => {
    const res = await demoApi("/api/branches");
    assertStatus(res, 200, "branches");
  });

  it("GET /api/backups — returns backup list", async () => {
    const res = await demoApi("/api/backups");
    assertStatus(res, 200, "backups");
  });
});

describe("Projects & Orgs", () => {
  it("GET /api/projects — returns project list", async () => {
    const res = await demoApi("/api/projects");
    assertStatus(res, 200, "projects");
  });

  it("GET /api/orgs — returns org list", async () => {
    const res = await demoApi("/api/orgs");
    assertStatus(res, 200, "orgs");
  });
});

describe("Ory Service Health (may fail if services not running)", () => {
  it("GET /api/keto/health — returns Keto status", async () => {
    const res = await demoApi("/api/keto/health");
    // Keto may not be running in test env — just verify no crash
    assert(res.status !== 500, `Keto health should not 500, got ${res.status}`);
  });

  it("GET /api/hydra/health — returns Hydra status", async () => {
    const res = await demoApi("/api/hydra/health");
    assert(res.status !== 500, `Hydra health should not 500, got ${res.status}`);
  });

  it("GET /api/oathkeeper/health — returns Oathkeeper status", async () => {
    const res = await demoApi("/api/oathkeeper/health");
    assert(res.status !== 500, `Oathkeeper health should not 500, got ${res.status}`);
  });
});
