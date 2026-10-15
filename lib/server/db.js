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
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          profile JSONB NOT NULL,
          views INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql.query(`
        CREATE TABLE IF NOT EXISTS tarheta_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES tarheta_profiles(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await sql.query('CREATE INDEX IF NOT EXISTS tarheta_sessions_expiry_idx ON tarheta_sessions (expires_at)');
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return { sql, ready: schemaReady };
}
