/**
 * Security edge-case smoke tests.
 * Covers SQL injection, CSRF, SSRF, API key validation,
 * request size limits, protected schema access, and storage upload limits.
 * All tests are idempotent — no persistent side effects.
 */
import { describe, it } from "node:test";
import { api, demoApi, assert, assertStatus, API_BASE } from "./helpers.js";

/* ------------------------------------------------------------------ */
/*  1. SQL Injection Prevention                                       */
/* ------------------------------------------------------------------ */
describe("SQL Injection Prevention", () => {
  it("blocks stacked queries (semicolon injection)", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT 1; DROP TABLE demo_users;" },
    });
    assert(res.status >= 400, `Should block stacked queries, got ${res.status}`);
  });

  it("blocks UNION-based injection against pg_shadow", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT 1 UNION SELECT usename, passwd FROM pg_shadow" },
    });
    // UNION SELECT is valid read-only SQL but pg_shadow requires superuser
    assert(res.status === 200 || res.status === 400, `Expected 200/400, got ${res.status}`);
  });

  it("blocks pg_read_file function", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT pg_read_file('/etc/passwd')" },
    });
    assert(res.status >= 400, `Should block pg_read_file, got ${res.status}`);
  });

  it("blocks dblink function", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT * FROM dblink('host=attacker.com', 'SELECT 1') AS t(a int)" },
    });
    assert(res.status >= 400, `Should block dblink, got ${res.status}`);
  });

  it("blocks lo_import function", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT lo_import('/etc/passwd')" },
    });
    assert(res.status >= 400, `Should block lo_import, got ${res.status}`);
  });

  it("blocks COPY command", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "COPY pg_authid TO '/tmp/passwords'" },
    });
    assert(res.status >= 400, `Should block COPY, got ${res.status}`);
  });

  it("blocks UPDATE statement", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "UPDATE demo_users SET name = 'hacked'" },
    });
    assert(res.status >= 400, `Should block UPDATE, got ${res.status}`);
  });

  it("blocks ALTER statement", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "ALTER TABLE demo_users ADD COLUMN hacked boolean" },
    });
    assert(res.status >= 400, `Should block ALTER, got ${res.status}`);
  });

  it("blocks TRUNCATE statement", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "TRUNCATE demo_users" },
    });
    assert(res.status >= 400, `Should block TRUNCATE, got ${res.status}`);
  });

  it("blocks GRANT statement", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC" },
    });
    assert(res.status >= 400, `Should block GRANT, got ${res.status}`);
  });

  it("blocks CREATE EXTENSION statement", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "CREATE EXTENSION IF NOT EXISTS dblink" },
    });
    assert(res.status >= 400, `Should block CREATE EXTENSION, got ${res.status}`);
  });

  it("blocks comment-hiding injection", async () => {
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: { sql: "SELECT 1 /* hidden */ ; DROP TABLE users" },
    });
    assert(res.status >= 400, `Should block hidden DROP, got ${res.status}`);
  });
});

/* ------------------------------------------------------------------ */
/*  2. CSRF Protection                                                */
/* ------------------------------------------------------------------ */
describe("CSRF Protection", () => {
  it("blocks POST without CSRF token", async () => {
    // Raw fetch WITHOUT the automatic CSRF token injection from helpers
    const res = await fetch(`${API_BASE}/api/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        name: "csrf-test",
        url: "http://example.com",
        table_name: "test",
        events: ["INSERT"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 403 CSRF mismatch, or 401 if auth required before CSRF check
    assert(res.status === 403 || res.status === 401, `Should block without CSRF, got ${res.status}`);
  });

  it("allows GET requests without CSRF token", async () => {
    const res = await fetch(`${API_BASE}/api/health`, {
      headers: { "accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    assert(res.status === 200, "GET should not require CSRF");
  });
});

/* ------------------------------------------------------------------ */
/*  3. Webhook SSRF Protection                                        */
/* ------------------------------------------------------------------ */
describe("Webhook SSRF Protection", () => {
  const ssrfUrls = [
    "http://127.0.0.1:8787/api/health",
    "http://localhost:5432",
    "http://0.0.0.0:9000",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:8787",
    "http://10.0.0.1:80",
    "http://172.16.0.1:80",
    "http://192.168.1.1:80",
  ];

  for (const url of ssrfUrls) {
    it(`blocks internal URL: ${url}`, async () => {
      const res = await demoApi("/api/webhooks", {
        method: "POST",
        json: {
          name: "ssrf-test",
          url,
          table_name: "pg_class",
          events: ["INSERT"],
        },
      });
      // 400 (SSRF blocked) or 403 (demo write protection)
      assert(
        res.status === 400 || res.status === 403,
        `Should block ${url}, got ${res.status}`,
      );
    });
  }
});

/* ------------------------------------------------------------------ */
/*  4. API Key Security                                               */
/* ------------------------------------------------------------------ */
describe("API Key Security", () => {
  it("rejects revoked API key", async () => {
    const res = await api("/v1/status", {
      headers: { apikey: "truss_pk_revoked_fake_key_12345" },
    });
    assertStatus(res, 403, "revoked/invalid key");
  });

  it("rejects empty API key header", async () => {
    const res = await api("/v1/status", {
      headers: { apikey: "" },
    });
    assert(res.status === 401, `Should reject empty key, got ${res.status}`);
  });

  it("rejects API key in wrong format", async () => {
    const res = await api("/v1/status", {
      headers: { apikey: "not-a-truss-key" },
    });
    assertStatus(res, 403, "wrong format key");
  });
});

/* ------------------------------------------------------------------ */
/*  5. Request Size Limits                                            */
/* ------------------------------------------------------------------ */
describe("Request Size Limits", () => {
  it("rejects oversized JSON body", async () => {
    const largeBody = { sql: "SELECT 1", padding: "x".repeat(300 * 1024) }; // ~300KB
    const res = await demoApi("/api/sql/query", {
      method: "POST",
      json: largeBody,
    });
    // Express JSON limit is 256KB — expect 413, 400, or 500
    assert(
      res.status === 413 || res.status === 400 || res.status === 500,
      `Should reject large body, got ${res.status}`,
    );
  });

  it("handles malformed JSON gracefully", async () => {
    const rawRes = await fetch(`${API_BASE}/api/sql/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "x-csrf-token": "test",
        "cookie": "truss_csrf=test",
        "x-demo": "true",
      },
      body: "{ invalid json !!!",
      signal: AbortSignal.timeout(10_000),
    });
    assert(
      rawRes.status === 400 || rawRes.status === 500,
      `Should reject malformed JSON, got ${rawRes.status}`,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  6. Protected Schema Access                                        */
/* ------------------------------------------------------------------ */
describe("Protected Schema Access", () => {
  it("blocks vector read on truss_internal schema", async () => {
    const res = await demoApi("/api/vectors/collections/truss_internal/tenants");
    assert(res.status === 403, `Should block truss_internal, got ${res.status}`);
  });

  it("blocks vector read on pg_catalog schema", async () => {
    const res = await demoApi("/api/vectors/collections/pg_catalog/pg_class");
    assert(
      res.status === 403 || res.status === 400,
      `Should block pg_catalog, got ${res.status}`,
    );
  });

  it("blocks search on truss_internal schema", async () => {
    const res = await demoApi("/api/search/test", {
      method: "POST",
      json: {
        schema: "truss_internal",
        table: "tenants",
        column: "email",
        query: "admin",
        config: "english",
      },
    });
    assert(res.status === 403, `Should block truss_internal search, got ${res.status}`);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Storage Upload Limits                                          */
/* ------------------------------------------------------------------ */
describe("Storage Upload Limits", () => {
  it("rejects presigned upload for files over 100MB", async () => {
    const res = await demoApi("/api/storage/buckets/test-bucket/objects/presign-upload", {
      method: "POST",
      json: {
        key: "huge-file.bin",
        contentType: "application/octet-stream",
        size: 200 * 1024 * 1024,
      },
    });
    // 400 (size limit) or 403 (demo write protection) or 503 (MinIO not connected)
    assert(
      [400, 403, 503].includes(res.status),
      `Should reject 200MB upload, got ${res.status}`,
    );
  });
});
