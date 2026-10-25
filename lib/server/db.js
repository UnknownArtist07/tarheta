import { neon } from '@neondatabase/serverless';

let sql;
let schemaReady; // Reuse schema initialization across warm serverless invocations.

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!sql) sql = neon(process.env.DATABASE_URL);
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_profiles (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT,
          email_verified_at TIMESTAMPTZ,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          profile JSONB NOT NULL,
          views INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql.query('ALTER TABLE tarheta_profiles ADD COLUMN IF NOT EXISTS email TEXT');
      await sql.query('ALTER TABLE tarheta_profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
      await sql.query(`
        UPDATE tarheta_profiles
        SET email = LOWER(profile->>'email')
        WHERE email IS NULL AND profile->>'email' IS NOT NULL
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_profiles_email_idx ON tarheta_profiles (LOWER(email)) WHERE email IS NOT NULL');
      await sql.query('CREATE UNIQUE INDEX IF NOT EXISTS tarheta_profiles_verified_email_idx ON tarheta_profiles (LOWER(email)) WHERE email_verified_at IS NOT NULL');
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES tarheta_profiles(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_sessions_expiry_idx ON tarheta_sessions (expires_at)');
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_rate_limits (
          key_hash TEXT NOT NULL,
          window_seconds INTEGER NOT NULL,
          window_id BIGINT NOT NULL,
          requests INTEGER NOT NULL,
          PRIMARY KEY (key_hash, window_seconds, window_id)
        )
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_rate_limits_cleanup_idx ON tarheta_rate_limits (window_seconds, window_id)');
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_email_challenges (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'password_reset')),
          code_hash TEXT NOT NULL,
          payload JSONB,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_email_challenges_lookup_idx ON tarheta_email_challenges (email, purpose, created_at DESC)');
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_email_challenges_expiry_idx ON tarheta_email_challenges (expires_at)');
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_feedback (
          id TEXT PRIMARY KEY,
          ref_code TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK (type IN ('bug', 'problem', 'feature', 'other')),
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
          email TEXT,
          screenshot_url TEXT,
          page_url TEXT,
          profile_username TEXT,
          user_agent TEXT,
          screen_size TEXT,
          status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'wont_fix')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_feedback_created_idx ON tarheta_feedback (created_at DESC)');
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_feedback_status_idx ON tarheta_feedback (status)');
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return { sql, ready: schemaReady };
}
