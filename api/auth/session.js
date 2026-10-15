import { clearSessionCookie, deleteSession, getSession, handleError, profileFromRow, requireSameOrigin, send } from '../../lib/server/utils.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const session = await getSession(req);
      if (!session) return send(res, 401, { error: 'You are not signed in.' });
      return send(res, 200, { profile: profileFromRow(session) });
    }
    if (req.method === 'DELETE') {
      requireSameOrigin(req);
      await deleteSession(req);
      clearSessionCookie(res);
      return send(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return handleError(res, error);
  }
}
