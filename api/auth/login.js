import { getDb } from '../../lib/server/db.js';
import { createSession, enforceRateLimit, handleError, passwordMatches, profileFromRow, readJson, requireSameOrigin, send, SESSION_MAX_AGE } from '../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (!await enforceRateLimit(req, res, { scope: 'login', limit: 10, windowSeconds: 900 })) return;
    requireSameOrigin(req, { allowMissingOrigin: true });
    const body = await readJson(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const { sql, ready } = getDb();
    await ready;
    const rows = await sql.query(
      'SELECT id, username, password_salt, password_hash, profile, views FROM tarheta_profiles WHERE username = $1 LIMIT 1',
      [username],
    );
    const account = rows[0];
    if (!account || password.length > 200 || !passwordMatches(password, account.password_salt, account.password_hash)) {
      return send(res, 401, { error: 'Username or password is incorrect.' });
    }
    const token = await createSession(res, account.id);
    return send(res, 200, {
      profile: profileFromRow(account),
      token,
      tokenType: 'Bearer',
      expiresIn: SESSION_MAX_AGE,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
