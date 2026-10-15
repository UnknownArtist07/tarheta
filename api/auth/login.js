import { getDb } from '../../lib/server/db.js';
import { createSession, handleError, passwordMatches, readJson, requireSameOrigin, send, profileFromRow } from '../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
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
    await createSession(res, account.id);
    return send(res, 200, { profile: profileFromRow(account) });
  } catch (error) {
    return handleError(res, error);
  }
}
