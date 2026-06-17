/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // New environments table — represents production/staging/preview contexts within a project
  pgm.sql(`
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_project_slug
      ON truss_internal.environments(project_id, slug);
    CREATE INDEX IF NOT EXISTS idx_environments_tenant
      ON truss_internal.environments(tenant_id);
  `);

  // Add project_id + environment_id to branches (currently orphaned from projects)
  pgm.sql(`
    ALTER TABLE truss_internal.branches ADD COLUMN IF NOT EXISTS project_id text;
    ALTER TABLE truss_internal.branches ADD COLUMN IF NOT EXISTS environment_id text;
    CREATE INDEX IF NOT EXISTS idx_branches_project ON truss_internal.branches(project_id);
    CREATE INDEX IF NOT EXISTS idx_branches_environment ON truss_internal.branches(environment_id);
  `);

  // Add environment_id to api_keys (nullable — existing keys stay project-scoped)
  pgm.sql(`
    ALTER TABLE truss_internal.api_keys ADD COLUMN IF NOT EXISTS environment_id text;
    CREATE INDEX IF NOT EXISTS idx_api_keys_environment ON truss_internal.api_keys(environment_id);
  `);

  // Backfill: create "Production" environment for every existing active project
  pgm.sql(`
    INSERT INTO truss_internal.environments (project_id, name, slug, db_name, schema_name, bucket_name, is_default, tenant_id)
    SELECT p.id, 'Production', 'production', p.db_name, p.schema_name, p.bucket_name, true, p.tenant_id
    FROM truss_internal.projects p
    WHERE p.status != 'deleted'
      AND NOT EXISTS (SELECT 1 FROM truss_internal.environments e WHERE e.project_id = p.id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS truss_internal.environments;`);
  pgm.sql(`ALTER TABLE truss_internal.branches DROP COLUMN IF EXISTS project_id;`);
  pgm.sql(`ALTER TABLE truss_internal.branches DROP COLUMN IF EXISTS environment_id;`);
  pgm.sql(`ALTER TABLE truss_internal.api_keys DROP COLUMN IF EXISTS environment_id;`);
};
