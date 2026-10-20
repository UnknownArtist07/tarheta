import { getDb } from '../../lib/server/db.js';
import { enforceRateLimit, handleError, isSafeWebUrl, profileFromRow, send } from '../../lib/server/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (!await enforceRateLimit(req, res, { scope: 'public-profile', limit: 60, windowSeconds: 60 })) return;
    const username = String(req.query.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(username)) return send(res, 404, { error: 'Profile not found.' });
    const { sql, ready } = getDb();
    await ready;
    const rows = await sql.query(
      `UPDATE tarheta_profiles
       SET views = views + 1
       WHERE username = $1
       RETURNING username, profile, views`,
      [username],
    );
    if (!rows.length) return send(res, 404, { error: 'Profile not found.' });
    const profile = profileFromRow(rows[0]);
    profile.cards = (Array.isArray(profile.cards) ? profile.cards : []).filter((card) => card?.isPublic);
    profile.socialLinks = (Array.isArray(profile.socialLinks) ? profile.socialLinks : [])
      .filter((link) => link && link.label && isSafeWebUrl(String(link.url || '')));
    return send(res, 200, { profile });
  } catch (error) {
    return handleError(res, error);
  }
}
