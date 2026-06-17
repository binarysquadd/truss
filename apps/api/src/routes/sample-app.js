import express from "express";
import crypto from "crypto";
import { getPool, KETO_READ_URL, KETO_WRITE_URL, KETO_ADMIN_TOKEN } from "../lib/state.js";
import { ensureInternalSchema } from "../lib/internal.js";
import { generateApiKey } from "../lib/api-keys.js";
import { createRealtimeTrigger, createWebhookTrigger } from "../lib/realtime.js";
import { getS3Client } from "../lib/s3.js";
import { CreateBucketCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { kratosAdminRequest } from "../lib/kratos.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "sample-app" });

export const router = express.Router();

const SAMPLE_BUCKET = "sample-app-uploads";
const SAMPLE_EMAILS = ["alice@sampleapp.dev", "bob@sampleapp.dev", "carol@sampleapp.dev"];
const SAMPLE_PROJECT = "sample-project";

// ─── Tenant auth guard: sample app routes require demo mode or admin access ───
// The sample app creates a global `sample_app` schema — restrict to demo tenants
// (safe, isolated, rate-limited) or admins (dev mode / self-hosted owners).
router.use("/api/sample-app", (req, res, next) => {
  if (!req.tenant?.id) return res.status(401).json({ error: "Authentication required" });
  const isDev = req.tenant?.id?.startsWith("dev-") || req.tenant?.id === "local";
  if (!req.tenant?.isDemo && !req.tenant?.isAdmin && !isDev) {
    return res.status(403).json({ error: "Sample app is only available in demo mode" });
  }
  next();
});

// ─── GET /api/sample-app/status ───
router.get("/api/sample-app/status", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });
  try {
    const { rows } = await pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'sample_app'`
    );
    if (rows.length === 0) return res.json({ loaded: false });

    // Gather stats
    const tables = await pool.query(
      `SELECT count(*) AS c FROM information_schema.tables WHERE table_schema = 'sample_app'`
    );
    const counts = {};
    for (const t of ["users", "posts", "comments", "categories", "post_categories"]) {
      try {
        const r = await pool.query(`SELECT count(*) AS c FROM sample_app.${t}`);
        counts[t] = Number(r.rows[0].c);
      } catch { counts[t] = 0; }
    }
    // Check if embeddings table exists (pgvector)
    let hasEmbeddings = false;
    try {
      const r = await pool.query(`SELECT count(*) AS c FROM sample_app.embeddings`);
      counts.embeddings = Number(r.rows[0].c);
      hasEmbeddings = true;
    } catch { /* pgvector not enabled */ }

    // RLS policies on sample_app tables
    let rlsPolicies = 0;
    try {
      const r = await pool.query(
        `SELECT count(*) AS c FROM pg_policies WHERE schemaname = 'sample_app'`
      );
      rlsPolicies = Number(r.rows[0].c);
    } catch { /* ignore */ }

    // Full-text search: check for search_vector column + GIN index
    let ftsConfigured = false;
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'sample_app' AND table_name = 'posts' AND column_name = 'search_vector'`
      );
      ftsConfigured = r.rows.length > 0;
    } catch { /* ignore */ }

    // Realtime subscriptions on sample_app
    let realtimeSubscriptionCount = 0;
    try {
      const r = await pool.query(
        `SELECT count(*) AS c FROM truss_internal.realtime_subscriptions WHERE schema_name = 'sample_app' AND active = true`
      );
      realtimeSubscriptionCount = Number(r.rows[0].c);
    } catch { /* ignore */ }

    // Webhooks on sample_app
    let webhookCount = 0;
    try {
      const r = await pool.query(
        `SELECT count(*) AS c FROM truss_internal.webhooks WHERE table_schema = 'sample_app'`
      );
      webhookCount = Number(r.rows[0].c);
    } catch { /* ignore */ }

    // API keys
    let apiKeyCount = 0;
    try {
      const r = await pool.query(
        `SELECT count(*) AS c FROM truss_internal.api_keys WHERE revoked = false`
      );
      apiKeyCount = Number(r.rows[0].c);
    } catch { /* ignore */ }

    // Cron jobs on sample_app (if pg_cron is available)
    // null = pg_cron not available, number = count of sample cron jobs
    let cronConfigured = null;
    try {
      const r = await pool.query(
        `SELECT count(*) AS c FROM cron.job WHERE jobname LIKE 'sample-%'`
      );
      cronConfigured = Number(r.rows[0].c);
    } catch { /* pg_cron not available — leave as null */ }

    // Storage bucket status
    // null = S3 not configured, object = bucket status
    let storageBucket = null;
    try {
      const s3 = getS3Client();
      if (s3) {
        try {
          await s3.send(new HeadBucketCommand({ Bucket: SAMPLE_BUCKET }));
          const listed = await s3.send(new ListObjectsV2Command({ Bucket: SAMPLE_BUCKET, MaxKeys: 1000 }));
          storageBucket = { exists: true, objects: listed.KeyCount || 0 };
        } catch {
          storageBucket = { exists: false, objects: 0 };
        }
      }
    } catch { /* S3 not configured — leave as null */ }

    // Kratos identity count (from tracking table)
    // null = integration unavailable, number = count
    let kratosIdentityCount = null;
    try {
      const r = await pool.query(`SELECT count(*) AS c FROM sample_app.kratos_identities`);
      kratosIdentityCount = Number(r.rows[0].c);
    } catch { /* table may not exist — leave as null */ }

    // Keto tuple count for sample project
    // null = integration unavailable, number = count
    let ketoTupleCount = null;
    try {
      if (KETO_READ_URL) {
        const qs = new URLSearchParams({ namespace: "Project", object: SAMPLE_PROJECT });
        const r = await fetch(`${KETO_READ_URL}/relation-tuples?${qs.toString()}`);
        if (r.ok) {
          const data = await r.json();
          ketoTupleCount = data.relation_tuples?.length || 0;
        }
      }
    } catch { /* keto may not be available — leave as null */ }

    return res.json({
      loaded: true,
      tables: Number(tables.rows[0].c),
      rows: counts,
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
      rlsPolicies,
      ftsConfigured,
      hasEmbeddings,
      realtimeCount: realtimeSubscriptionCount,
      webhookCount,
      apiKeyCount,
      cronConfigured,
      storageBucket,
      authIdentities: kratosIdentityCount,
      ketoTuples: ketoTupleCount,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/sample-app/load ───
router.post("/api/sample-app/load", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });

  try {
    await ensureInternalSchema();
    const tenantId = req.tenant?.id || null;

    // Check if already loaded
    const existing = await pool.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'sample_app'`
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Sample app already loaded. Unload first." });
    }

    const stats = { tables: 0, rows: 0, functions: 0, triggers: 0, indexes: 0 };
    const extras = { storage: false, kratos: false, keto: false, cron: false };

    // 1. Create schema + tables
    await pool.query(`CREATE SCHEMA sample_app`);

    await pool.query(`
      CREATE TABLE sample_app.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        name text NOT NULL,
        bio text,
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_email_check CHECK (email LIKE '%@%')
      )
    `);
    stats.tables++;

    await pool.query(`
      CREATE TABLE sample_app.posts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id uuid NOT NULL REFERENCES sample_app.users(id) ON DELETE CASCADE,
        title text NOT NULL,
        body text NOT NULL,
        published boolean NOT NULL DEFAULT false,
        tags text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        search_vector tsvector
      )
    `);
    stats.tables++;

    await pool.query(`
      CREATE TABLE sample_app.comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL REFERENCES sample_app.posts(id) ON DELETE CASCADE,
        author_id uuid NOT NULL REFERENCES sample_app.users(id) ON DELETE CASCADE,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    stats.tables++;

    await pool.query(`
      CREATE TABLE sample_app.categories (
        id serial PRIMARY KEY,
        name text UNIQUE NOT NULL,
        slug text UNIQUE NOT NULL
      )
    `);
    stats.tables++;

    await pool.query(`
      CREATE TABLE sample_app.post_categories (
        post_id uuid NOT NULL REFERENCES sample_app.posts(id) ON DELETE CASCADE,
        category_id integer NOT NULL REFERENCES sample_app.categories(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, category_id)
      )
    `);
    stats.tables++;

    // Kratos identity tracking table (created early so it's part of the schema)
    await pool.query(`
      CREATE TABLE sample_app.kratos_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kratos_id text UNIQUE NOT NULL,
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    stats.tables++;

    // Check pgvector and create embeddings table if available
    let hasVector = false;
    try {
      const ext = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
      hasVector = ext.rows.length > 0;
    } catch { /* ignore */ }

    if (hasVector) {
      await pool.query(`
        CREATE TABLE sample_app.embeddings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          post_id uuid NOT NULL REFERENCES sample_app.posts(id) ON DELETE CASCADE,
          embedding vector(384),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      stats.tables++;
    }

    // 2. Insert sample data — users
    const userIds = [];
    const users = [
      { email: "alice@example.com", name: "Alice Chen", bio: "Full-stack developer and open-source contributor." },
      { email: "bob@example.com", name: "Bob Martinez", bio: "DevOps engineer who loves infrastructure automation." },
      { email: "carol@example.com", name: "Carol Williams", bio: "Product designer with a passion for developer tools." },
      { email: "dave@example.com", name: "Dave Kim", bio: "Backend engineer specializing in distributed systems." },
      { email: "eve@example.com", name: "Eve Johnson", bio: "Security researcher and Rust enthusiast." },
      { email: "frank@example.com", name: "Frank Nakamura", bio: "Data engineer working with real-time pipelines." },
      { email: "grace@example.com", name: "Grace Liu", bio: "Frontend engineer and accessibility advocate." },
      { email: "hank@example.com", name: "Hank Patel", bio: "Cloud architect with multi-cloud expertise." },
      { email: "iris@example.com", name: "Iris Okafor", bio: "Mobile developer and technical writer." },
      { email: "jack@example.com", name: "Jack Thompson", bio: "Startup founder building developer tools." },
    ];
    for (const u of users) {
      const { rows } = await pool.query(
        `INSERT INTO sample_app.users (email, name, bio, avatar_url)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [u.email, u.name, u.bio, `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`]
      );
      userIds.push(rows[0].id);
      stats.rows++;
    }

    // 3. Categories
    const categories = [
      { name: "Engineering", slug: "engineering" },
      { name: "DevOps", slug: "devops" },
      { name: "Design", slug: "design" },
      { name: "Security", slug: "security" },
      { name: "Tutorials", slug: "tutorials" },
    ];
    const categoryIds = [];
    for (const c of categories) {
      const { rows } = await pool.query(
        `INSERT INTO sample_app.categories (name, slug) VALUES ($1, $2) RETURNING id`,
        [c.name, c.slug]
      );
      categoryIds.push(rows[0].id);
      stats.rows++;
    }

    // 4. Posts
    const postTitles = [
      { title: "Getting Started with PostgreSQL", body: "PostgreSQL is one of the most powerful open-source databases available today. In this guide, we cover the basics of setting up your first database, creating tables, and writing queries. Whether you are migrating from MySQL or starting fresh, Postgres offers advanced features like JSONB, full-text search, and extensibility that make it a fantastic choice for modern applications.", tags: ["postgres", "tutorial", "database"], published: true, catIdx: 4 },
      { title: "Building Realtime Apps with WebSockets", body: "WebSockets enable bidirectional communication between client and server, making them ideal for chat applications, live dashboards, and collaborative editing tools. This post walks through implementing a simple realtime notification system using PostgreSQL LISTEN/NOTIFY and a Node.js WebSocket server.", tags: ["websockets", "realtime", "nodejs"], published: true, catIdx: 0 },
      { title: "Row-Level Security in Postgres", body: "Row-Level Security (RLS) lets you define policies that control which rows users can see or modify. This is incredibly useful for multi-tenant applications where data isolation is critical. We explore how to set up RLS policies, common patterns, and pitfalls to avoid.", tags: ["postgres", "security", "rls"], published: true, catIdx: 3 },
      { title: "Docker Compose for Local Development", body: "Docker Compose simplifies managing multi-container applications during development. This guide shows how to set up a complete development environment with Postgres, Redis, and your API server, all orchestrated with a single docker-compose.yml file.", tags: ["docker", "devops", "tutorial"], published: true, catIdx: 1 },
      { title: "Introduction to pgvector", body: "pgvector brings vector similarity search to PostgreSQL, enabling AI-powered features like semantic search and recommendation engines without a separate vector database. Learn how to install the extension, create vector columns, and perform nearest-neighbor queries.", tags: ["pgvector", "ai", "postgres"], published: true, catIdx: 0 },
      { title: "Designing API Authentication", body: "API authentication is the gateway to your application. This post compares different strategies including API keys, JWT tokens, and OAuth2 flows. We discuss when to use each approach and how to implement them securely.", tags: ["api", "security", "auth"], published: true, catIdx: 3 },
      { title: "Tailwind CSS v4 Migration Guide", body: "Tailwind CSS v4 introduces significant changes to the configuration system, moving from JavaScript config files to CSS-native configuration. This migration guide covers the key differences and how to update your existing projects.", tags: ["css", "tailwind", "frontend"], published: true, catIdx: 2 },
      { title: "Full-Text Search with tsvector", body: "PostgreSQL built-in full-text search is surprisingly powerful. Using tsvector and tsquery, you can implement search with ranking, highlighting, and multiple language support without any external search engine. This tutorial covers the basics and advanced configurations.", tags: ["postgres", "search", "tutorial"], published: true, catIdx: 4 },
      { title: "Understanding RBAC and ReBAC", body: "Role-Based Access Control (RBAC) and Relation-Based Access Control (ReBAC) are two approaches to authorization. RBAC assigns permissions through roles, while ReBAC models permissions as relationships between entities. We compare both models and discuss when to use each.", tags: ["authorization", "security", "rbac"], published: true, catIdx: 3 },
      { title: "Kubernetes Observability Stack", body: "Monitoring Kubernetes clusters requires a comprehensive observability stack. This post covers setting up Prometheus for metrics, Grafana for visualization, and Loki for log aggregation, giving you full visibility into your cluster health.", tags: ["kubernetes", "observability", "devops"], published: true, catIdx: 1 },
      { title: "S3-Compatible Object Storage", body: "MinIO provides S3-compatible storage that you can self-host. This guide covers deploying MinIO, configuring buckets, setting up access policies, and integrating it into your application for file uploads and static asset hosting.", tags: ["storage", "minio", "s3"], published: true, catIdx: 1 },
      { title: "React 19 Server Components", body: "React Server Components represent a paradigm shift in how we build React applications. This post explains the mental model, shows practical examples, and discusses the tradeoffs compared to traditional client-side rendering.", tags: ["react", "frontend", "javascript"], published: true, catIdx: 0 },
      { title: "Database Branching for CI/CD", body: "Database branching creates isolated copies of your database for testing and development. This technique enables parallel feature development, safe migration testing, and automated CI pipelines that include database schema changes.", tags: ["database", "ci-cd", "branching"], published: true, catIdx: 1 },
      { title: "Webhook Design Patterns", body: "Webhooks are a powerful integration mechanism, but designing them well requires careful thought. This post covers retry strategies, signature verification, idempotency, and delivery guarantees for production-grade webhook systems.", tags: ["webhooks", "architecture", "api"], published: true, catIdx: 0 },
      { title: "CRON Jobs in PostgreSQL", body: "pg_cron allows you to schedule recurring tasks directly inside PostgreSQL. From cleaning up expired sessions to aggregating analytics data, database-level cron jobs reduce the need for external schedulers.", tags: ["postgres", "cron", "automation"], published: true, catIdx: 4 },
      { title: "OAuth2 Flows Explained", body: "OAuth2 defines several authorization flows for different use cases. This comprehensive guide covers the Authorization Code flow, Client Credentials flow, and PKCE extension with practical examples for each.", tags: ["oauth2", "auth", "security"], published: true, catIdx: 3 },
      { title: "Optimizing Postgres Queries", body: "Slow queries can bring your application to a crawl. This post covers EXPLAIN ANALYZE, index strategies, query planning, and common anti-patterns that cause performance issues in PostgreSQL.", tags: ["postgres", "performance", "optimization"], published: true, catIdx: 0 },
      { title: "Self-Hosting Your Backend", body: "Self-hosting gives you full control over your data and infrastructure. We walk through deploying a complete backend stack with authentication, database, storage, and API gateway on a single VPS using Docker.", tags: ["self-hosting", "docker", "infrastructure"], published: true, catIdx: 1 },
      { title: "Monaco Editor Integration", body: "Monaco Editor powers VS Code and can be embedded in web applications for a rich code editing experience. This tutorial covers setup, custom themes, language support, and autocompletion configuration.", tags: ["editor", "frontend", "javascript"], published: false, catIdx: 2 },
      { title: "Building a CLI Tool with Node.js", body: "Command-line tools are essential for developer workflows. This guide shows how to build a feature-rich CLI using Node.js, including argument parsing, interactive prompts, progress indicators, and publishing to npm.", tags: ["nodejs", "cli", "tutorial"], published: false, catIdx: 4 },
      { title: "PostgreSQL Triggers Deep Dive", body: "Triggers allow you to execute functions automatically when data changes. This deep dive covers BEFORE/AFTER triggers, trigger functions in PL/pgSQL, and real-world use cases like audit logging and computed columns.", tags: ["postgres", "triggers", "tutorial"], published: true, catIdx: 4 },
      { title: "API Rate Limiting Strategies", body: "Rate limiting protects your API from abuse and ensures fair usage. This post compares token bucket, sliding window, and fixed window algorithms with implementation examples.", tags: ["api", "security", "rate-limiting"], published: true, catIdx: 0 },
      { title: "CSS Architecture for Large Apps", body: "As applications grow, CSS architecture becomes critical. This post compares approaches including BEM, CSS Modules, CSS-in-JS, and utility-first frameworks like Tailwind, with recommendations for different project sizes.", tags: ["css", "architecture", "frontend"], published: true, catIdx: 2 },
      { title: "Point-in-Time Recovery with Postgres", body: "Point-in-Time Recovery (PITR) lets you restore your database to any moment in time using WAL archives. This guide covers setting up continuous archiving, performing recovery, and integrating PITR into your backup strategy.", tags: ["postgres", "backup", "pitr"], published: true, catIdx: 1 },
      { title: "GraphQL vs REST in 2025", body: "The GraphQL vs REST debate continues to evolve. This balanced comparison examines real-world performance, developer experience, tooling, and when each approach makes more sense for your use case.", tags: ["graphql", "rest", "api"], published: true, catIdx: 0 },
      { title: "Securing WebSocket Connections", body: "WebSocket security is often overlooked. This post covers authentication during the handshake, message validation, rate limiting, and protecting against common attacks like cross-site WebSocket hijacking.", tags: ["websockets", "security", "realtime"], published: false, catIdx: 3 },
      { title: "Database Migration Best Practices", body: "Database migrations are a critical part of application development. This post covers writing idempotent migrations, handling rollbacks, dealing with zero-downtime deployments, and common mistakes to avoid.", tags: ["database", "migrations", "devops"], published: true, catIdx: 1 },
      { title: "Building a Component Library", body: "A well-designed component library accelerates development and ensures consistency. This guide covers architecture decisions, documentation with Storybook, testing strategies, and publishing as an npm package.", tags: ["react", "components", "design-system"], published: true, catIdx: 2 },
      { title: "Event-Driven Architecture Patterns", body: "Event-driven architecture decouples services and enables reactive systems. This post explores event sourcing, CQRS, saga patterns, and how PostgreSQL LISTEN/NOTIFY can serve as a lightweight event bus.", tags: ["architecture", "events", "postgres"], published: true, catIdx: 0 },
      { title: "Zero-Trust Network Architecture", body: "Zero-trust assumes no implicit trust for any entity inside or outside the network. This post covers the principles of zero-trust, implementation with API gateways, mutual TLS, and identity-aware proxies.", tags: ["security", "zero-trust", "networking"], published: false, catIdx: 3 },
    ];

    const postIds = [];
    for (let i = 0; i < postTitles.length; i++) {
      const p = postTitles[i];
      const authorIdx = i % userIds.length;
      const createdAt = new Date(Date.now() - (30 - i) * 86400000).toISOString();
      const { rows } = await pool.query(
        `INSERT INTO sample_app.posts (author_id, title, body, published, tags, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userIds[authorIdx], p.title, p.body, p.published, p.tags, createdAt]
      );
      postIds.push(rows[0].id);
      stats.rows++;

      // Link to category
      await pool.query(
        `INSERT INTO sample_app.post_categories (post_id, category_id) VALUES ($1, $2)`,
        [rows[0].id, categoryIds[p.catIdx]]
      );
      stats.rows++;
    }

    // 5. Comments (80 spread across posts)
    const commentBodies = [
      "Great article! This is exactly what I was looking for.",
      "Thanks for the detailed explanation. The code examples are really helpful.",
      "I had a similar issue and this solved it perfectly.",
      "Interesting perspective. Have you considered using a different approach?",
      "This is a solid introduction. Would love to see a follow-up on advanced topics.",
      "I have been using this pattern in production for months and it works great.",
      "One small correction: the default port is actually 5432, not 5433.",
      "Bookmarked for future reference. Really well written.",
      "How does this compare to the approach described in the official docs?",
      "This tutorial saved me hours of debugging. Thank you!",
      "I would add that error handling is crucial in production deployments.",
      "The performance benchmarks would be a nice addition to this post.",
      "Clean and concise. Exactly the kind of content we need more of.",
      "Has anyone tried this with the latest version? Any breaking changes?",
      "This is a common pitfall. Glad someone finally wrote about it clearly.",
      "I wish I had found this article sooner. Would have saved me a lot of time.",
      "Solid advice. I especially agree about keeping things simple.",
      "Can you elaborate on the security implications of this approach?",
      "Nice writeup. The diagrams really help visualize the architecture.",
      "I implemented this in our project and the team loves it.",
    ];

    for (let i = 0; i < 80; i++) {
      const postIdx = i % postIds.length;
      const authorIdx = (i + 3) % userIds.length;
      const bodyIdx = i % commentBodies.length;
      const createdAt = new Date(Date.now() - (25 - Math.floor(i / 4)) * 86400000).toISOString();
      await pool.query(
        `INSERT INTO sample_app.comments (post_id, author_id, body, created_at)
         VALUES ($1, $2, $3, $4)`,
        [postIds[postIdx], userIds[authorIdx], commentBodies[bodyIdx], createdAt]
      );
      stats.rows++;
    }

    // 6. Full-text search: trigger + GIN index
    await pool.query(`
      CREATE OR REPLACE FUNCTION sample_app.update_search_vector()
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.body, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    stats.functions++;

    await pool.query(`
      CREATE TRIGGER trg_posts_search_vector
      BEFORE INSERT OR UPDATE ON sample_app.posts
      FOR EACH ROW EXECUTE FUNCTION sample_app.update_search_vector()
    `);
    stats.triggers++;

    // Backfill existing posts
    await pool.query(`
      UPDATE sample_app.posts SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
    `);

    await pool.query(`
      CREATE INDEX idx_posts_search_vector ON sample_app.posts USING gin(search_vector)
    `);
    stats.indexes++;

    // 7. get_popular_posts function
    await pool.query(`
      CREATE OR REPLACE FUNCTION sample_app.get_popular_posts(limit_count int DEFAULT 10)
      RETURNS TABLE(post_id uuid, title text, author_name text, comment_count bigint) AS $$
      BEGIN
        RETURN QUERY
        SELECT p.id, p.title, u.name, count(c.id) AS comment_count
        FROM sample_app.posts p
        JOIN sample_app.users u ON u.id = p.author_id
        LEFT JOIN sample_app.comments c ON c.post_id = p.id
        WHERE p.published = true
        GROUP BY p.id, p.title, u.name
        ORDER BY comment_count DESC
        LIMIT limit_count;
      END;
      $$ LANGUAGE plpgsql
    `);
    stats.functions++;

    // 8. RLS policies on posts
    await pool.query(`ALTER TABLE sample_app.posts ENABLE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY posts_public_read ON sample_app.posts
      FOR SELECT USING (published = true)
    `);
    await pool.query(`
      CREATE POLICY posts_author_all ON sample_app.posts
      FOR ALL USING (author_id = current_setting('app.current_user_id', true)::uuid)
    `);

    // ─── Additional Database Features ───

    // VIEW: post_stats (post title, author, comment count, category)
    await pool.query(`
      CREATE VIEW sample_app.post_stats AS
      SELECT
        p.id AS post_id,
        p.title,
        u.name AS author,
        count(c.id) AS comment_count,
        cat.name AS category
      FROM sample_app.posts p
      JOIN sample_app.users u ON u.id = p.author_id
      LEFT JOIN sample_app.comments c ON c.post_id = p.id
      LEFT JOIN sample_app.post_categories pc ON pc.post_id = p.id
      LEFT JOIN sample_app.categories cat ON cat.id = pc.category_id
      GROUP BY p.id, p.title, u.name, cat.name
    `);

    // INDEX on comments(post_id, created_at DESC)
    await pool.query(`
      CREATE INDEX idx_comments_post_created ON sample_app.comments (post_id, created_at DESC)
    `);
    stats.indexes++;

    // 9. Realtime subscription on sample_app.posts
    try {
      await createRealtimeTrigger("sample_app", "posts");
      await pool.query(`
        INSERT INTO truss_internal.realtime_subscriptions (schema_name, table_name, active)
        VALUES ('sample_app', 'posts', true)
        ON CONFLICT (schema_name, table_name) DO UPDATE SET active = true
      `);
    } catch (e) {
      log.warn({ err: e.message }, "could not create realtime subscription for posts");
    }

    // Additional realtime subscription on sample_app.comments
    try {
      await createRealtimeTrigger("sample_app", "comments");
      await pool.query(`
        INSERT INTO truss_internal.realtime_subscriptions (schema_name, table_name, active)
        VALUES ('sample_app', 'comments', true)
        ON CONFLICT (schema_name, table_name) DO UPDATE SET active = true
      `);
    } catch (e) {
      log.warn({ err: e.message }, "could not create realtime subscription for comments");
    }

    // 10. Webhook on sample_app.comments for INSERT
    try {
      const { rows: whRows } = await pool.query(
        `INSERT INTO truss_internal.webhooks (name, table_schema, table_name, events, url, headers, secret, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          "New Comment Notification",
          "sample_app",
          "comments",
          ["INSERT"],
          "https://httpbin.org/post",
          JSON.stringify({ "Content-Type": "application/json" }),
          "sample-webhook-secret",
          tenantId,
        ]
      );
      if (whRows[0]) {
        try { await createWebhookTrigger(whRows[0]); } catch { /* non-fatal */ }
      }
    } catch (e) {
      log.warn({ err: e.message }, "could not create webhook");
    }

    // Additional webhook on sample_app.posts for UPDATE (post published/edited)
    try {
      const { rows: whRows2 } = await pool.query(
        `INSERT INTO truss_internal.webhooks (name, table_schema, table_name, events, url, headers, secret, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          "Post Updated Notification",
          "sample_app",
          "posts",
          ["UPDATE"],
          "https://httpbin.org/post",
          JSON.stringify({ "Content-Type": "application/json" }),
          "sample-webhook-secret-2",
          tenantId,
        ]
      );
      if (whRows2[0]) {
        try { await createWebhookTrigger(whRows2[0]); } catch { /* non-fatal */ }
      }
    } catch (e) {
      log.warn({ err: e.message }, "could not create second webhook");
    }

    // 11. Saved queries
    const savedQueries = [
      { name: "Popular Posts", sql: "SELECT * FROM sample_app.get_popular_posts(5);", tags: ["sample-app", "analytics"] },
      { name: "Recent Comments", sql: "SELECT c.body, u.name AS author, p.title AS post\nFROM sample_app.comments c\nJOIN sample_app.users u ON u.id = c.author_id\nJOIN sample_app.posts p ON p.id = c.post_id\nORDER BY c.created_at DESC\nLIMIT 20;", tags: ["sample-app", "comments"] },
      { name: "Full-Text Search", sql: "SELECT title, ts_headline('english', body, q) AS excerpt,\n       ts_rank(search_vector, q) AS rank\nFROM sample_app.posts, to_tsquery('english', 'postgres & security') q\nWHERE search_vector @@ q\nORDER BY rank DESC;", tags: ["sample-app", "search"] },
      { name: "Posts by Category", sql: "SELECT c.name AS category, count(pc.post_id) AS post_count\nFROM sample_app.categories c\nLEFT JOIN sample_app.post_categories pc ON pc.category_id = c.id\nGROUP BY c.name\nORDER BY post_count DESC;", tags: ["sample-app", "categories"] },
      { name: "Post Stats View", sql: "SELECT * FROM sample_app.post_stats\nORDER BY comment_count DESC\nLIMIT 15;", tags: ["sample-app", "views"] },
    ];
    for (const sq of savedQueries) {
      await pool.query(
        `INSERT INTO truss_internal.saved_queries (id, name, sql_text, schema_name, tags, tenant_id)
         VALUES ($1, $2, $3, 'sample_app', $4, $5)`,
        [`sample-${sq.name.toLowerCase().replace(/\s+/g, "-")}`, sq.name, sq.sql, sq.tags, tenantId]
      );
    }

    // 12. Ensure API keys exist (anon + service_role)
    const { rows: existingKeys } = await pool.query(
      `SELECT key_type FROM truss_internal.api_keys WHERE revoked = false`
    );
    const existingTypes = new Set(existingKeys.map((k) => k.key_type));
    const keysCreated = [];
    for (const keyType of ["anon", "service_role"]) {
      if (!existingTypes.has(keyType)) {
        const { fullKey, prefix, hash } = generateApiKey(keyType);
        await pool.query(
          `INSERT INTO truss_internal.api_keys (key_type, key_prefix, key_hash, label, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [keyType, prefix, hash, `Sample App ${keyType}`, tenantId]
        );
        keysCreated.push({ type: keyType, key: fullKey });
      }
    }

    // ─── Feature: Storage (MinIO) — best-effort ───
    try {
      const s3 = getS3Client();

      // Create sample bucket
      try {
        await s3.send(new CreateBucketCommand({ Bucket: SAMPLE_BUCKET }));
      } catch (e) {
        // Bucket may already exist — ignore BucketAlreadyOwnedByYou / BucketAlreadyExists
        if (!e.name?.includes("BucketAlready") && e.Code !== "BucketAlreadyOwnedByYou") {
          throw e;
        }
      }

      // Upload 3 sample objects
      const sampleObjects = [
        {
          Key: "README.md",
          Body: "# Sample App Uploads\n\nThis bucket was created by the Truss sample app loader.\nIt demonstrates S3-compatible object storage via MinIO.\n\n## Contents\n- `config.json` — sample configuration\n- `sample.csv` — sample data export\n",
          ContentType: "text/markdown",
        },
        {
          Key: "config.json",
          Body: JSON.stringify({
            app: "sample-blog",
            version: "1.0.0",
            features: { comments: true, search: true, realtime: true },
            storage: { maxUploadSize: "10MB", allowedTypes: ["image/*", "application/pdf"] },
          }, null, 2),
          ContentType: "application/json",
        },
        {
          Key: "sample.csv",
          Body: "id,name,email,role,created_at\n1,Alice Chen,alice@example.com,admin,2025-01-15\n2,Bob Martinez,bob@example.com,editor,2025-02-01\n3,Carol Williams,carol@example.com,viewer,2025-02-20\n4,Dave Kim,dave@example.com,editor,2025-03-05\n5,Eve Johnson,eve@example.com,admin,2025-03-18\n",
          ContentType: "text/csv",
        },
      ];

      for (const obj of sampleObjects) {
        await s3.send(new PutObjectCommand({
          Bucket: SAMPLE_BUCKET,
          Key: obj.Key,
          Body: obj.Body,
          ContentType: obj.ContentType,
        }));
      }

      extras.storage = true;
    } catch (e) {
      log.warn({ err: e.message }, "could not set up storage");
    }

    // ─── Feature: Auth (Kratos) — Create sample identities — best-effort ───
    try {
      for (const email of SAMPLE_EMAILS) {
        const identity = await kratosAdminRequest("/admin/identities", {
          method: "POST",
          body: {
            schema_id: "default",
            traits: { email },
            credentials: {
              password: {
                config: { password: crypto.randomBytes(16).toString("hex") },
              },
            },
          },
        });
        if (identity?.id) {
          await pool.query(
            `INSERT INTO sample_app.kratos_identities (kratos_id, email) VALUES ($1, $2)
             ON CONFLICT (kratos_id) DO NOTHING`,
            [identity.id, email]
          );
        }
      }
      extras.kratos = true;
    } catch (e) {
      log.warn({ err: e.message }, "could not create Kratos identities");
    }

    // ─── Feature: AuthZ (Keto) — Create sample permission tuples — best-effort ───
    try {
      if (KETO_WRITE_URL) {
        // Retrieve created kratos identity IDs for subjects
        const { rows: kratosRows } = await pool.query(
          `SELECT kratos_id, email FROM sample_app.kratos_identities ORDER BY email`
        );

        // Map emails to subject IDs (use kratos IDs if available, else fallback identifiers)
        const subjectMap = {};
        for (const row of kratosRows) {
          subjectMap[row.email] = row.kratos_id;
        }
        const aliceId = subjectMap["alice@sampleapp.dev"] || "alice-sample";
        const bobId = subjectMap["bob@sampleapp.dev"] || "bob-sample";
        const carolId = subjectMap["carol@sampleapp.dev"] || "carol-sample";

        const tuples = [
          { namespace: "Project", object: SAMPLE_PROJECT, relation: "owners", subject_id: aliceId },
          { namespace: "Project", object: SAMPLE_PROJECT, relation: "editors", subject_id: bobId },
          { namespace: "Project", object: SAMPLE_PROJECT, relation: "viewers", subject_id: carolId },
        ];

        for (const tuple of tuples) {
          try {
            await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${KETO_ADMIN_TOKEN}`,
              },
              body: JSON.stringify(tuple),
            });
          } catch { /* individual tuple failure is non-fatal */ }
        }
        extras.keto = true;
      }
    } catch (e) {
      log.warn({ err: e.message }, "could not create Keto tuples");
    }

    // ─── Feature: Cron Jobs (pg_cron) — best-effort ───
    try {
      const ext = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'`);
      if (ext.rows.length > 0) {
        await pool.query(
          `SELECT cron.schedule('sample-cleanup', '0 * * * *', $$DELETE FROM sample_app.comments WHERE created_at < now() - interval '90 days'$$)`
        );
        extras.cron = true;
      }
    } catch (e) {
      log.warn({ err: e.message }, "could not create cron job");
    }

    log.info({ tables: stats.tables, rows: stats.rows, extras }, "sample app loaded");
    return res.status(201).json({
      ok: true,
      message: "Sample app loaded successfully",
      stats: {
        tables: stats.tables,
        rows: stats.rows,
        functions: stats.functions,
        triggers: stats.triggers,
        indexes: stats.indexes,
        has_embeddings: hasVector,
        keys_created: keysCreated.length,
      },
      extras,
    });
  } catch (e) {
    // Attempt cleanup on failure
    try { await pool.query(`DROP SCHEMA IF EXISTS sample_app CASCADE`); } catch { /* ignore */ }
    return res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/sample-app/unload ───
router.delete("/api/sample-app/unload", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "No database connected" });

  try {
    const tenantId = req.tenant?.id || null;

    // ─── Cleanup: Storage (MinIO) ───
    try {
      const s3 = getS3Client();
      // List and delete all objects in the bucket
      let continuationToken;
      do {
        const listed = await s3.send(new ListObjectsV2Command({
          Bucket: SAMPLE_BUCKET,
          ContinuationToken: continuationToken,
        }));
        if (listed.Contents && listed.Contents.length > 0) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: SAMPLE_BUCKET,
            Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) },
          }));
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
      // Delete the bucket itself
      await s3.send(new DeleteBucketCommand({ Bucket: SAMPLE_BUCKET }));
    } catch (e) {
      log.warn({ err: e.message }, "unload: could not clean up storage");
    }

    // ─── Cleanup: Kratos identities ───
    try {
      const { rows: kratosRows } = await pool.query(
        `SELECT kratos_id FROM sample_app.kratos_identities`
      );
      for (const row of kratosRows) {
        try {
          await kratosAdminRequest(`/admin/identities/${row.kratos_id}`, { method: "DELETE" });
        } catch { /* individual identity delete failure is non-fatal */ }
      }
    } catch (e) {
      log.warn({ err: e.message }, "unload: could not clean up Kratos identities");
    }

    // ─── Cleanup: Keto tuples ───
    try {
      if (KETO_WRITE_URL) {
        const relations = ["owners", "editors", "viewers"];
        for (const relation of relations) {
          try {
            const qs = new URLSearchParams({
              namespace: "Project",
              object: SAMPLE_PROJECT,
              relation,
            });
            await fetch(`${KETO_WRITE_URL}/admin/relation-tuples?${qs.toString()}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${KETO_ADMIN_TOKEN}` },
            });
          } catch { /* individual tuple delete failure is non-fatal */ }
        }
      }
    } catch (e) {
      log.warn({ err: e.message }, "unload: could not clean up Keto tuples");
    }

    // ─── Cleanup: Cron job ───
    try {
      await pool.query(`SELECT cron.unschedule('sample-cleanup')`);
    } catch (e) {
      log.warn({ err: e.message }, "unload: could not unschedule cron job");
    }

    // Drop schema (includes kratos_identities tracking table, views, etc.)
    await pool.query(`DROP SCHEMA IF EXISTS sample_app CASCADE`);

    // Remove realtime subscriptions
    try {
      await pool.query(
        `DELETE FROM truss_internal.realtime_subscriptions WHERE schema_name = 'sample_app'`
      );
    } catch { /* ignore */ }

    // Remove webhooks on sample_app tables
    try {
      await pool.query(
        `DELETE FROM truss_internal.webhooks WHERE table_schema = 'sample_app'`
      );
    } catch { /* ignore */ }

    // Remove saved queries tagged with sample-app
    try {
      await pool.query(
        `DELETE FROM truss_internal.saved_queries WHERE 'sample-app' = ANY(tags)`
      );
    } catch { /* ignore */ }

    log.info("sample app unloaded");
    return res.json({ ok: true, message: "Sample app unloaded" });
  } catch (e) {
    log.error({ err: e.message }, "failed to unload sample app");
    return res.status(500).json({ error: e.message });
  }
});
