#!/usr/bin/env node
/**
 * Cleanup test/junk data from the database.
 * Deletes: E2E test orgs, smoke-test projects, junk projects with generic names.
 * Usage: node scripts/cleanup-test-data.mjs [--dry-run]
 */
import pg from "pg";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const dryRun = process.argv.includes("--dry-run");
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const JUNK_ORG_PATTERNS = ["e2e-test%", "e2e-org%", "test-org%"];
const JUNK_PROJECT_PATTERNS = ["smoke-test%", "hack-%", "test-%"];
const JUNK_PROJECT_NAMES = ["hi", "test", "asd", "asdf"];

try {
  console.log(dryRun ? "=== DRY RUN ===" : "=== CLEANUP ===");

  // Find junk orgs
  const orgs = await pool.query(
    `SELECT id, name, slug FROM truss_internal.organizations
     WHERE slug LIKE ANY($1) OR name LIKE ANY($1)`,
    [JUNK_ORG_PATTERNS]
  );
  console.log(`\nJunk orgs found: ${orgs.rows.length}`);
  for (const org of orgs.rows) {
    console.log(`  - ${org.name} (${org.slug}) [${org.id}]`);
    if (!dryRun) {
      await pool.query(`DELETE FROM truss_internal.org_members WHERE org_id = $1`, [org.id]);
      await pool.query(`DELETE FROM truss_internal.organizations WHERE id = $1`, [org.id]);
    }
  }

  // Find junk projects
  const projects = await pool.query(
    `SELECT id, name, slug, status FROM truss_internal.projects
     WHERE (slug LIKE ANY($1) OR LOWER(name) = ANY($2))
       AND status != 'deleted'`,
    [JUNK_PROJECT_PATTERNS, JUNK_PROJECT_NAMES]
  );
  console.log(`\nJunk projects found: ${projects.rows.length}`);
  for (const proj of projects.rows) {
    console.log(`  - ${proj.name} (${proj.slug}) [${proj.id}]`);
    if (!dryRun) {
      await pool.query(`UPDATE truss_internal.projects SET status = 'deleted' WHERE id = $1`, [proj.id]);
      await pool.query(`UPDATE truss_internal.api_keys SET revoked = true WHERE project_id = $1`, [proj.id]);
    }
  }

  // Find orphaned environments (project deleted)
  const orphanEnvs = await pool.query(
    `SELECT e.id, e.name, e.project_id FROM truss_internal.environments e
     LEFT JOIN truss_internal.projects p ON e.project_id = p.id
     WHERE p.id IS NULL OR p.status = 'deleted'`
  );
  console.log(`\nOrphaned environments: ${orphanEnvs.rows.length}`);
  if (!dryRun && orphanEnvs.rows.length > 0) {
    await pool.query(
      `DELETE FROM truss_internal.environments WHERE id = ANY($1)`,
      [orphanEnvs.rows.map(e => e.id)]
    );
  }

  // Summary
  const remaining = await pool.query(
    `SELECT
       (SELECT count(*) FROM truss_internal.organizations) as orgs,
       (SELECT count(*) FROM truss_internal.projects WHERE status != 'deleted') as projects,
       (SELECT count(*) FROM truss_internal.environments WHERE status = 'active') as envs,
       (SELECT count(*) FROM truss_internal.branches WHERE status = 'active') as branches`
  );
  const s = remaining.rows[0];
  console.log(`\nRemaining: ${s.orgs} orgs, ${s.projects} projects, ${s.envs} environments, ${s.branches} branches`);

  if (dryRun) console.log("\nRe-run without --dry-run to actually delete.");
  else console.log("\nDone.");
} finally {
  await pool.end();
}
