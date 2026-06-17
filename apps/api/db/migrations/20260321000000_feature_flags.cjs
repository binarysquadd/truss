exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Feature flags: main flag definitions
    CREATE TABLE truss_internal.feature_flags (
      id SERIAL PRIMARY KEY,
      flag_key VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      flag_type VARCHAR(20) NOT NULL DEFAULT 'boolean',
      state VARCHAR(20) DEFAULT 'DISABLED',
      variants JSONB NOT NULL DEFAULT '{"on": true, "off": false}',
      default_variant VARCHAR(255) DEFAULT 'off',
      targeting JSONB,
      metadata JSONB DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      tenant_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by VARCHAR(255) DEFAULT 'system'
    );

    -- Flag segments: reusable targeting segments (mapped to flagd $evaluators)
    CREATE TABLE truss_internal.flag_segments (
      id SERIAL PRIMARY KEY,
      segment_key VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      rules JSONB NOT NULL DEFAULT '{}',
      tenant_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by VARCHAR(255) DEFAULT 'system'
    );

    -- Flag environments: per-environment flag overrides
    CREATE TABLE truss_internal.flag_environments (
      id SERIAL PRIMARY KEY,
      flag_id INTEGER REFERENCES truss_internal.feature_flags(id) ON DELETE CASCADE,
      environment VARCHAR(50) NOT NULL DEFAULT 'production',
      state VARCHAR(20) DEFAULT 'DISABLED',
      targeting JSONB,
      rollout_pct INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by VARCHAR(255),
      UNIQUE(flag_id, environment)
    );

    -- Flag evaluation log: evaluation history
    CREATE TABLE truss_internal.flag_evaluation_log (
      id BIGSERIAL PRIMARY KEY,
      flag_key VARCHAR(255) NOT NULL,
      environment VARCHAR(50),
      context JSONB,
      variant VARCHAR(255),
      reason VARCHAR(50),
      duration_ms INTEGER,
      evaluated_at TIMESTAMPTZ DEFAULT NOW(),
      tenant_id VARCHAR(255)
    );

    -- Indexes
    CREATE INDEX idx_feature_flags_tenant_state ON truss_internal.feature_flags(tenant_id, state);
    CREATE INDEX idx_feature_flags_flag_key ON truss_internal.feature_flags(flag_key);
    CREATE INDEX idx_flag_segments_tenant ON truss_internal.flag_segments(tenant_id);
    CREATE INDEX idx_flag_evaluation_log_key_time ON truss_internal.flag_evaluation_log(flag_key, evaluated_at DESC);
    CREATE INDEX idx_flag_evaluation_log_tenant_time ON truss_internal.flag_evaluation_log(tenant_id, evaluated_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS truss_internal.flag_evaluation_log;
    DROP TABLE IF EXISTS truss_internal.flag_environments;
    DROP TABLE IF EXISTS truss_internal.flag_segments;
    DROP TABLE IF EXISTS truss_internal.feature_flags;
  `);
};
