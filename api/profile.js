import { getDb } from '../lib/server/db.js';
import { getSession, handleError, profileFromRow, readJson, requireSameOrigin, send, validateProfile } from '../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
    const session = await getSession(req);
    if (!session) return send(res, 401, { error: 'Please sign in again.' });
    const profile = validateProfile(await readJson(req));
    const { sql, ready } = getDb();
    await ready;
    let rows;
    try {
      rows = await sql.query(
        `UPDATE tarheta_profiles
         SET username = $1, profile = $2::jsonb
         WHERE id = $3
         RETURNING username, profile, views`,
        [profile.username, JSON.stringify(profile), session.id],
      );
    } catch (error) {
      if (error.code === '23505') return send(res, 409, { error: 'That username is already taken.' });
      throw error;
    }
    if (!rows.length) return send(res, 401, { error: 'Please sign in again.' });
    return send(res, 200, { profile: profileFromRow(rows[0]) });
  } catch (error) {
    return handleError(res, error);
  }
}
