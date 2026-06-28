/* eslint-disable camelcase */

exports.shorthands = undefined;

// Repairs schema drift on the feature-flag tables.
//
// These tables were originally created by an in-code `CREATE TABLE IF NOT EXISTS`
// block (src/routes/flags.js). When created_at/updated_at were later added to
// that block, databases that already had the tables kept the OLD definition
// (CREATE TABLE IF NOT EXISTS is a no-op once the table exists), so the new
// columns — and the index on flag_evaluation_log(created_at) — were never added.
// That mismatch surfaced as `column "created_at" does not exist` (flags 500) and
// aborted the demo seed.
//
// This migration brings any drifted database up to the current definition.
// Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS make it a
// no-op on fresh or already-correct databases.
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS truss_internal.flag_environments
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    ALTER TABLE IF EXISTS truss_internal.flag_evaluation_log
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_flag_evaluation_log_created
      ON truss_internal.flag_evaluation_log(created_at DESC);
  `);
};

// Forward-only: dropping columns that may hold data is more dangerous than the
// drift this fixes.
exports.down = () => {};
