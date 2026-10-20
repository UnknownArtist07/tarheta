import { getDb } from '../../../lib/server/db.js';
import {
  consumeEmailChallenge, findValidChallenge, normalizeEmail, validateEmailCode,
} from '../../../lib/server/email-challenges.js';
import { enforceRateLimit, handleError, newUserId, profileFromRow, readJson, requireSameOrigin, send } from '../../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (!await enforceRateLimit(req, res, { scope: 'registration-verify', limit: 10, windowSeconds: 900 })) return;
    requireSameOrigin(req);
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    if (!email || !validateEmailCode(code)) return send(res, 400, { error: 'Enter the 6-digit code sent to your email.' });
    const { sql, ready } = getDb();
    await ready;
    const challenge = await findValidChallenge(sql, email, 'registration', code);
    if (!challenge) return send(res, 400, { error: 'That code is invalid or expired. Request a new code and try again.' });
    const pending = challenge.payload;
    if (!pending?.profile || !pending?.credentials?.salt || !pending?.credentials?.hash) {
      await consumeEmailChallenge(sql, challenge.id);
      throw new Error('Registration challenge data is incomplete.');
    }
    const existing = await sql.query(
      'SELECT username FROM tarheta_profiles WHERE username = $1 OR LOWER(email) = $2 LIMIT 1',
      [pending.profile.username, email],
    );
    if (existing.length) {
      await consumeEmailChallenge(sql, challenge.id);
      return send(res, 409, { error: existing[0].username === pending.profile.username ? 'That username is already taken.' : 'An account already uses that email address.' });
    }
    const id = newUserId();
    let rows;
    try {
      rows = await sql.query(
        `INSERT INTO tarheta_profiles (id, username, email, email_verified_at, password_salt, password_hash, profile)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6::jsonb)
         RETURNING username, profile, views`,
        [id, pending.profile.username, email, pending.credentials.salt, pending.credentials.hash, JSON.stringify(pending.profile)],
      );
    } catch (error) {
      if (error.code === '23505') return send(res, 409, { error: 'That username or email is already in use.' });
      throw error;
    }
    await consumeEmailChallenge(sql, challenge.id);
    return send(res, 201, { profile: profileFromRow(rows[0]), message: 'Email verified. Your account is ready—log in to continue.' });
  } catch (error) {
    return handleError(res, error);
  }
}
