import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';
import { sendCodeEmail } from './mailer.js';

const CHALLENGE_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function codeHash(id, purpose, code) {
  const secret = process.env.DATABASE_URL;
  if (!secret) throw new Error('DATABASE_URL is not configured.');
  return createHmac('sha256', secret).update(`${id}:${purpose}:${code}`).digest('hex');
}

export async function issueEmailChallenge({ email, purpose, payload = null }) {
  const { sql, ready } = getDb();
  await ready;
  const recent = await sql.query(
    `SELECT id FROM tarheta_email_challenges
     WHERE email = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '${RESEND_COOLDOWN_SECONDS} seconds'
     LIMIT 1`,
    [email, purpose],
  );
  if (recent.length) {
    throw Object.assign(new Error('Please wait a minute before requesting another code.'), { status: 429 });
  }
  await sql.query('DELETE FROM tarheta_email_challenges WHERE expires_at <= NOW() OR (email = $1 AND purpose = $2)', [email, purpose]);
  const id = randomUUID();
  const code = String(randomInt(100_000, 1_000_000));
  await sql.query(
    `INSERT INTO tarheta_email_challenges (id, email, purpose, code_hash, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '${CHALLENGE_TTL_MINUTES} minutes')`,
    [id, email, purpose, codeHash(id, purpose, code), payload ? JSON.stringify(payload) : null],
  );
  try {
    await sendCodeEmail(email, code, purpose);
  } catch (error) {
    await sql.query('DELETE FROM tarheta_email_challenges WHERE id = $1', [id]);
    throw error;
  }
}

export async function findValidChallenge(sql, email, purpose, code) {
  const rows = await sql.query(
    `SELECT id, code_hash, payload, attempts
     FROM tarheta_email_challenges
     WHERE email = $1 AND purpose = $2 AND expires_at > NOW() AND attempts < $3
     ORDER BY created_at DESC LIMIT 1`,
    [email, purpose, MAX_ATTEMPTS],
  );
  const challenge = rows[0];
  if (!challenge) return null;
  const actual = Buffer.from(codeHash(challenge.id, purpose, code), 'hex');
  const expected = Buffer.from(challenge.code_hash, 'hex');
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) return challenge;
  const attempts = await sql.query(
    'UPDATE tarheta_email_challenges SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING attempts',
    [challenge.id, MAX_ATTEMPTS],
  );
  if (Number(attempts[0]?.attempts) >= MAX_ATTEMPTS) {
    await sql.query('DELETE FROM tarheta_email_challenges WHERE id = $1', [challenge.id]);
  }
  return null;
}

export async function consumeEmailChallenge(sql, challengeId) {
  await sql.query('DELETE FROM tarheta_email_challenges WHERE id = $1', [challengeId]);
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmailCode(value) {
  return /^\d{6}$/.test(String(value || '').trim());
}
