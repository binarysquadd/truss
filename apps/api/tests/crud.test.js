/**
 * Comprehensive CRUD & endpoint coverage tests.
 * Covers every module: Storage, Webhooks, Branches, Backups, Flags,
 * Extensions, Search, Vectors, Realtime, Projects/Orgs, Settings,
 * Billing, Audit, Performance, Ory services, Auth Admin, Database
 * sub-features, Consumption/Metrics.
 *
 * Uses demo mode (X-Demo header) — writes expect 403 in demo, 200 in dev.
 */
import { describe, it } from "node:test";
import { api, demoApi, assert, assertStatus } from "./helpers.js";

// Detect dev mode
let isDevMode = false;
const _check = await api("/api/auth/session");
if (_check.status === 200 && _check.data?.authRequired === false) isDevMode = true;

describe("Storage CRUD", () => {
  it("GET /api/storage/buckets — list buckets", async () => {
    const res = await demoApi("/api/storage/buckets");
    assert([200, 503].includes(res.status), `Expected 200/503, got ${res.status}`);
  });

  it("POST /api/storage/buckets — create bucket (or demo block)", async () => {
    const res = await demoApi("/api/storage/buckets", {
      method: "POST",
      json: { name: `smoke-test-${Date.now()}` },
    });
    // 403 in demo, 200 in dev (if MinIO connected), 503 if MinIO down
    assert([200, 201, 403, 503].includes(res.status), `Expected 200/201/403/503, got ${res.status}`);
  });

  it("GET /api/storage/buckets/:name/objects — list objects", async () => {
    const res = await demoApi("/api/storage/buckets/test/objects");
    assert([200, 400, 404, 503].includes(res.status), `Expected 200/400/404/503, got ${res.status}`);
  });
});

describe("Webhook CRUD", () => {
  it("GET /api/webhooks — list", async () => {
    const res = await demoApi("/api/webhooks");
    assertStatus(res, 200);
  });

  it("POST /api/webhooks — create (or demo block)", async () => {
    const res = await demoApi("/api/webhooks", {
      method: "POST",
      json: { name: "test-hook", url: "https://example.com/hook", table_name: "pg_class", events: ["INSERT"] },
    });
    assert([200, 201, 403, 500].includes(res.status), `got ${res.status}`);
  });
});

describe("Branch CRUD", () => {
  it("GET /api/branches — list", async () => {
    const res = await demoApi("/api/branches");
    assertStatus(res, 200);
  });

  it("POST /api/branches — create (or demo block)", async () => {
    const res = await demoApi("/api/branches", {
      method: "POST",
      json: { label: "test-branch" },
    });
    assert([200, 201, 403, 400].includes(res.status), `got ${res.status}`);
  });
});

describe("Backup CRUD", () => {
  it("GET /api/backups — list", async () => {
    const res = await demoApi("/api/backups");
    assertStatus(res, 200);
  });
});

describe("Flag CRUD", () => {
  it("GET /api/flags — list", async () => {
    const res = await demoApi("/api/flags");
    assertStatus(res, 200);
  });

  it("POST /api/flags — create flag (or demo block)", async () => {
    const res = await demoApi("/api/flags", {
      method: "POST",
      json: { flagKey: `smoke-${Date.now()}`, name: "Smoke Test", flag_type: "boolean" },
    });
    assert([200, 201, 400, 403, 409].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/flags/segments — list segments", async () => {
    const res = await demoApi("/api/flags/segments");
    assertStatus(res, 200);
  });

  it("GET /api/flags/status — flagd health", async () => {
    const res = await demoApi("/api/flags/status");
    assertStatus(res, 200);
  });

  it("GET /api/flags/evaluation-log — eval history", async () => {
    const res = await demoApi("/api/flags/evaluation-log");
    assertStatus(res, 200);
  });
});

describe("Extension CRUD", () => {
  it("GET /api/extensions — list", async () => {
    const res = await demoApi("/api/extensions");
    assertStatus(res, 200);
    assert(Array.isArray(res.data?.extensions || res.data), "Should return array");
  });
});

describe("Search Endpoints", () => {
  it("GET /api/search/configs", async () => {
    const res = await demoApi("/api/search/configs");
    assert(res.status !== 500, `Should not 500, got ${res.status}`);
  });

  it("GET /api/search/indexes", async () => {
    const res = await demoApi("/api/search/indexes");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/search/eligible", async () => {
    const res = await demoApi("/api/search/eligible");
    assert(res.status !== 500, `Should not 500`);
  });
});

describe("Vector Endpoints", () => {
  it("GET /api/vectors/status", async () => {
    const res = await demoApi("/api/vectors/status");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/vectors/collections", async () => {
    const res = await demoApi("/api/vectors/collections");
    assert(res.status !== 500, `Should not 500`);
  });
});

describe("Realtime Endpoints", () => {
  it("GET /api/realtime/status", async () => {
    const res = await demoApi("/api/realtime/status");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/realtime/subscriptions", async () => {
    const res = await demoApi("/api/realtime/subscriptions");
    assertStatus(res, 200);
  });

  it("GET /api/realtime/tables", async () => {
    const res = await demoApi("/api/realtime/tables");
    assert(res.status !== 500, `Should not 500`);
  });
});

describe("Project & Org Endpoints", () => {
  it("GET /api/projects — list", async () => {
    const res = await demoApi("/api/projects");
    assertStatus(res, 200);
  });

  it("GET /api/orgs — list (or 404 if route unmounted)", async () => {
    const res = await demoApi("/api/orgs");
    assert([200, 404].includes(res.status), `got ${res.status}`);
  });
});

describe("Settings Endpoints", () => {
  it("GET /api/settings/dashboard-config", async () => {
    const res = await demoApi("/api/settings/dashboard-config");
    assert(res.status !== 500, `Should not 500, got ${res.status}`);
  });

  it("GET /api/settings/general", async () => {
    const res = await demoApi("/api/settings/general");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/billing/plan — current plan", async () => {
    const res = await demoApi("/api/billing/plan");
    assertStatus(res, 200);
  });

  it("GET /api/billing/usage — usage metrics", async () => {
    const res = await demoApi("/api/billing/usage");
    assertStatus(res, 200);
  });

  it("GET /api/billing/trial-status", async () => {
    const res = await demoApi("/api/billing/trial-status");
    assertStatus(res, 200);
  });
});

describe("Audit & Logs", () => {
  it("GET /api/audit-logs", async () => {
    const res = await demoApi("/api/audit-logs");
    assertStatus(res, 200);
  });
});

describe("Performance & Advisors", () => {
  it("GET /api/performance/latency", async () => {
    const res = await demoApi("/api/performance/latency");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/performance/top-queries", async () => {
    const res = await demoApi("/api/performance/top-queries");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/sql/diagnostics", async () => {
    const res = await demoApi("/api/sql/diagnostics");
    assertStatus(res, 200);
  });

  it("GET /api/sql/locks", async () => {
    const res = await demoApi("/api/sql/locks");
    assertStatus(res, 200);
  });

  it("GET /api/sql/autovacuum", async () => {
    const res = await demoApi("/api/sql/autovacuum");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/rls/policies", async () => {
    const res = await demoApi("/api/rls/policies");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/partitioning/advisor", async () => {
    const res = await demoApi("/api/partitioning/advisor");
    assert(res.status !== 500, `Should not 500`);
  });
});

describe("Ory Service Health", () => {
  it("GET /api/keto/health", async () => {
    const res = await demoApi("/api/keto/health");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/keto/namespaces", async () => {
    const res = await demoApi("/api/keto/namespaces");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/hydra/health", async () => {
    const res = await demoApi("/api/hydra/health");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/hydra/clients", async () => {
    const res = await demoApi("/api/hydra/clients");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/oathkeeper/health", async () => {
    const res = await demoApi("/api/oathkeeper/health");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/oathkeeper/rules", async () => {
    const res = await demoApi("/api/oathkeeper/rules");
    assert(res.status !== 500, `Should not 500`);
  });
});

describe("Auth Admin Endpoints", () => {
  it("GET /api/auth/identities — list identities (admin or dev mode)", async () => {
    const res = await demoApi("/api/auth/identities");
    // Admin endpoint — 200 in dev mode (admin), 403 in demo
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/auth/sessions — list sessions", async () => {
    const res = await demoApi("/api/auth/sessions");
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/auth/providers — list auth providers", async () => {
    const res = await demoApi("/api/auth/providers");
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/auth/schemas — list identity schemas", async () => {
    const res = await demoApi("/api/auth/schemas");
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/auth/login-history", async () => {
    const res = await demoApi("/api/auth/login-history");
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });

  it("GET /api/auth/security-config", async () => {
    const res = await demoApi("/api/auth/security-config");
    assert([200, 403].includes(res.status), `got ${res.status}`);
  });
});

describe("Database Sub-Features", () => {
  it("GET /api/sql/erd — ERD data", async () => {
    const res = await demoApi("/api/sql/erd");
    assertStatus(res, 200);
  });

  it("GET /api/sql/catalog — schema catalog", async () => {
    const res = await demoApi("/api/sql/catalog");
    assertStatus(res, 200);
  });

  it("GET /api/sql/table-browser — paginated rows", async () => {
    const res = await demoApi("/api/sql/table-browser?table=pg_class&schema=pg_catalog&limit=5");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/sql/metadata — column metadata", async () => {
    const res = await demoApi("/api/sql/metadata");
    assertStatus(res, 200);
  });

  it("GET /api/sql/fdw — FDW status", async () => {
    const res = await demoApi("/api/sql/fdw");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/roles — list roles", async () => {
    const res = await demoApi("/api/roles");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/pool/stats — pool statistics", async () => {
    const res = await demoApi("/api/pool/stats");
    assertStatus(res, 200);
  });

  it("GET /api/sql/connection-inspector", async () => {
    const res = await demoApi("/api/sql/connection-inspector");
    assertStatus(res, 200);
  });
});

describe("Consumption & Metrics", () => {
  it("GET /api/consumption", async () => {
    const res = await demoApi("/api/consumption");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/consumption/history", async () => {
    const res = await demoApi("/api/consumption/history");
    assert(res.status !== 500, `Should not 500`);
  });

  it("GET /api/metrics/services", async () => {
    const res = await demoApi("/api/metrics/services");
    assert(res.status !== 500, `Should not 500`);
  });
});
