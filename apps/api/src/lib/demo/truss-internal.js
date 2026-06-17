/**
 * Demo Truss-Internal Seeding — saved queries, webhooks, audit logs, branches, backups, billing config.
 * All inserts use tenant_id = 'demo' and are wrapped in SAVEPOINTs for resilience.
 */

const AUDIT_ACTIONS = [
  { action: "table.created", resource_type: "table", resource_id: "public.demo_users" },
  { action: "table.created", resource_type: "table", resource_id: "public.demo_products" },
  { action: "table.created", resource_type: "table", resource_id: "public.demo_orders" },
  { action: "table.created", resource_type: "table", resource_id: "public.demo_reviews" },
  { action: "table.created", resource_type: "table", resource_id: "public.demo_categories" },
  { action: "table.created", resource_type: "table", resource_id: "public.demo_wishlists" },
  { action: "extension.enabled", resource_type: "extension", resource_id: "vector" },
  { action: "index.created", resource_type: "index", resource_id: "idx_demo_reviews_fts" },
  { action: "index.created", resource_type: "index", resource_id: "idx_demo_products_embedding" },
  { action: "api_key.created", resource_type: "api_key", resource_id: "demo-anon-key" },
  { action: "api_key.created", resource_type: "api_key", resource_id: "demo-service-key" },
  { action: "webhook.created", resource_type: "webhook", resource_id: "order-created-hook" },
  { action: "webhook.created", resource_type: "webhook", resource_id: "review-created-hook" },
  { action: "webhook.created", resource_type: "webhook", resource_id: "user-updated-hook" },
  { action: "subscription.created", resource_type: "realtime", resource_id: "demo_orders" },
  { action: "subscription.created", resource_type: "realtime", resource_id: "demo_reviews" },
  { action: "query.executed", resource_type: "sql", resource_id: "revenue-by-category" },
  { action: "query.executed", resource_type: "sql", resource_id: "top-reviewers" },
  { action: "backup.created", resource_type: "backup", resource_id: "daily-backup-001" },
  { action: "branch.created", resource_type: "branch", resource_id: "feature/new-catalog" },
];

const EXTENDED_AUDITS = [
  { action: "hydra.client.create", resource_type: "oauth2_client", resource_id: "demo-web-app", payload: { client_name: "Demo Web App", grant_types: ["authorization_code", "refresh_token"] } },
  { action: "hydra.client.create", resource_type: "oauth2_client", resource_id: "demo-cli-tool", payload: { client_name: "Demo CLI Tool", grant_types: ["client_credentials"] } },
  { action: "hydra.client.create", resource_type: "oauth2_client", resource_id: "demo-mobile-app", payload: { client_name: "Demo Mobile App", grant_types: ["authorization_code", "refresh_token"] } },
  { action: "hydra.client.secret_rotated", resource_type: "oauth2_client", resource_id: "demo-web-app", payload: {} },
  { action: "keto.tuple.create", resource_type: "relation_tuple", resource_id: "Project:acme-app#owner", payload: { subject_id: "alice-demo" } },
  { action: "keto.tuple.create", resource_type: "relation_tuple", resource_id: "Document:design-spec#editor", payload: { subject_id: "bob-demo" } },
  { action: "keto.permission.check", resource_type: "permission_check", resource_id: "Project:acme-app#viewer", payload: { subject_id: "carol-demo", allowed: true } },
  { action: "keto.permission.check", resource_type: "permission_check", resource_id: "Document:roadmap#editor", payload: { subject_id: "dave-demo", allowed: false } },
  { action: "oathkeeper.rule.upsert", resource_type: "gateway_rule", resource_id: "api-public-access", payload: { match: { url: "<https://api.example.com/public/<**>>", methods: ["GET"] } } },
  { action: "oathkeeper.rule.upsert", resource_type: "gateway_rule", resource_id: "api-authenticated", payload: { match: { url: "<https://api.example.com/v1/<**>>", methods: ["GET", "POST", "PUT", "DELETE"] } } },
  { action: "oathkeeper.rule.delete", resource_type: "gateway_rule", resource_id: "legacy-redirect", payload: {} },
  { action: "storage.bucket.created", resource_type: "storage", resource_id: "user-uploads", payload: { region: "us-east-1" } },
  { action: "storage.object.uploaded", resource_type: "storage", resource_id: "user-uploads/avatar-alice.png", payload: { size_bytes: 24576, content_type: "image/png" } },
  { action: "storage.object.uploaded", resource_type: "storage", resource_id: "user-uploads/report-q1.pdf", payload: { size_bytes: 1048576, content_type: "application/pdf" } },
  { action: "storage.object.deleted", resource_type: "storage", resource_id: "user-uploads/temp-export.csv", payload: {} },
  { action: "auth.identity.created", resource_type: "identity", resource_id: "alice-demo", payload: { email: "alice@demo.truss.dev", schema_id: "default" } },
  { action: "auth.identity.created", resource_type: "identity", resource_id: "bob-demo", payload: { email: "bob@demo.truss.dev", schema_id: "default" } },
  { action: "auth.session.created", resource_type: "session", resource_id: "sess_demo_001", payload: { identity_id: "alice-demo", method: "password" } },
  { action: "auth.webhook.fired", resource_type: "auth_webhook", resource_id: "demo-auth-wh-login", payload: { event: "login", status: 200 } },
  { action: "auth.webhook.fired", resource_type: "auth_webhook", resource_id: "demo-auth-wh-registration", payload: { event: "registration", status: 200 } },
];

export async function seedTrussInternal(client) {
  // ── Saved queries ──
  const savedQueries = [
    { id: "demo-revenue-by-category", name: "Revenue by category", sql: `SELECT p.category,\n       COUNT(DISTINCT o.id) AS orders,\n       SUM(o.total) AS revenue\nFROM demo_orders o\nJOIN demo_products p ON p.id = o.product_id\nWHERE o.status != 'cancelled'\nGROUP BY p.category\nORDER BY revenue DESC;` },
    { id: "demo-top-reviewers", name: "Top reviewers", sql: `SELECT u.name, u.email,\n       COUNT(r.id) AS review_count,\n       ROUND(AVG(r.rating), 1) AS avg_rating\nFROM demo_users u\nJOIN demo_reviews r ON r.user_id = u.id\nGROUP BY u.id, u.name, u.email\nORDER BY review_count DESC\nLIMIT 10;` },
    { id: "demo-product-search", name: "Product search", sql: `SELECT r.id, p.name AS product,\n       ts_headline('english', r.body, q) AS excerpt,\n       ts_rank(r.ts_vector, q) AS rank\nFROM demo_reviews r\nJOIN demo_products p ON p.id = r.product_id,\n     to_tsquery('english', 'quality & design') q\nWHERE r.ts_vector @@ q\nORDER BY rank DESC;` },
    { id: "demo-similar-products", name: "Similar products", sql: `-- Find products most similar to "Wireless Keyboard" (id=1)\nSELECT p2.name, p2.category, p2.price,\n       1 - (p1.embedding <=> p2.embedding) AS similarity\nFROM demo_products p1, demo_products p2\nWHERE p1.id = 1 AND p2.id != 1\nORDER BY p1.embedding <=> p2.embedding\nLIMIT 5;` },
    { id: "demo-order-trends", name: "Order trends", sql: `SELECT DATE_TRUNC('week', o.created_at) AS week,\n       COUNT(*) AS order_count,\n       SUM(o.total) AS weekly_revenue,\n       ROUND(AVG(o.total), 2) AS avg_order_value\nFROM demo_orders o\nWHERE o.status != 'cancelled'\nGROUP BY week\nORDER BY week DESC;` },
    { id: "demo-category-tree", name: "Category tree", sql: `WITH RECURSIVE cat_tree AS (\n  SELECT id, name, slug, parent_id, 0 AS depth, name::text AS path\n  FROM demo_categories WHERE parent_id IS NULL\n  UNION ALL\n  SELECT c.id, c.name, c.slug, c.parent_id, ct.depth + 1,\n         ct.path || ' > ' || c.name\n  FROM demo_categories c\n  JOIN cat_tree ct ON ct.id = c.parent_id\n)\nSELECT * FROM cat_tree ORDER BY path;` },
    { id: "demo-coupon-usage", name: "Coupon usage report", sql: `SELECT c.code, c.discount_pct,\n       COUNT(oc.order_id) AS times_used,\n       c.max_uses, c.used_count,\n       ROUND(SUM(o.total), 2) AS total_order_value\nFROM demo_coupons c\nLEFT JOIN demo_order_coupons oc ON oc.coupon_id = c.id\nLEFT JOIN demo_orders o ON o.id = oc.order_id\nGROUP BY c.id\nORDER BY times_used DESC;` },
  ];
  for (const sq of savedQueries) {
    await client.query(
      `INSERT INTO truss_internal.saved_queries (id, name, sql_text, schema_name, tags, tenant_id)
       VALUES ($1, $2, $3, 'public', '{demo}', 'demo') ON CONFLICT (id) DO NOTHING`,
      [sq.id, sq.name, sq.sql]
    );
  }

  // ── Webhooks + logs ──
  const webhooks = [
    { id: "demo-wh-order-created", name: "Order Created", table_name: "demo_orders", events: ["INSERT"], url: "https://hooks.example.com/orders" },
    { id: "demo-wh-review-created", name: "Review Created", table_name: "demo_reviews", events: ["INSERT"], url: "https://hooks.example.com/reviews" },
    { id: "demo-wh-user-updated", name: "User Updated", table_name: "demo_users", events: ["UPDATE"], url: "https://hooks.example.com/users" },
  ];
  for (const wh of webhooks) {
    await client.query(
      `INSERT INTO truss_internal.webhooks (id, name, table_schema, table_name, events, url, headers, secret, active, tenant_id)
       VALUES ($1, $2, 'public', $3, $4, $5, '{"Content-Type":"application/json"}'::jsonb, 'demo-secret', true, 'demo')
       ON CONFLICT (id) DO NOTHING`,
      [wh.id, wh.name, wh.table_name, wh.events, wh.url]
    );
  }
  const whLogStatuses = [200, 200, 200, 500, 200, 200];
  for (let i = 0; i < webhooks.length; i++) {
    for (let j = 0; j < 2; j++) {
      const status = whLogStatuses[i * 2 + j];
      const latency = 50 + Math.floor((i * 30 + j * 80) % 400);
      await client.query(
        `INSERT INTO truss_internal.webhook_logs (webhook_id, event_type, payload, status_code, response_body, latency_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [webhooks[i].id, webhooks[i].events[0], JSON.stringify({ table: webhooks[i].table_name, record: { id: j + 1 } }), status, status === 200 ? '{"ok":true}' : '{"error":"Internal Server Error"}', latency, new Date(Date.now() - (5 - j) * 3600000).toISOString()]
      );
    }
  }

  // ── Realtime subscriptions ──
  await client.query(`INSERT INTO truss_internal.realtime_subscriptions (id, schema_name, table_name, active, tenant_id) VALUES ('demo-rt-orders', 'public', 'demo_orders', true, 'demo') ON CONFLICT (schema_name, table_name, tenant_id) WHERE tenant_id IS NOT NULL DO UPDATE SET active = true`);
  await client.query(`INSERT INTO truss_internal.realtime_subscriptions (id, schema_name, table_name, active, tenant_id) VALUES ('demo-rt-reviews', 'public', 'demo_reviews', true, 'demo') ON CONFLICT (schema_name, table_name, tenant_id) WHERE tenant_id IS NOT NULL DO UPDATE SET active = true`);

  // ── API keys ──
  await client.query(`INSERT INTO truss_internal.api_keys (id, key_type, key_prefix, key_hash, label, revoked, tenant_id) VALUES ('demo-anon-key', 'anon', 'trss_anon_demo', 'demo_hash_not_functional', 'Demo Anon Key', false, 'demo') ON CONFLICT (id) DO NOTHING`);
  await client.query(`INSERT INTO truss_internal.api_keys (id, key_type, key_prefix, key_hash, label, revoked, tenant_id) VALUES ('demo-service-key', 'service_role', 'trss_svc_demo', 'demo_hash_not_functional', 'Demo Service Role Key', false, 'demo') ON CONFLICT (id) DO NOTHING`);

  // ── Audit logs (20 + 20 extended) ──
  for (let i = 0; i < AUDIT_ACTIONS.length; i++) {
    const a = AUDIT_ACTIONS[i];
    await client.query(
      `INSERT INTO truss_internal.audit_logs (actor, action, resource_type, resource_id, payload, created_at, tenant_id) VALUES ('demo@truss.dev', $1, $2, $3, '{}'::jsonb, $4, 'demo')`,
      [a.action, a.resource_type, a.resource_id, new Date(Date.now() - (48 - i * 2) * 3600000).toISOString()]
    );
  }

  try {
    await client.query("SAVEPOINT extended_audit");
    for (let i = 0; i < EXTENDED_AUDITS.length; i++) {
      const a = EXTENDED_AUDITS[i];
      await client.query(
        `INSERT INTO truss_internal.audit_logs (actor, action, resource_type, resource_id, payload, created_at, tenant_id) VALUES ('demo@truss.dev', $1, $2, $3, $4::jsonb, $5, 'demo')`,
        [a.action, a.resource_type, a.resource_id, JSON.stringify(a.payload), new Date(Date.now() - (40 - i * 2) * 3600000).toISOString()]
      );
    }
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT extended_audit");
    console.warn("Demo seed: extended audit logs failed:", err.message);
  }

  // ── Auth webhooks ──
  try {
    await client.query("SAVEPOINT auth_webhooks");
    const authWebhooks = [
      { id: "demo-auth-wh-login", event: "login", url: "https://httpbin.org/post", secret: "whsec_demo_login_example", enabled: true, description: "Fires on every successful login. Posts session metadata to analytics pipeline." },
      { id: "demo-auth-wh-registration", event: "registration", url: "https://httpbin.org/post", secret: "whsec_demo_registration_example", enabled: true, description: "Fires on new user registration. Triggers welcome email and CRM sync." },
      { id: "demo-auth-wh-recovery", event: "recovery", url: "https://httpbin.org/post", secret: "whsec_demo_recovery_example", enabled: false, description: "Fires on password recovery initiation. Logs to security audit trail." },
    ];
    await client.query(`INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ('auth_webhooks_demo', $1, 'demo') ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL DO NOTHING`, [JSON.stringify(authWebhooks)]);
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT auth_webhooks"); console.warn("Demo seed: auth webhooks failed:", err.message); }

  // ── Email templates ──
  try {
    await client.query("SAVEPOINT email_templates");
    const emailTemplates = {
      verification: { subject: "Verify your email — Acme Inc.", body: "Hi {{ .Identity.traits.name }},\n\nPlease verify your email by clicking the link below:\n\n{{ .VerificationURL }}\n\nThis link expires in 24 hours.\n\nThanks,\nThe Acme Team", enabled: true },
      recovery: { subject: "Reset your password — Acme Inc.", body: "Hi {{ .Identity.traits.name }},\n\nYou requested a password reset. Click the link below to set a new password:\n\n{{ .RecoveryURL }}\n\nIf you didn't request this, you can safely ignore this email.\n\nThanks,\nThe Acme Team", enabled: true },
      welcome: { subject: "Welcome to Acme Inc.!", body: "Hi {{ .Identity.traits.name }},\n\nWelcome aboard! Your account has been created successfully.\n\nHere are some quick links to get started:\n- Dashboard: https://app.example.com\n- Documentation: https://docs.example.com\n- Support: support@example.com\n\nHappy building!\nThe Acme Team", enabled: true },
    };
    await client.query(`INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ('email_templates_demo', $1, 'demo') ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL DO NOTHING`, [JSON.stringify(emailTemplates)]);
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT email_templates"); console.warn("Demo seed: email templates failed:", err.message); }

  // ── Billing / Usage ──
  try {
    await client.query("SAVEPOINT billing_data");
    await client.query(`INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ('billing_plan_demo', $1, 'demo') ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL DO NOTHING`, [JSON.stringify({ plan: "pro", started_at: new Date(Date.now() - 45 * 86400000).toISOString(), trial_ends_at: null, status: "active" })]);
    const usageEntries = [];
    for (let i = 29; i >= 0; i--) {
      usageEntries.push({ date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), queries: 120 + Math.floor(Math.sin(i * 0.5) * 60 + Math.random() * 40), bandwidth_mb: +(1.2 + Math.random() * 3.5).toFixed(2), storage_mb: +(45 + i * 0.3).toFixed(1), active_connections: 3 + (i % 5) });
    }
    await client.query(`INSERT INTO truss_internal.billing_config (key, value, tenant_id) VALUES ('usage_history_demo', $1, 'demo') ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL DO NOTHING`, [JSON.stringify(usageEntries)]);
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT billing_data"); console.warn("Demo seed: billing data failed:", err.message); }

  // ── Branches ──
  try {
    await client.query("SAVEPOINT branches");
    const branches = [
      { id: "demo-branch-feat-catalog", parent_db: "truss", branch_db: "truss_br_feat_catalog", label: "feature/new-catalog", status: "active", ttl_hours: 72, daysAgo: 5 },
      { id: "demo-branch-fix-perf", parent_db: "truss", branch_db: "truss_br_fix_perf", label: "fix/query-performance", status: "active", ttl_hours: 48, daysAgo: 3 },
      { id: "demo-branch-test-migration", parent_db: "truss", branch_db: "truss_br_test_mig", label: "test/migration-v2", status: "deleted", ttl_hours: 24, daysAgo: 10 },
      { id: "demo-branch-staging", parent_db: "truss", branch_db: "truss_br_staging", label: "staging", status: "active", ttl_hours: 0, daysAgo: 14 },
    ];
    // Look up demo project ID to link branches
    const projRes = await client.query(`SELECT id FROM truss_internal.projects WHERE slug = 'demo' AND tenant_id = 'demo'`);
    const demoProjId = projRes.rows[0]?.id || null;
    for (const b of branches) {
      await client.query(`INSERT INTO truss_internal.branches (id, parent_db, branch_db, label, status, ttl_hours, created_at, tenant_id, project_id) VALUES ($1, $2, $3, $4, $5, $6, $7, 'demo', $8) ON CONFLICT (id) DO NOTHING`, [b.id, b.parent_db, b.branch_db, b.label, b.status, b.ttl_hours, new Date(Date.now() - b.daysAgo * 86400000).toISOString(), demoProjId]);
    }
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT branches"); console.warn("Demo seed: branches failed:", err.message); }

  // ── Backups ──
  try {
    await client.query("SAVEPOINT backups");
    const backups = [
      { id: "demo-backup-daily-001", filename: "truss_daily_20260314_030000.sql.gz", size_bytes: 2457600, status: "completed", daysAgo: 1, durationMin: 3 },
      { id: "demo-backup-daily-002", filename: "truss_daily_20260313_030000.sql.gz", size_bytes: 2412544, status: "completed", daysAgo: 2, durationMin: 3 },
      { id: "demo-backup-daily-003", filename: "truss_daily_20260312_030000.sql.gz", size_bytes: 2389504, status: "completed", daysAgo: 3, durationMin: 2 },
      { id: "demo-backup-weekly-001", filename: "truss_weekly_20260310_060000.sql.gz", size_bytes: 2389504, status: "completed", daysAgo: 5, durationMin: 4 },
      { id: "demo-backup-running", filename: "truss_daily_20260315_030000.sql.gz", size_bytes: 0, status: "running", daysAgo: 0, durationMin: 0 },
      { id: "demo-backup-failed", filename: "truss_daily_20260311_030000.sql.gz", size_bytes: 0, status: "failed", daysAgo: 4, durationMin: 0 },
    ];
    for (const bk of backups) {
      const completedAt = bk.status === "completed" ? new Date(Date.now() - bk.daysAgo * 86400000 + bk.durationMin * 60000).toISOString() : null;
      await client.query(`INSERT INTO truss_internal.backups (id, filename, size_bytes, status, created_at, completed_at, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, 'demo') ON CONFLICT (id) DO NOTHING`, [bk.id, bk.filename, bk.size_bytes, bk.status, new Date(Date.now() - bk.daysAgo * 86400000).toISOString(), completedAt]);
    }
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT backups"); console.warn("Demo seed: backups failed:", err.message); }

  // ── Feature Flags ──
  try {
    await client.query("SAVEPOINT feature_flags");
    // Ensure tables exist
    await client.query(`CREATE SCHEMA IF NOT EXISTS truss_internal`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS truss_internal.feature_flags (
        id bigserial PRIMARY KEY, flag_key text NOT NULL, name text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
        flag_type text NOT NULL DEFAULT 'boolean', variants jsonb NOT NULL DEFAULT '{"on": true, "off": false}'::jsonb,
        default_variant text NOT NULL DEFAULT 'off', targeting jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        tags text[] NOT NULL DEFAULT '{}', state text NOT NULL DEFAULT 'DISABLED', tenant_id text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (flag_key, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS truss_internal.flag_environments (
        id bigserial PRIMARY KEY, flag_key text NOT NULL, environment text NOT NULL DEFAULT 'development',
        state text NOT NULL DEFAULT 'DISABLED', targeting jsonb NOT NULL DEFAULT '[]'::jsonb, rollout_pct real NOT NULL DEFAULT 100,
        tenant_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (flag_key, environment, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS truss_internal.flag_segments (
        id bigserial PRIMARY KEY, segment_key text NOT NULL, name text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
        rules jsonb NOT NULL DEFAULT '[]'::jsonb, tenant_id text, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (segment_key, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS truss_internal.flag_evaluation_log (
        id bigserial PRIMARY KEY, flag_key text NOT NULL, variant text, reason text,
        context jsonb NOT NULL DEFAULT '{}'::jsonb, tenant_id text, created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Clean old demo flags
    await client.query(`DELETE FROM truss_internal.flag_evaluation_log WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.flag_environments WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.flag_segments WHERE tenant_id = 'demo'`);
    await client.query(`DELETE FROM truss_internal.feature_flags WHERE tenant_id = 'demo'`);

    // --- Flags ---
    const flags = [
      {
        key: "dark-mode-v2", name: "Dark Mode v2", desc: "Redesigned dark mode with improved contrast and AMOLED support",
        type: "boolean", variants: { on: true, off: false }, defaultVariant: "off", state: "ENABLED",
        targeting: { if: [{ ends_with: [{ var: "email" }, "@acme.com"] }, "on", null] },
        metadata: { owner: "frontend-team", ticket: "ACME-1234" }, tags: ["ui", "experiment"], daysAgo: 12,
      },
      {
        key: "pricing-experiment", name: "Pricing Page Experiment", desc: "A/B/C test for new pricing page layout",
        type: "string", variants: { control: "original", "variant-a": "simplified", "variant-b": "comparison" },
        defaultVariant: "control", state: "ENABLED",
        targeting: { fractional: [{ cat: [{ var: "$flagd.flagKey" }, { var: "targetingKey" }] }, ["control", 50], ["variant-a", 25], ["variant-b", 25]] },
        metadata: { owner: "growth-team", hypothesis: "Simplified layout increases conversions by 15%" }, tags: ["experiment", "pricing"], daysAgo: 5,
      },
      {
        key: "new-checkout-flow", name: "New Checkout Flow", desc: "Streamlined 2-step checkout replacing the old 4-step wizard",
        type: "boolean", variants: { on: true, off: false }, defaultVariant: "off", state: "ENABLED",
        targeting: { if: [{ ">=": [{ var: "plan" }, "pro"] }, "on", null] },
        metadata: { owner: "payments-team", ticket: "PAY-892" }, tags: ["release", "payments"], daysAgo: 3,
      },
      {
        key: "ai-search-beta", name: "AI-Powered Search", desc: "Semantic search using embeddings — rolling out to 20% of users",
        type: "boolean", variants: { on: true, off: false }, defaultVariant: "off", state: "ENABLED",
        targeting: { fractional: [{ cat: [{ var: "$flagd.flagKey" }, { var: "targetingKey" }] }, ["on", 20], ["off", 80]] },
        metadata: { owner: "search-team", model: "text-embedding-3-small" }, tags: ["ai", "beta", "search"], daysAgo: 2,
      },
      {
        key: "maintenance-banner", name: "Maintenance Banner", desc: "Show a scheduled maintenance banner across the app",
        type: "string", variants: { hidden: "", visible: "Scheduled maintenance: March 25, 2am–4am UTC" },
        defaultVariant: "hidden", state: "DISABLED",
        targeting: [],
        metadata: { owner: "platform-team" }, tags: ["ops"], daysAgo: 8,
      },
      {
        key: "max-upload-size", name: "Max Upload Size", desc: "Dynamic max file upload size in MB, varies by plan",
        type: "number", variants: { small: 10, medium: 50, large: 200 }, defaultVariant: "small", state: "ENABLED",
        targeting: { if: [{ "==": [{ var: "plan" }, "business"] }, "large", { if: [{ "==": [{ var: "plan" }, "pro"] }, "medium", null] }] },
        metadata: { owner: "storage-team", unit: "MB" }, tags: ["limits", "storage"], daysAgo: 15,
      },
      {
        key: "onboarding-checklist", name: "Onboarding Checklist", desc: "Show guided onboarding checklist for new users (< 7 days old)",
        type: "boolean", variants: { on: true, off: false }, defaultVariant: "off", state: "ENABLED",
        targeting: { if: [{ "<": [{ var: "account_age_days" }, 7] }, "on", null] },
        metadata: { owner: "growth-team" }, tags: ["onboarding", "ux"], daysAgo: 20,
      },
      {
        key: "api-v2-endpoints", name: "API v2 Endpoints", desc: "Enable new v2 REST API endpoints with improved pagination and filtering",
        type: "boolean", variants: { on: true, off: false }, defaultVariant: "off", state: "DISABLED",
        targeting: [],
        metadata: { owner: "api-team", breaking: "true", migration_guide: "https://docs.example.com/v2-migration" }, tags: ["api", "release"], daysAgo: 1,
      },
    ];
    for (const f of flags) {
      await client.query(
        `INSERT INTO truss_internal.feature_flags (flag_key, name, description, flag_type, variants, default_variant, state, targeting, metadata, tags, tenant_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'demo', $11, $11)
         ON CONFLICT (flag_key, tenant_id) DO NOTHING`,
        [f.key, f.name, f.desc, f.type, JSON.stringify(f.variants), f.defaultVariant, f.state, JSON.stringify(f.targeting), JSON.stringify(f.metadata), f.tags, new Date(Date.now() - f.daysAgo * 86400000).toISOString()]
      );
      // Create environment entries for each flag
      for (const env of ["development", "staging", "production"]) {
        const envState = env === "production" ? f.state : (env === "staging" && f.state === "ENABLED" ? "ENABLED" : "DISABLED");
        await client.query(
          `INSERT INTO truss_internal.flag_environments (flag_key, environment, state, targeting, rollout_pct, tenant_id)
           VALUES ($1, $2, $3, $4, 100, 'demo') ON CONFLICT (flag_key, environment, tenant_id) DO NOTHING`,
          [f.key, env, envState, JSON.stringify(env === "production" ? f.targeting : [])]
        );
      }
    }

    // --- Segments ---
    const segments = [
      { key: "beta-users", name: "Beta Users", desc: "Internal team and opted-in beta testers", rules: { or: [{ ends_with: [{ var: "email" }, "@acme.com"] }, { in: [{ var: "email" }, ["beta1@test.com", "beta2@test.com", "beta3@test.com"]] }] } },
      { key: "enterprise-customers", name: "Enterprise Customers", desc: "Users on Business or Team plans", rules: { in: [{ var: "plan" }, ["business", "team"]] } },
      { key: "mobile-users", name: "Mobile Users", desc: "Requests from mobile SDKs", rules: { or: [{ "==": [{ var: "platform" }, "ios"] }, { "==": [{ var: "platform" }, "android"] }] } },
    ];
    for (const seg of segments) {
      await client.query(
        `INSERT INTO truss_internal.flag_segments (segment_key, name, description, rules, tenant_id)
         VALUES ($1, $2, $3, $4, 'demo') ON CONFLICT (segment_key, tenant_id) DO NOTHING`,
        [seg.key, seg.name, seg.desc, JSON.stringify(seg.rules)]
      );
    }

    // --- Evaluation log (recent evaluations) ---
    const evalLogs = [
      { key: "dark-mode-v2", variant: "on", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-42", email: "alice@acme.com", plan: "pro" } },
      { key: "dark-mode-v2", variant: "off", reason: "DEFAULT", ctx: { targetingKey: "user-99", email: "bob@gmail.com", plan: "starter" } },
      { key: "pricing-experiment", variant: "variant-a", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-42", email: "alice@acme.com" } },
      { key: "pricing-experiment", variant: "control", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-55", email: "charlie@test.com" } },
      { key: "pricing-experiment", variant: "variant-b", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-78", email: "dave@example.com" } },
      { key: "new-checkout-flow", variant: "on", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-42", plan: "pro" } },
      { key: "new-checkout-flow", variant: "off", reason: "DEFAULT", ctx: { targetingKey: "user-11", plan: "starter" } },
      { key: "ai-search-beta", variant: "on", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-42" } },
      { key: "ai-search-beta", variant: "off", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-15" } },
      { key: "ai-search-beta", variant: "off", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-88" } },
      { key: "max-upload-size", variant: "large", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-42", plan: "business" } },
      { key: "max-upload-size", variant: "medium", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-55", plan: "pro" } },
      { key: "max-upload-size", variant: "small", reason: "DEFAULT", ctx: { targetingKey: "user-11", plan: "starter" } },
      { key: "onboarding-checklist", variant: "on", reason: "TARGETING_MATCH", ctx: { targetingKey: "user-101", account_age_days: 2 } },
      { key: "onboarding-checklist", variant: "off", reason: "DEFAULT", ctx: { targetingKey: "user-42", account_age_days: 90 } },
    ];
    for (let i = 0; i < evalLogs.length; i++) {
      const e = evalLogs[i];
      await client.query(
        `INSERT INTO truss_internal.flag_evaluation_log (flag_key, variant, reason, context, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, 'demo', $5)`,
        [e.key, e.variant, e.reason, JSON.stringify(e.ctx), new Date(Date.now() - (evalLogs.length - i) * 600000).toISOString()]
      );
    }

    // --- Audit logs for flag actions ---
    const flagAudits = [
      { action: "flag.created", resource_id: "dark-mode-v2", payload: { name: "Dark Mode v2", flagType: "boolean" }, daysAgo: 12 },
      { action: "flag.created", resource_id: "pricing-experiment", payload: { name: "Pricing Page Experiment", flagType: "string" }, daysAgo: 5 },
      { action: "flag.toggled", resource_id: "dark-mode-v2", payload: { state: "ENABLED" }, daysAgo: 11 },
      { action: "flag.created", resource_id: "new-checkout-flow", payload: { name: "New Checkout Flow", flagType: "boolean" }, daysAgo: 3 },
      { action: "flag.created", resource_id: "ai-search-beta", payload: { name: "AI-Powered Search", flagType: "boolean" }, daysAgo: 2 },
      { action: "flag.toggled", resource_id: "ai-search-beta", payload: { state: "ENABLED" }, daysAgo: 2 },
      { action: "flag.env_updated", resource_id: "pricing-experiment", payload: { environment: "production", state: "ENABLED", rolloutPct: 100 }, daysAgo: 4 },
      { action: "flag.promoted", resource_id: "new-checkout-flow", payload: { from: "staging", to: "production" }, daysAgo: 1 },
      { action: "flag.updated", resource_id: "ai-search-beta", payload: { targeting: "20% rollout" }, daysAgo: 1 },
      { action: "flag.created", resource_id: "api-v2-endpoints", payload: { name: "API v2 Endpoints", flagType: "boolean" }, daysAgo: 1 },
    ];
    for (const a of flagAudits) {
      await client.query(
        `INSERT INTO truss_internal.audit_logs (actor, action, resource_type, resource_id, payload, created_at, tenant_id)
         VALUES ('demo@truss.dev', $1, 'feature_flag', $2, $3::jsonb, $4, 'demo')`,
        [a.action, a.resource_id, JSON.stringify(a.payload), new Date(Date.now() - a.daysAgo * 86400000).toISOString()]
      );
    }
  } catch (err) { await client.query("ROLLBACK TO SAVEPOINT feature_flags"); console.warn("Demo seed: feature flags failed:", err.message); }
}
