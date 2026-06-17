/* eslint-disable camelcase */

// These tables are created by the billing.js bootstrapInternalSchema() at app startup,
// but migrations run before the app starts (initContainer). This migration ensures they
// exist before subsequent migrations attempt to ALTER them.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    create table if not exists truss_internal.billing_config (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists truss_internal.usage_snapshots (
      id bigserial primary key,
      db_size_bytes bigint not null default 0,
      storage_size_bytes bigint not null default 0,
      auth_mau integer not null default 0,
      captured_at timestamptz not null default now()
    );

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

    create table if not exists truss_internal.active_boosters (
      id text primary key default gen_random_uuid()::text,
      booster_key text not null,
      quantity integer not null default 1,
      purchased_at timestamptz not null default now()
    );

    create table if not exists truss_internal.billing_periods (
      id text primary key default gen_random_uuid()::text,
      period_start timestamptz not null,
      period_end timestamptz not null,
      bandwidth_bytes bigint not null default 0,
      created_at timestamptz not null default now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop table if exists truss_internal.billing_periods;
    drop table if exists truss_internal.active_boosters;
    drop table if exists truss_internal.projects;
    drop table if exists truss_internal.webhook_logs;
    drop table if exists truss_internal.webhooks;
    drop table if exists truss_internal.realtime_subscriptions;
    drop table if exists truss_internal.backups;
    drop table if exists truss_internal.branches;
    drop table if exists truss_internal.api_keys;
    drop table if exists truss_internal.usage_snapshots;
    drop table if exists truss_internal.billing_config;
  `);
};
