import { getPool } from "./state.js";
import { getS3Client } from "./s3.js";
import { ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

// ─── truss_internal schema bootstrap ───
// Creates the core tables Truss needs to operate as a single-instance BaaS.
// Billing-only tables (subscriptions, active_boosters, usage_snapshots, payment_events,
// billing_periods, etc.) live in the private truss-cloud repo and are NOT created here.
//
// NOTE: the settings key/value store table is named `billing_config` in SQL. The name is
// kept as-is — it is the internal settings store, NOT a billing table. Renaming it would
// require a migration and risk breaking existing deployments, so the legacy name stays.

let _ensuredPromise = null;
export function ensureInternalSchema() {
  if (_ensuredPromise) return _ensuredPromise;
  const pool = getPool();
  if (!pool) return Promise.resolve();
  _ensuredPromise = pool.query(`
    create schema if not exists truss_internal;

    create table if not exists truss_internal.saved_queries (
      id text primary key,
      name text not null,
      sql_text text not null,
      schema_name text,
      tags text[] not null default '{}',
      created_by text not null default 'truss',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists truss_internal.audit_logs (
      id bigserial primary key,
      actor text not null default 'system',
      action text not null,
      resource_type text not null,
      resource_id text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists audit_logs_action_created_at_idx
      on truss_internal.audit_logs (action, created_at desc);

    -- Internal settings key/value store (legacy SQL table name: billing_config).
    -- This is NOT a billing table — it holds general settings (plan flag, oidc_*,
    -- smtp_*, active_org preference, backup_schedule, etc.) via getSettingsConfig()
    -- and upsertSettingsKey(). The name is preserved to avoid a risky migration.
    create table if not exists truss_internal.billing_config (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    );
    alter table truss_internal.billing_config add column if not exists tenant_id text;

    create table if not exists truss_internal.api_keys (
      id text primary key default gen_random_uuid()::text,
      key_type text not null default 'anon' check (key_type in ('anon', 'service_role')),
      key_prefix text not null,
      key_hash text not null,
      label text not null default '',
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked boolean not null default false
    );

    create table if not exists truss_internal.branches (
      id text primary key default gen_random_uuid()::text,
      parent_db text not null,
      branch_db text not null,
      label text not null default '',
      created_at timestamptz not null default now(),
      status text not null default 'active' check (status in ('active', 'deleted')),
      ttl_hours integer not null default 0
    );

    create table if not exists truss_internal.backups (
      id text primary key default gen_random_uuid()::text,
      filename text not null,
      size_bytes bigint not null default 0,
      status text not null default 'running' check (status in ('running', 'completed', 'failed')),
      created_at timestamptz not null default now(),
      completed_at timestamptz
    );

    create table if not exists truss_internal.realtime_subscriptions (
      id text primary key default gen_random_uuid()::text,
      schema_name text not null default 'public',
      table_name text not null,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      unique (schema_name, table_name)
    );

    create table if not exists truss_internal.webhooks (
      id text primary key default gen_random_uuid()::text,
      name text not null default '',
      table_schema text not null default 'public',
      table_name text not null,
      events text[] not null default '{INSERT,UPDATE,DELETE}',
      url text not null,
      headers jsonb not null default '{}'::jsonb,
      secret text not null default '',
      active boolean not null default true,
      created_at timestamptz not null default now(),
      last_fired_at timestamptz,
      fail_count integer not null default 0
    );

    create table if not exists truss_internal.webhook_logs (
      id bigserial primary key,
      webhook_id text not null references truss_internal.webhooks(id) on delete cascade,
      event_type text not null,
      payload jsonb not null default '{}'::jsonb,
      status_code integer,
      response_body text,
      latency_ms integer,
      created_at timestamptz not null default now()
    );

    create table if not exists truss_internal.projects (
      id text primary key default gen_random_uuid()::text,
      name text not null,
      slug text not null,
      region text not null default 'india-mumbai',
      db_mode text not null default 'shared' check (db_mode in ('shared', 'dedicated')),
      status text not null default 'provisioning' check (status in ('provisioning', 'active', 'paused', 'deleted')),
      schema_name text not null,
      bucket_name text not null,
      anon_key text,
      service_role_key text,
      db_connection_string text,
      api_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    -- Per-tenant unique slug (not global — multiple tenants can have "default" slug)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_tenant ON truss_internal.projects(slug, tenant_id);
    -- Drop legacy global unique if it exists
    ALTER TABLE truss_internal.projects DROP CONSTRAINT IF EXISTS projects_slug_key;

    alter table truss_internal.api_keys add column if not exists project_id text;
    alter table truss_internal.api_keys add column if not exists rate_limit integer;

    create table if not exists truss_internal.tenants (
      id text primary key default gen_random_uuid()::text,
      identity_id text not null unique,
      email text not null,
      display_name text not null default '',
      plan text not null default 'starter',
      is_admin boolean not null default false,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      last_login_at timestamptz,
      updated_at timestamptz
    );

    -- Add status + updated_at columns if table already exists
    ALTER TABLE truss_internal.tenants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    ALTER TABLE truss_internal.tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz;

    -- Ensure a "local" dev tenant exists for TRUSS_AUTH_REQUIRED=false mode
    insert into truss_internal.tenants (id, identity_id, email, display_name, plan, is_admin)
    values ('local', 'local', 'dev@localhost', 'Local Dev', 'business', true)
    on conflict (id) do nothing;

    -- Add tenant_id to existing tables (nullable for migration)
    alter table truss_internal.projects add column if not exists tenant_id text;
    alter table truss_internal.saved_queries add column if not exists tenant_id text;
    alter table truss_internal.audit_logs add column if not exists tenant_id text;

    alter table truss_internal.branches add column if not exists tenant_id text;
    alter table truss_internal.webhooks add column if not exists tenant_id text;
    alter table truss_internal.api_keys add column if not exists tenant_id text;
    alter table truss_internal.backups add column if not exists tenant_id text;
    alter table truss_internal.realtime_subscriptions add column if not exists tenant_id text;
    create index if not exists idx_realtime_subs_tenant_id on truss_internal.realtime_subscriptions(tenant_id);

    alter table truss_internal.projects add column if not exists org_id text;
    create index if not exists idx_projects_org_id on truss_internal.projects(org_id);

    create index if not exists idx_projects_tenant_id on truss_internal.projects(tenant_id);
    create index if not exists idx_audit_logs_tenant_id on truss_internal.audit_logs(tenant_id);
    create index if not exists idx_branches_tenant_id on truss_internal.branches(tenant_id);
    create index if not exists idx_webhooks_tenant_id on truss_internal.webhooks(tenant_id);
    create index if not exists idx_api_keys_tenant_id on truss_internal.api_keys(tenant_id);

    -- Drop FK constraint on projects.tenant_id if it exists (was added in early migration, now plain text)
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'truss_internal.projects'::regclass
        AND confrelid = 'truss_internal.tenants'::regclass
      ) THEN
        EXECUTE 'ALTER TABLE truss_internal.projects DROP CONSTRAINT ' ||
          (SELECT conname FROM pg_constraint WHERE conrelid = 'truss_internal.projects'::regclass AND confrelid = 'truss_internal.tenants'::regclass LIMIT 1);
      END IF;
    END $$;

    -- Migrate billing_config PK from (key) to composite (key, tenant_id) for multi-tenant support
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'billing_config_pkey'
        AND conrelid = 'truss_internal.billing_config'::regclass
      ) THEN
        ALTER TABLE truss_internal.billing_config DROP CONSTRAINT billing_config_pkey;
      END IF;
    END $$;
    -- Drop old COALESCE-based index if it exists (was not IMMUTABLE)
    DROP INDEX IF EXISTS truss_internal.billing_config_tenant_key_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS billing_config_tenant_key_idx
      ON truss_internal.billing_config (key, tenant_id) WHERE tenant_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS billing_config_global_key_idx
      ON truss_internal.billing_config (key) WHERE tenant_id IS NULL;

    -- Migrate realtime_subscriptions unique constraint to include tenant_id
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'realtime_subscriptions_schema_name_table_name_key'
        AND conrelid = 'truss_internal.realtime_subscriptions'::regclass
      ) THEN
        ALTER TABLE truss_internal.realtime_subscriptions
          DROP CONSTRAINT realtime_subscriptions_schema_name_table_name_key;
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS realtime_subs_tenant_schema_table_idx
      ON truss_internal.realtime_subscriptions (schema_name, table_name, tenant_id) WHERE tenant_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS realtime_subs_global_schema_table_idx
      ON truss_internal.realtime_subscriptions (schema_name, table_name) WHERE tenant_id IS NULL;

    -- ─── Observability & Analytics tables ───

    create table if not exists truss_internal.request_logs (
      id bigserial primary key,
      method varchar(10) not null,
      path varchar(500) not null,
      status_code smallint,
      latency_ms integer,
      response_bytes integer default 0,
      api_key_id text,
      tenant_id text,
      ip_address varchar(45),
      request_id text,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_request_logs_tenant_created on truss_internal.request_logs(tenant_id, created_at);
    create index if not exists idx_request_logs_created on truss_internal.request_logs(created_at);

    create table if not exists truss_internal.error_logs (
      id bigserial primary key,
      error_type varchar(100) not null default 'UnknownError',
      message text,
      stack_trace text,
      endpoint varchar(500),
      status_code smallint,
      tenant_id text,
      request_id text,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_error_logs_tenant_created on truss_internal.error_logs(tenant_id, created_at);

    -- Add request_id columns to existing tables (idempotent)
    DO $$ BEGIN
      ALTER TABLE truss_internal.request_logs ADD COLUMN IF NOT EXISTS request_id text;
      ALTER TABLE truss_internal.error_logs ADD COLUMN IF NOT EXISTS request_id text;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;

    create table if not exists truss_internal.login_history (
      id bigserial primary key,
      tenant_id text,
      identity_id text,
      ip_address varchar(45),
      user_agent text,
      success boolean not null default true,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_login_history_tenant_created on truss_internal.login_history(tenant_id, created_at);

    create table if not exists truss_internal.feature_usage (
      id bigserial primary key,
      tenant_id text,
      feature varchar(50) not null,
      action varchar(100) not null,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_feature_usage_feature_created on truss_internal.feature_usage(feature, created_at);
    create index if not exists idx_feature_usage_tenant_created on truss_internal.feature_usage(tenant_id, created_at);

    create table if not exists truss_internal.security_events (
      id bigserial primary key,
      event_type varchar(50) not null,
      details jsonb not null default '{}'::jsonb,
      ip_address varchar(45),
      tenant_id text,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_security_events_type_created on truss_internal.security_events(event_type, created_at);

    create table if not exists truss_internal.saved_connections (
      id text primary key default gen_random_uuid()::text,
      tenant_id text not null,
      name text not null,
      connection_url text not null,
      created_at timestamptz not null default now(),
      unique(tenant_id, name)
    );

    -- ─── Organization tables ───

    create table if not exists truss_internal.organizations (
      id text primary key default gen_random_uuid()::text,
      name text not null,
      slug text not null unique,
      plan text not null default 'starter',
      owner_tenant_id text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists truss_internal.org_members (
      id text primary key default gen_random_uuid()::text,
      org_id text not null references truss_internal.organizations(id) on delete cascade,
      tenant_id text not null,
      role varchar(20) not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
      invited_at timestamptz not null default now(),
      joined_at timestamptz
    );
    create unique index if not exists idx_org_members_unique on truss_internal.org_members(org_id, tenant_id);

    create table if not exists truss_internal.invitations (
      id text primary key default gen_random_uuid()::text,
      org_id text not null references truss_internal.organizations(id) on delete cascade,
      email text not null,
      role varchar(20) not null default 'member',
      token text not null unique,
      expires_at timestamptz not null,
      accepted_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_invitations_token on truss_internal.invitations(token);
    create index if not exists idx_invitations_org on truss_internal.invitations(org_id);

    -- ─── Environments table (project → environment hierarchy) ───

    CREATE TABLE IF NOT EXISTS truss_internal.environments (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      project_id text NOT NULL,
      name text NOT NULL,
      slug text NOT NULL,
      db_name text,
      schema_name text NOT NULL,
      bucket_name text NOT NULL,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_default boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      tenant_id text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_project_slug ON truss_internal.environments(project_id, slug);
    CREATE INDEX IF NOT EXISTS idx_environments_tenant ON truss_internal.environments(tenant_id);

    -- ─── Gateway rules table (tenant-scoped Oathkeeper rules) ───

    CREATE TABLE IF NOT EXISTS truss_internal.gateway_rules (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      rule_id text NOT NULL,
      match_url text NOT NULL,
      match_methods text[] NOT NULL DEFAULT '{}',
      authenticator jsonb NOT NULL DEFAULT '{}'::jsonb,
      authorizer jsonb NOT NULL DEFAULT '{}'::jsonb,
      mutator jsonb NOT NULL DEFAULT '{}'::jsonb,
      upstream_url text,
      description text DEFAULT '',
      tenant_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_rules_rule_tenant ON truss_internal.gateway_rules(rule_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_gateway_rules_tenant ON truss_internal.gateway_rules(tenant_id);

    -- Add environment columns to branches and api_keys
    ALTER TABLE truss_internal.branches ADD COLUMN IF NOT EXISTS project_id text;
    ALTER TABLE truss_internal.branches ADD COLUMN IF NOT EXISTS environment_id text;
    ALTER TABLE truss_internal.api_keys ADD COLUMN IF NOT EXISTS environment_id text;

    insert into truss_internal.billing_config (key, value)
    values ('plan', 'starter'), ('deployment', 'self-hosted')
    on conflict do nothing;
  `).catch(err => { _ensuredPromise = null; throw err; });
  return _ensuredPromise;
}

// ─── Storage / Auth measurement helpers ───
// Pure measurement utilities used by the admin overview + /v1 status endpoints.

export async function measureStorageSizeBytes() {
  try {
    const client = getS3Client();
    const bucketsResp = await client.send(new ListBucketsCommand({}));
    let total = 0;
    for (const bucket of bucketsResp.Buckets || []) {
      let token;
      do {
        const listResp = await client.send(
          new ListObjectsV2Command({ Bucket: bucket.Name, ContinuationToken: token })
        );
        for (const obj of listResp.Contents || []) total += obj.Size || 0;
        token = listResp.NextContinuationToken;
      } while (token);
    }
    return total;
  } catch {
    return 0;
  }
}

export async function measureAuthMau() {
  const pool = getPool();
  if (!pool) return 0;
  try {
    // Count active tenants (identities that logged in within the last 30 days)
    const result = await pool.query(
      `SELECT count(*)::int AS mau FROM truss_internal.tenants
       WHERE last_login_at > now() - interval '30 days' AND status = 'active'`
    );
    return result.rows[0]?.mau || 0;
  } catch {
    return 0;
  }
}

// ─── Settings key/value store ───
// Backed by the truss_internal.billing_config table (legacy name — see note above).

export async function getSettingsConfig(tenantId = null) {
  const pool = getPool();
  if (!pool) return {};
  try {
    await ensureInternalSchema();
    if (tenantId) {
      // Merge global defaults with tenant-specific overrides
      const result = await pool.query(
        `select key, value, tenant_id from truss_internal.billing_config WHERE tenant_id IS NULL OR tenant_id = $1`,
        [tenantId]
      );
      // Tenant-specific rows override global ones
      const global = {};
      const tenant = {};
      for (const r of result.rows) {
        if (r.tenant_id) tenant[r.key] = r.value;
        else global[r.key] = r.value;
      }
      return { ...global, ...tenant };
    }
    const result = await pool.query(`select key, value from truss_internal.billing_config WHERE tenant_id IS NULL`);
    return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function upsertSettingsKey(key, value, tenantId = null) {
  const pool = getPool();
  await ensureInternalSchema();
  if (tenantId) {
    // Tenant-specific upsert — check for existing row with same key+tenant
    const existing = await pool.query(
      `SELECT 1 FROM truss_internal.billing_config WHERE key = $1 AND tenant_id = $2`,
      [key, tenantId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE truss_internal.billing_config SET value = $1, updated_at = now() WHERE key = $2 AND tenant_id = $3`,
        [String(value), key, tenantId]
      );
    } else {
      await pool.query(
        `INSERT INTO truss_internal.billing_config (key, value, tenant_id, updated_at) VALUES ($1, $2, $3, now())`,
        [key, String(value), tenantId]
      );
    }
  } else {
    // Global upsert (legacy — no tenant_id)
    const existing = await pool.query(
      `SELECT 1 FROM truss_internal.billing_config WHERE key = $1 AND tenant_id IS NULL`,
      [key]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE truss_internal.billing_config SET value = $1, updated_at = now() WHERE key = $2 AND tenant_id IS NULL`,
        [String(value), key]
      );
    } else {
      await pool.query(
        `INSERT INTO truss_internal.billing_config (key, value, updated_at) VALUES ($1, $2, now())`,
        [key, String(value)]
      );
    }
  }
}

// ─── Audit Logging ───

export async function writeAuditLog(actor, action, resourceType, resourceId, payload = {}, tenantId = null) {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO truss_internal.audit_logs (actor, action, resource_type, resource_id, payload, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor || 'system', action, resourceType, resourceId || null, JSON.stringify(payload), tenantId]
    );
  } catch { /* fail silently — audit logging should never break the main operation */ }
}
