import { randomInt, timingSafeEqual } from 'node:crypto';
import { getDb } from '../lib/server/db.js';
import { enforceRateLimit, handleError, readJson, requireSameOrigin, send } from '../lib/server/utils.js';

const TYPES = new Set(['bug', 'problem', 'feature', 'other']);
const SEVERITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['new', 'in_progress', 'resolved', 'wont_fix']);
const MAX_SCREENSHOT_LENGTH = 2_500_000;

function adminPasswordMatches(value) {
  const expected = process.env.FEEDBACK_ADMIN_PASSWORD;
  if (!expected || typeof value !== 'string') return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req) {
  if (!adminPasswordMatches(req.headers['x-admin-password'])) {
    throw Object.assign(new Error('Admin password is required.'), { status: 401 });
  }
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function validateScreenshot(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > MAX_SCREENSHOT_LENGTH || !/^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/]+=*$/i.test(value)) {
    throw Object.assign(new Error('Screenshot must be a PNG, JPG, or WebP image under 5 MB.'), { status: 400 });
  }
  return value;
}

function makeReference() {
  return `TH-${randomInt(100000, 1000000)}`;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      if (!await enforceRateLimit(req, res, { scope: 'feedback', limit: 5, windowSeconds: 60 * 60 })) return;
      requireSameOrigin(req, { allowMissingOrigin: true });
      const body = await readJson(req);
      const type = cleanText(body.type, 20);
      const title = cleanText(body.title, 100);
      const description = cleanText(body.description, 1000);
      const severity = body.severity ? cleanText(body.severity, 10) : null;
      if (!TYPES.has(type)) throw Object.assign(new Error('Choose a valid feedback type.'), { status: 400 });
      if (!title) throw Object.assign(new Error('A title is required.'), { status: 400 });
      if (description.length < 10) throw Object.assign(new Error('Please add at least 10 characters to the description.'), { status: 400 });
      if ((type === 'bug' || type === 'problem') && !SEVERITIES.has(severity)) throw Object.assign(new Error('Choose a severity.'), { status: 400 });
      if (body.website) return send(res, 201, { refCode: makeReference() });
      const email = cleanText(body.email, 254).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid contact email.'), { status: 400 });
      const { sql, ready } = getDb();
      await ready;
      const refCode = makeReference();
      await sql.query(
        `INSERT INTO tarheta_feedback
          (ref_code, type, title, description, severity, email, screenshot_url, page_url, profile_username, user_agent, screen_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [refCode, type, title, description, severity, email || null, validateScreenshot(body.screenshot), cleanText(body.pageUrl, 2000), cleanText(body.profileUsername, 30), cleanText(body.userAgent, 500), cleanText(body.screenSize, 30)],
      );
      return send(res, 201, { refCode });
    }
    requireAdmin(req);
    const { sql, ready } = getDb();
    await ready;
    if (req.method === 'GET') {
      const query = req.query || {};
      const type = TYPES.has(query.type) ? query.type : '';
      const severity = SEVERITIES.has(query.severity) ? query.severity : '';
      const status = STATUSES.has(query.status) ? query.status : '';
      const search = cleanText(query.q, 100);
      const rows = await sql.query(
        `SELECT id, ref_code, type, title, description, severity, email, screenshot_url, page_url,
          profile_username, user_agent, screen_size, status, created_at
         FROM tarheta_feedback
         WHERE ($1 = '' OR type = $1) AND ($2 = '' OR severity = $2) AND ($3 = '' OR status = $3)
           AND ($4 = '' OR title ILIKE '%' || $4 || '%' OR description ILIKE '%' || $4 || '%')
         ORDER BY created_at DESC LIMIT 500`,
        [type, severity, status, search],
      );
      return send(res, 200, { reports: rows });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const status = cleanText(body.status, 20);
      if (!body.id || !STATUSES.has(status)) throw Object.assign(new Error('Choose a valid report status.'), { status: 400 });
      const rows = await sql.query('UPDATE tarheta_feedback SET status = $1 WHERE id = $2 RETURNING id, status', [status, body.id]);
      if (!rows.length) return send(res, 404, { error: 'Feedback report not found.' });
      return send(res, 200, rows[0]);
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return handleError(res, error);
  }
}
