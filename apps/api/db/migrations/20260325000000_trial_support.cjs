exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Add trial columns to tenants table
    ALTER TABLE truss_internal.tenants
      ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

    -- Index for efficient cron scanning of expired trials
    CREATE INDEX IF NOT EXISTS idx_tenants_trial_expires
      ON truss_internal.tenants (trial_expires_at)
      WHERE trial_expires_at IS NOT NULL AND plan = 'trial';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS truss_internal.idx_tenants_trial_expires;
    ALTER TABLE truss_internal.tenants
      DROP COLUMN IF EXISTS trial_expires_at,
      DROP COLUMN IF EXISTS trial_started_at;
  `);
};
