/**
 * Fresh-DB bootstrap test. Guards the regression where ensureInternalSchema()
 * built an index on projects(tenant_id) before that column existed, so the whole
 * multi-statement bootstrap rolled back and truss_internal ended up empty.
 *
 * Connects directly to the test Postgres (exposed by docker-compose.test.yml on 5433)
 * and asserts the expected tables exist. Skips if TEST_DB_URL is not set.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DB_URL = process.env.TEST_DB_URL;
const REQUIRED = [
  "tenants", "projects", "organizations", "environments",
  "saved_queries", "audit_logs", "api_keys", "webhooks",
  "branches", "backups", "realtime_subscriptions", "billing_config",
];

describe("Fresh-DB bootstrap (truss_internal)", { skip: !TEST_DB_URL ? "set TEST_DB_URL to run" : false }, () => {
  let client;

  before(async () => {
    client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
  });

  after(async () => { await client?.end().catch(() => {}); });

  it("all expected truss_internal tables exist after bootstrap", async () => {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'truss_internal'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    const missing = REQUIRED.filter((t) => !present.has(t));
    assert.equal(missing.length, 0, `missing tables: ${missing.join(", ")} (present: ${[...present].sort().join(", ")})`);
  });

  it("projects.tenant_id column exists (the column the bad index referenced)", async () => {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='truss_internal' AND table_name='projects' AND column_name='tenant_id'`,
    );
    assert.equal(rows.length, 1, "projects.tenant_id must exist");
  });
});
