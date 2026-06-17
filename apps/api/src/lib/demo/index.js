/**
 * Demo Seed Orchestrator — coordinates schema creation, data insertion,
 * truss_internal seeding, and external service seeding.
 *
 * Called on startup when TRUSS_DEMO_MODE=true.
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING and CREATE TABLE IF NOT EXISTS.
 */

import { createDemoSchema } from "./schema.js";
import { insertDemoData } from "./data.js";
import { seedTrussInternal } from "./truss-internal.js";
import { seedExternalServices } from "./external.js";

const API_BASE_URL = process.env.API_URL || process.env.VITE_API_BASE_URL || `http://localhost:${process.env.API_PORT || 8787}`;

// Track whether demo seed has run in this process
let _demoSeeded = false;
export function isDemoSeeded() { return _demoSeeded; }

/** Lazy seed: run once per process when first demo user hits the API */
export async function ensureDemoSeeded(pool) {
  if (_demoSeeded || !pool) return;
  _demoSeeded = true;
  try {
    await seedDemoData(pool);
  } catch (err) {
    _demoSeeded = false;
    throw err;
  }
}

export async function seedDemoData(pool) {
  if (!pool) return;
  const t0 = Date.now();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── 0a. Clean sweep: drop old demo tables + truss_internal demo data ──
    // Always start fresh so schema/data changes take effect on redeploy.
    const demoTables = [
      "demo_sessions", "demo_notifications", "demo_wishlists", "demo_order_coupons",
      "demo_order_items", "demo_coupons", "demo_reviews", "demo_orders",
      "demo_addresses", "demo_product_images", "demo_product_categories",
      "demo_products", "demo_categories", "demo_users",
    ];
    for (const t of demoTables) {
      await client.query(`DROP TABLE IF EXISTS public.${t} CASCADE`);
    }
    await client.query(`DELETE FROM truss_internal.saved_queries WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.webhooks WHERE id LIKE 'demo-%'`);
    await client.query(`DELETE FROM truss_internal.webhook_logs WHERE webhook_id LIKE 'demo-%'`);
    await client.query(`DELETE FROM truss_internal.audit_logs WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.branches WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.backups WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.realtime_subscriptions WHERE id LIKE 'demo-%'`);
    await client.query(`DELETE FROM truss_internal.api_keys WHERE id LIKE 'demo-%'`);
    await client.query(`DELETE FROM truss_internal.billing_config WHERE tenant_id = 'demo'`);
    // Feature flags cleanup (tables may not exist yet — ignore errors)
    try { await client.query(`DELETE FROM truss_internal.flag_evaluation_log WHERE tenant_id = 'demo'`); } catch {}
    try { await client.query(`DELETE FROM truss_internal.flag_environments WHERE tenant_id = 'demo'`); } catch {}
    try { await client.query(`DELETE FROM truss_internal.flag_segments WHERE tenant_id = 'demo'`); } catch {}
    try { await client.query(`DELETE FROM truss_internal.feature_flags WHERE tenant_id = 'demo'`); } catch {}

    // ── 0b. Ensure demo tenant + project exist ──
    await client.query(`
      INSERT INTO truss_internal.tenants (id, identity_id, email, display_name, plan, is_admin)
      VALUES ('demo', 'demo', 'demo@truss.dev', 'Demo User', 'starter', false)
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO truss_internal.organizations (name, slug, owner_tenant_id)
      VALUES ('Demo Workspace', 'demo-workspace', 'demo')
      ON CONFLICT (slug) DO NOTHING
    `);
    const demoOrgResult = await client.query(`SELECT id FROM truss_internal.organizations WHERE slug = 'demo-workspace'`);
    const demoOrgId = demoOrgResult.rows[0]?.id || null;
    if (demoOrgId) {
      await client.query(`INSERT INTO truss_internal.org_members (org_id, tenant_id, role, joined_at) VALUES ($1, 'demo', 'owner', now()) ON CONFLICT DO NOTHING`, [demoOrgId]);
    }
    await client.query(`
      INSERT INTO truss_internal.projects (name, slug, region, schema_name, bucket_name, anon_key, service_role_key, api_url, status, tenant_id, org_id)
      VALUES ('Demo Project', 'demo', 'local', 'public', 'demo', 'demo-anon', 'demo-service', $1, 'active', 'demo', $2)
      ON CONFLICT (slug) DO NOTHING
    `, [`${API_BASE_URL}/v1/projects/demo`, demoOrgId]);

    // ── 0c. Create demo environments for the demo project ──
    const demoProjectResult = await client.query(`SELECT id FROM truss_internal.projects WHERE slug = 'demo' AND tenant_id = 'demo'`);
    const demoProjectId = demoProjectResult.rows[0]?.id || null;
    if (demoProjectId) {
      try { await client.query(`DELETE FROM truss_internal.environments WHERE tenant_id = 'demo'`); } catch {}
      await client.query(`
        INSERT INTO truss_internal.environments (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
        VALUES ($1, 'Production', 'production', 'sampledb', 'public', 'demo', true, 'demo'),
               ($1, 'Staging', 'staging', 'sampledb', 'public_staging', 'demo-staging', false, 'demo'),
               ($1, 'Preview', 'preview', 'sampledb', 'public_preview', 'demo-preview', false, 'demo')
        ON CONFLICT DO NOTHING
      `, [demoProjectId]);
    }

    // ── 1. Create schema (14 tables + indexes) ──
    const { hasVector } = await createDemoSchema(client);

    // ── 2. Insert sample data ──
    await insertDemoData(client, hasVector);

    // ── 3. Seed truss_internal tables ──
    await seedTrussInternal(client);

    await client.query("COMMIT");
    console.log(`Demo seed (DB) completed in ${Date.now() - t0}ms`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Demo seed failed:", err.message);
    throw err;
  } finally {
    client.release();
  }

  // ── 4. External services (outside transaction) ──
  await seedExternalServices(pool);

  console.log(`Demo seed fully completed in ${Date.now() - t0}ms`);
}
