import { getDb } from '../../lib/server/db.js';
import {
  createSession, handleError, newPasswordCredentials, newUserId, profileFromRow,
  readJson, requireSameOrigin, send, validateProfile,
} from '../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 200) {
      return send(res, 400, { error: 'Choose a password between 8 and 200 characters.' });
    }
    const profile = validateProfile(body.profile);
    const credentials = newPasswordCredentials(password);
    const id = newUserId();
    const { sql, ready } = getDb();
    await ready;
    let rows;
    try {
      rows = await sql.query(
        `INSERT INTO tarheta_profiles (id, username, password_salt, password_hash, profile)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING username, profile, views`,
        [id, profile.username, credentials.salt, credentials.hash, JSON.stringify(profile)],
      );
    } catch (error) {
      if (error.code === '23505') return send(res, 409, { error: 'That username is already taken.' });
      throw error;
    }
    await createSession(res, id);
    return send(res, 201, { profile: profileFromRow(rows[0]) });
  } catch (error) {
    return handleError(res, error);
  }
}
