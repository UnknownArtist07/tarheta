import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';

const SESSION_COOKIE = 'tarheta_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const RESERVED = new Set(['admin', 'support', 'login', 'api', 'tarheta', 'help', 'about', 'settings']);

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4_000_000) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const defaultProtocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const protocol = String(req.headers['x-forwarded-proto'] || defaultProtocol).split(',')[0].trim();
  if (!origin || !host || origin !== `${protocol}://${host}`) {
    throw Object.assign(new Error('Request origin is not allowed.'), { status: 403 });
  }
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
}

function setSessionCookie(res, token, maxAge = SESSION_MAX_AGE) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(res) {
  setSessionCookie(res, '', 0);
}

export function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

export function newPasswordCredentials(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

export function passwordMatches(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(res, userId) {
  const { sql, ready } = getDb();
  await ready;
  await sql.query('DELETE FROM tarheta_sessions WHERE expires_at <= NOW()');
  const token = randomBytes(32).toString('hex');
  // Persist only a digest so a database read cannot reveal active session cookies.
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await sql.query(
    'INSERT INTO tarheta_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')',
    [tokenHash, userId],
  );
  setSessionCookie(res, token);
}

export async function getSession(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { sql, ready } = getDb();
  await ready;
  const rows = await sql.query(
    `SELECT p.id, p.username, p.profile, p.views
     FROM tarheta_sessions s
     JOIN tarheta_profiles p ON p.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] || null;
}

export async function deleteSession(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { sql, ready } = getDb();
  await ready;
  await sql.query('DELETE FROM tarheta_sessions WHERE token_hash = $1', [tokenHash]);
}

export function profileFromRow(row) {
  if (!row) return null;
  return { ...row.profile, username: row.username, views: Number(row.views) || 0 };
}

export function validateUsername(username) {
  return /^[a-z0-9._]{3,30}$/.test(username) && !RESERVED.has(username);
}

export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Profile data is required.'), { status: 400 });
  }
  const username = String(input.username || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim();
  if (!validateUsername(username)) throw Object.assign(new Error('Choose a valid, non-reserved username.'), { status: 400 });
  if (!name || name.length > 100) throw Object.assign(new Error('Enter a name up to 100 characters.'), { status: 400 });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  const website = String(input.website || '').trim();
  if (website && !isSafeWebUrl(website)) throw Object.assign(new Error('Use a valid http or https website address.'), { status: 400 });
  const socialLinks = Array.isArray(input.socialLinks) ? input.socialLinks : [];
  if (socialLinks.length > 10 || socialLinks.some((social) =>
    !social || !String(social.label || '').trim() || String(social.label).length > 30 || !isSafeWebUrl(String(social.url || '')),
  )) {
    throw Object.assign(new Error('Each social link needs a name and a valid http or https URL.'), { status: 400 });
  }
  const profileImage = String(input.profileImage || '');
  if (profileImage.length > 2_000_000) throw Object.assign(new Error('Profile photo is too large.'), { status: 413 });
  if (profileImage && !/^data:image\/jpeg;base64,[a-z\d+/]+=*$/i.test(profileImage)) {
    throw Object.assign(new Error('Profile photo must be an optimized JPEG image.'), { status: 400 });
  }
  const cards = Array.isArray(input.cards) ? input.cards : [];
  if (cards.length > 100) throw Object.assign(new Error('A profile can contain up to 100 cards.'), { status: 400 });
  return {
    username,
    name,
    title: String(input.title || '').trim().slice(0, 100),
    organization: String(input.organization || '').trim().slice(0, 100),
    phone: String(input.phone || '').trim().slice(0, 40),
    email,
    bio: String(input.bio || '').trim().slice(0, 300),
    website,
    profileImage,
    socialLinks: socialLinks.map(({ label, url }) => ({ label: String(label).trim(), url: String(url).trim() })),
    cards,
    appearance: input.appearance && typeof input.appearance === 'object' ? input.appearance : {},
  };
}

export function isSafeWebUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function handleError(res, error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('Tarheta API request failed.', error);
  const message = typeof error?.publicMessage === 'string'
    ? error.publicMessage
    : status >= 500 ? 'A server error occurred. Please try again.' : error.message;
  send(res, status, { error: message });
}

export function newUserId() {
  return randomUUID();
}
