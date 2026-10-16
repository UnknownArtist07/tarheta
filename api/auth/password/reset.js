import { getDb } from '../../../lib/server/db.js';
import {
  consumeEmailChallenge, findValidChallenge, normalizeEmail, validateEmailCode,
} from '../../../lib/server/email-challenges.js';
import { handleError, newPasswordCredentials, readJson, requireSameOrigin, send } from '../../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const newPassword = String(body.newPassword || '');
    if (!email || !validateEmailCode(code)) return send(res, 400, { error: 'Enter the 6-digit code sent to your email.' });
    if (newPassword.length < 8 || newPassword.length > 200) {
      return send(res, 400, { error: 'Choose a password between 8 and 200 characters.' });
    }
    const { sql, ready } = getDb();
    await ready;
    const challenge = await findValidChallenge(sql, email, 'password_reset', code);
    if (!challenge) return send(res, 400, { error: 'That code is invalid or expired. Request a new code and try again.' });
    const userId = challenge.payload?.userId;
    if (!userId) {
      await consumeEmailChallenge(sql, challenge.id);
      throw new Error('Password reset challenge data is incomplete.');
    }
    const credentials = newPasswordCredentials(newPassword);
    const rows = await sql.query(
      'UPDATE tarheta_profiles SET password_salt = $1, password_hash = $2 WHERE id = $3 AND LOWER(email) = $4 RETURNING id',
      [credentials.salt, credentials.hash, userId, email],
    );
    if (!rows.length) {
      await consumeEmailChallenge(sql, challenge.id);
      return send(res, 400, { error: 'That code is invalid or expired. Request a new code and try again.' });
    }
    await sql.query('DELETE FROM tarheta_sessions WHERE user_id = $1', [userId]);
    await consumeEmailChallenge(sql, challenge.id);
    return send(res, 200, { ok: true, message: 'Your password has been changed. Log in with your new password.' });
  } catch (error) {
    return handleError(res, error);
  }
}
