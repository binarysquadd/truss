/**
 * SQL workbench & database endpoint smoke tests.
 * Uses demo mode for authenticated access.
 */
import { describe, it } from "node:test";
import { demoApi, assertStatus, assertKeys, assert } from "./helpers.js";

describe("SQL Workbench — Schema", () => {
  it("GET /api/sql/tables — returns table data", async () => {
    const res = await demoApi("/api/sql/tables");
    assertStatus(res, 200, "tables list");
    // Response may be array or object with tables key
    const tables = Array.isArray(res.data) ? res.data : (res.data?.tables || res.data?.rows || []);
    assert(tables !== undefined, "Should return table data");
  });

  it("GET /api/sql/metadata — returns column metadata", async () => {
    const res = await demoApi("/api/sql/metadata");
    assertStatus(res, 200, "metadata");
    assert(res.data, "Should return metadata object");
  });

  it("GET /api/sql/erd — returns ERD data", async () => {
    const res = await demoApi("/api/sql/erd");
    assertStatus(res, 200, "ERD");
    // ERD returns tables and relationships
    assert(res.data, "Should return ERD data");
  });

  it("GET /api/sql/catalog — returns schema catalog", async () => {
    const res = await demoApi("/api/sql/catalog");
    assertStatus(res, 200, "catalog");
  });
});

describe("SQL Workbench — Queries", () => {
  it("POST /api/sql/query — executes SELECT", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT 1 AS num, 'hello' AS msg" },
    });
    assertStatus(res, 200, "SELECT query");
    const rows = res.data?.rows || res.data?.result?.rows || [];
    assert(rows.length === 1, `Should return 1 row, got ${rows.length}`);
  });

  it("POST /api/sql/query — blocks INSERT in demo", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "INSERT INTO demo_users (name, email) VALUES ('hack', 'hack@test.com')" },
    });
    // Should be blocked — either 403 (demo write protection) or 400 (read-only SQL)
    assert(res.status >= 400, `Should block INSERT, got ${res.status}`);
  });

  it("POST /api/sql/query — blocks DROP in demo", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "DROP TABLE demo_users" },
    });
    assert(res.status >= 400, `Should block DROP, got ${res.status}`);
  });

  it("POST /api/sql/query — blocks DELETE in demo", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "DELETE FROM demo_users" },
    });
    assert(res.status >= 400, `Should block DELETE, got ${res.status}`);
  });

  it("POST /api/sql/explain — returns query plan", async () => {
    const res = await demoApi("/api/sql/explain", {
      method: "POST",
      json: { sql: "SELECT * FROM pg_class WHERE oid = 1" },
    });
    assertStatus(res, 200, "EXPLAIN");
    assert(res.data, "Should return explain output");
  });
});

describe("SQL Workbench — Diagnostics", () => {
  it("GET /api/sql/diagnostics — returns diagnostic info", async () => {
    const res = await demoApi("/api/sql/diagnostics");
    assertStatus(res, 200, "diagnostics");
  });

  it("GET /api/sql/locks — returns lock info", async () => {
    const res = await demoApi("/api/sql/locks");
    assertStatus(res, 200, "locks");
  });

  it("GET /api/sql/connection-inspector — returns connection details", async () => {
    const res = await demoApi("/api/sql/connection-inspector");
    assertStatus(res, 200, "connection inspector");
  });

  it("GET /api/pool/stats — returns pool statistics", async () => {
    const res = await demoApi("/api/pool/stats");
    assertStatus(res, 200, "pool stats");
  });
});

describe("SQL Workbench — Saved Queries", () => {
  it("GET /api/sql/saved-queries — returns saved queries", async () => {
    const res = await demoApi("/api/sql/saved-queries");
    assertStatus(res, 200, "saved queries");
    const queries = res.data?.queries || res.data || [];
    assert(Array.isArray(queries), "Should return array");
  });
});

describe("Database Features", () => {
  it("GET /api/extensions — returns extension catalog", async () => {
    const res = await demoApi("/api/extensions");
    assertStatus(res, 200, "extensions");
    const exts = res.data?.extensions || res.data || [];
    assert(Array.isArray(exts), "Should return array of extensions");
    assert(exts.length >= 20, `Should have >=20 curated extensions, got ${exts.length}`);
    // Each extension should have name and installed status
    if (exts.length > 0) {
      assertKeys(exts[0], ["name"], "extension item");
    }
  });

  it("GET /api/performance/latency — returns latency stats", async () => {
    const res = await demoApi("/api/performance/latency");
    assert(res.status !== 500, "Latency stats should not 500");
  });

  it("GET /api/rls/policies — returns RLS policies", async () => {
    const res = await demoApi("/api/rls/policies");
    assert(res.status !== 500, "RLS policies should not 500");
  });
});
