import { getDb } from '../../../lib/server/db.js';
import { issueEmailChallenge, normalizeEmail } from '../../../lib/server/email-challenges.js';
import { enforceRateLimit, handleError, readJson, requireSameOrigin, send } from '../../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (!await enforceRateLimit(req, res, { scope: 'code-resend', limit: 5, windowSeconds: 900 })) return;
    requireSameOrigin(req);
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const purpose = String(body.purpose || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['registration', 'password_reset'].includes(purpose)) {
      return send(res, 400, { error: 'A valid email and code type are required.' });
    }
    const { sql, ready } = getDb();
    await ready;
    if (purpose === 'registration') {
      const challenges = await sql.query(
        `SELECT payload FROM tarheta_email_challenges
         WHERE email = $1 AND purpose = 'registration' AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      if (!challenges.length) return send(res, 400, { error: 'Start creating your account again to request a new verification code.' });
      await issueEmailChallenge({ email, purpose, payload: challenges[0].payload });
    } else {
      const accounts = await sql.query('SELECT id FROM tarheta_profiles WHERE LOWER(email) = $1 LIMIT 1', [email]);
      if (accounts.length) {
        try {
          await issueEmailChallenge({ email, purpose, payload: { userId: accounts[0].id } });
        } catch (error) {
          if (error.status !== 429) throw error;
        }
      }
    }
    return send(res, 200, { message: 'If eligible, a fresh code has been sent. Codes expire in 5 minutes.' });
  } catch (error) {
    return handleError(res, error);
  }
}
