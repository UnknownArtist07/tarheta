import { getDb } from '../../lib/server/db.js';
import { getSession, handleError, newPasswordCredentials, passwordMatches, readJson, requireSameOrigin, send } from '../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
    const session = await getSession(req);
    if (!session) return send(res, 401, { error: 'Please sign in again.' });
    const body = await readJson(req);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 200) {
      return send(res, 400, { error: 'Choose a password between 8 and 200 characters.' });
    }
    const { sql, ready } = getDb();
    await ready;
    const rows = await sql.query(
      'SELECT password_salt, password_hash FROM tarheta_profiles WHERE id = $1 LIMIT 1',
      [session.id],
    );
    const account = rows[0];
    if (!account || !passwordMatches(currentPassword, account.password_salt, account.password_hash)) {
      return send(res, 400, { error: 'That current password is incorrect.' });
    }
    const credentials = newPasswordCredentials(newPassword);
    await sql.query(
      'UPDATE tarheta_profiles SET password_salt = $1, password_hash = $2 WHERE id = $3',
      [credentials.salt, credentials.hash, session.id],
    );
    return send(res, 200, { ok: true });
  } catch (error) {
    return handleError(res, error);
  }
}
