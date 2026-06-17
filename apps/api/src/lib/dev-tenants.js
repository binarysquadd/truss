import { getPool } from "./state.js";
import { provisionTenantDatabase } from "./tenant-db.js";
import { ensureInternalSchema } from "./internal.js";
import { generateApiKey } from "./api-keys.js";
import { encryptValue } from "../routes/connections.js";
import logger from "./logger.js";

const API_BASE_URL = process.env.API_URL || process.env.VITE_API_BASE_URL || `http://localhost:${process.env.API_PORT || 8787}`;

const log = logger.child({ module: "dev-tenants" });

const DEV_TENANTS = [
  { id: "dev-alice", email: "alice@truss.dev", displayName: "Alice (Business)", plan: "business", isAdmin: false },
  { id: "dev-bob", email: "bob@truss.dev", displayName: "Bob (Pro)", plan: "pro", isAdmin: false },
  { id: "dev-carol", email: "carol@truss.dev", displayName: "Carol (Starter)", plan: "starter", isAdmin: false },
  { id: "dev-dave", email: "dave@truss.dev", displayName: "Dave (Team)", plan: "team", isAdmin: false },
];

/** Seed dev tenants and provision their databases. Called on startup when TRUSS_DEV_MODE=true. */
export async function seedDevTenants() {
  const pool = getPool();
  if (!pool) return;

  log.info("Seeding dev tenants...");
  await ensureInternalSchema();

  for (const t of DEV_TENANTS) {
    try {
      // Upsert tenant record
      await pool.query(
        `INSERT INTO truss_internal.tenants (id, identity_id, email, display_name, plan, is_admin)
         VALUES ($1, $1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET email = $2, display_name = $3, plan = $4, is_admin = $5`,
        [t.id, t.email, t.displayName, t.plan, t.isAdmin]
      );

      // Provision database for each tenant
      const dbName = await provisionTenantDatabase(t.id);

      // Provision default org for tenant
      const displayName = t.email.split("@")[0] || "User";
      const orgName = `${displayName}'s Workspace`;
      const orgSlug = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace"}-dev`;

      const orgResult = await pool.query(
        `INSERT INTO truss_internal.organizations (name, slug, owner_tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING
         RETURNING *`,
        [orgName, orgSlug, t.id]
      );

      let orgId = null;
      if (orgResult.rows.length > 0) {
        orgId = orgResult.rows[0].id;
      } else {
        // Org already exists, look it up
        const existingOrg = await pool.query(
          `SELECT id FROM truss_internal.organizations WHERE slug = $1`,
          [orgSlug]
        );
        orgId = existingOrg.rows[0]?.id || null;
      }

      if (orgId) {
        // Add tenant as org owner
        await pool.query(
          `INSERT INTO truss_internal.org_members (org_id, tenant_id, role, joined_at)
           VALUES ($1, $2, 'owner', now()) ON CONFLICT DO NOTHING`,
          [orgId, t.id]
        );

        // Provision default project inside the org
        const projectSlug = "default";
        const schemaName = `project_${projectSlug}`;
        const tenantShort = t.id.replace(/-/g, "").slice(0, 12).toLowerCase();
        const bucketName = `t-${tenantShort}-${projectSlug}`;
        const anonKey = generateApiKey("anon");
        const serviceKey = generateApiKey("service_role");

        const projResult = await pool.query(
          `INSERT INTO truss_internal.projects
            (name, slug, region, schema_name, bucket_name, anon_key, service_role_key, api_url, status, tenant_id, org_id, db_name, db_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, 'dedicated')
           ON CONFLICT DO NOTHING
           RETURNING *`,
          ["Default Project", projectSlug, "auto", schemaName, bucketName, anonKey.fullKey, encryptValue(serviceKey.fullKey), `${API_BASE_URL}/v1/projects/${projectSlug}`, t.id, orgId, dbName]
        );

        if (projResult.rows.length > 0) {
          const project = projResult.rows[0];
          await pool.query(
            `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            ["anon", anonKey.prefix, anonKey.hash, "Default Project anon key", project.id, t.id]
          );
          await pool.query(
            `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, project_id, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            ["service_role", serviceKey.prefix, serviceKey.hash, "Default Project service_role key", project.id, t.id]
          );
          log.info({ tenantId: t.id, orgSlug, projectSlug }, "Provisioned default org + project for dev tenant");
        }
      }

      // Seed sample tables in each tenant's database
      await seedTenantData(t, dbName);

      log.info({ tenantId: t.id, dbName }, `Dev tenant ready: ${t.displayName}`);
    } catch (err) {
      log.error({ err: err.message, tenantId: t.id }, "Failed to seed dev tenant");
    }
  }

  log.info("Dev tenants seeded");
}

/** Seed sample data into a dev tenant's database. */
async function seedTenantData(tenant, dbName) {
  const { getPoolForDatabase } = await import("./state.js");
  const tPool = getPoolForDatabase(dbName);
  if (!tPool) return;

  // Check if already seeded (idempotent)
  const check = await tPool.query(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_truss_seeded') AS seeded`
  );
  if (check.rows[0]?.seeded) return;

  if (tenant.id === "dev-alice") {
    // Alice: todo app schema
    await tPool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id serial PRIMARY KEY,
        title text NOT NULL,
        completed boolean DEFAULT false,
        priority int DEFAULT 0,
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO todos (title, completed, priority) VALUES
        ('Set up Truss project', true, 1),
        ('Configure auth providers', false, 2),
        ('Deploy to production', false, 3),
        ('Write API documentation', false, 1);
      CREATE TABLE IF NOT EXISTS tags (
        id serial PRIMARY KEY,
        name text UNIQUE NOT NULL,
        color text DEFAULT '#6366f1'
      );
      INSERT INTO tags (name, color) VALUES ('backend', '#3b82f6'), ('frontend', '#f59e0b'), ('devops', '#10b981');
    `);
  } else if (tenant.id === "dev-bob") {
    // Bob: e-commerce schema
    await tPool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id serial PRIMARY KEY,
        name text NOT NULL,
        price numeric(10,2) NOT NULL,
        stock int DEFAULT 0,
        category text,
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO products (name, price, stock, category) VALUES
        ('Wireless Mouse', 29.99, 150, 'electronics'),
        ('Mechanical Keyboard', 89.99, 75, 'electronics'),
        ('USB-C Hub', 49.99, 200, 'accessories'),
        ('Monitor Stand', 39.99, 100, 'furniture');
      CREATE TABLE IF NOT EXISTS orders (
        id serial PRIMARY KEY,
        customer_email text NOT NULL,
        total numeric(10,2),
        status text DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO orders (customer_email, total, status) VALUES
        ('user1@example.com', 119.98, 'shipped'),
        ('user2@example.com', 49.99, 'pending');
    `);
  } else if (tenant.id === "dev-carol") {
    // Carol: blog schema
    await tPool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id serial PRIMARY KEY,
        title text NOT NULL,
        body text,
        published boolean DEFAULT false,
        author text DEFAULT 'carol',
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO posts (title, body, published) VALUES
        ('Getting Started with Truss', 'Welcome to my first post...', true),
        ('Building a REST API', 'In this tutorial...', false);
      CREATE TABLE IF NOT EXISTS comments (
        id serial PRIMARY KEY,
        post_id int REFERENCES posts(id),
        author text NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO comments (post_id, author, body) VALUES (1, 'reader1', 'Great post!');
    `);
  } else if (tenant.id === "dev-dave") {
    // Dave: analytics schema
    await tPool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id serial PRIMARY KEY,
        event_name text NOT NULL,
        user_id text,
        properties jsonb DEFAULT '{}',
        timestamp timestamptz DEFAULT now()
      );
      INSERT INTO events (event_name, user_id, properties) VALUES
        ('page_view', 'u1', '{"page": "/home"}'),
        ('button_click', 'u1', '{"button": "signup"}'),
        ('page_view', 'u2', '{"page": "/pricing"}'),
        ('purchase', 'u2', '{"plan": "pro", "amount": 29}');
      CREATE TABLE IF NOT EXISTS dashboards (
        id serial PRIMARY KEY,
        name text NOT NULL,
        config jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO dashboards (name, config) VALUES ('Overview', '{"widgets": ["pageviews", "signups"]}');
    `);
  }

  // Mark as seeded
  await tPool.query(`CREATE TABLE IF NOT EXISTS _truss_seeded (seeded_at timestamptz DEFAULT now())`);
  await tPool.query(`INSERT INTO _truss_seeded DEFAULT VALUES ON CONFLICT DO NOTHING`);
}

/** List all dev tenants (for the switcher UI). */
export function getDevTenants() {
  return DEV_TENANTS.map(t => ({ id: t.id, email: t.email, displayName: t.displayName, plan: t.plan, isAdmin: t.isAdmin }));
}
