/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Tracks provisioned per-tenant databases
    CREATE TABLE IF NOT EXISTS truss_internal.tenant_databases (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id text NOT NULL,
      db_name text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'suspended', 'deleted')),
      schema_version integer NOT NULL DEFAULT 1,
      pg_size_bytes bigint DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_health_check timestamptz
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_databases_tenant_id ON truss_internal.tenant_databases(tenant_id);

    -- Add db_name column to projects for tracking which database a project lives in
    ALTER TABLE truss_internal.projects ADD COLUMN IF NOT EXISTS db_name text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE truss_internal.projects DROP COLUMN IF EXISTS db_name;
    DROP TABLE IF EXISTS truss_internal.tenant_databases;
  `);
};
