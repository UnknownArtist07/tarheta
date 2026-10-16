import { getDb } from '../../lib/server/db.js';
import { issueEmailChallenge, normalizeEmail } from '../../lib/server/email-challenges.js';
import { handleError, newPasswordCredentials, readJson, requireSameOrigin, send, validateProfile } from '../../lib/server/utils.js';

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
    const email = normalizeEmail(profile.email);
    profile.email = email;
    const { sql, ready } = getDb();
    await ready;
    const existing = await sql.query(
      'SELECT username FROM tarheta_profiles WHERE username = $1 OR LOWER(email) = $2 LIMIT 1',
      [profile.username, email],
    );
    if (existing.length) {
      return send(res, 409, { error: existing[0].username === profile.username ? 'That username is already taken.' : 'An account already uses that email address.' });
    }
    const credentials = newPasswordCredentials(password);
    await issueEmailChallenge({
      email,
      purpose: 'registration',
      payload: { profile, credentials },
    });
    return send(res, 200, { message: 'A verification code has been sent. It expires in 5 minutes.' });
  } catch (error) {
    return handleError(res, error);
  }
}
