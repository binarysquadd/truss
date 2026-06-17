/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
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
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists truss_internal.audit_logs_action_created_at_idx;
    drop table if exists truss_internal.audit_logs;
    drop table if exists truss_internal.saved_queries;
    drop schema if exists truss_internal;
  `);
};
