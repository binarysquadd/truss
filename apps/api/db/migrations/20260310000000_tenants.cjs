/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS truss_internal.tenants (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      identity_id text NOT NULL UNIQUE,
      email text NOT NULL,
      display_name text NOT NULL DEFAULT '',
      plan text NOT NULL DEFAULT 'hobby',
      is_admin boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    );

    -- Ensure dev tenant exists
    INSERT INTO truss_internal.tenants (id, identity_id, email, display_name, plan, is_admin)
    VALUES ('local', 'local', 'dev@localhost', 'Local Dev', 'business', true)
    ON CONFLICT (id) DO NOTHING;

    -- Add tenant_id to existing tables (nullable for migration)
    ALTER TABLE truss_internal.projects ADD COLUMN IF NOT EXISTS tenant_id text;
    ALTER TABLE truss_internal.active_boosters ADD COLUMN IF NOT EXISTS tenant_id text;
    ALTER TABLE truss_internal.billing_periods ADD COLUMN IF NOT EXISTS tenant_id text;
    ALTER TABLE truss_internal.usage_snapshots ADD COLUMN IF NOT EXISTS tenant_id text;
    ALTER TABLE truss_internal.saved_queries ADD COLUMN IF NOT EXISTS tenant_id text;
    ALTER TABLE truss_internal.audit_logs ADD COLUMN IF NOT EXISTS tenant_id text;

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON truss_internal.projects(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_boosters_tenant_id ON truss_internal.active_boosters(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_billing_periods_tenant_id ON truss_internal.billing_periods(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON truss_internal.audit_logs(tenant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS truss_internal.idx_audit_logs_tenant_id;
    DROP INDEX IF EXISTS truss_internal.idx_billing_periods_tenant_id;
    DROP INDEX IF EXISTS truss_internal.idx_boosters_tenant_id;
    DROP INDEX IF EXISTS truss_internal.idx_projects_tenant_id;
    ALTER TABLE truss_internal.audit_logs DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE truss_internal.saved_queries DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE truss_internal.usage_snapshots DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE truss_internal.billing_periods DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE truss_internal.active_boosters DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE truss_internal.projects DROP COLUMN IF EXISTS tenant_id;
    DROP TABLE IF EXISTS truss_internal.tenants;
  `);
};
