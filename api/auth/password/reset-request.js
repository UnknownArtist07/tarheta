import { getDb } from '../../../lib/server/db.js';
import { issueEmailChallenge, normalizeEmail } from '../../../lib/server/email-challenges.js';
import { handleError, readJson, requireSameOrigin, send } from '../../../lib/server/utils.js';

const GENERIC_MESSAGE = 'If an account uses that email address, a reset code will arrive shortly. It expires in 5 minutes.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return send(res, 400, { error: 'Enter a valid email address.' });
    }
    const { sql, ready } = getDb();
    await ready;
    const rows = await sql.query('SELECT id FROM tarheta_profiles WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (rows.length) {
      try {
        await issueEmailChallenge({ email, purpose: 'password_reset', payload: { userId: rows[0].id } });
      } catch (error) {
        if (error.status !== 429) throw error;
      }
    }
    return send(res, 200, { message: GENERIC_MESSAGE });
  } catch (error) {
    return handleError(res, error);
  }
}
