import { randomUUID } from 'node:crypto';

const SENDER_EMAIL = 'tarheta.noreply@gmail.com';

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function encodeBody(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
}

function emailMarkup(code, purpose) {
  const action = purpose === 'registration' ? 'verify your email address' : 'reset your Tarheta password';
  const title = purpose === 'registration' ? 'One little step to get started.' : 'Let’s get you back in.';
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1eee7;padding:32px 14px;font-family:Arial,sans-serif;color:#242520">
    <table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse;background:#fffdf8;border:1px solid #ded9cf">
      <tr><td style="padding:25px 30px;border-bottom:1px solid #e8e3d9">
        <div style="font-family:Georgia,serif;font-size:23px;font-weight:bold;color:#262820">tarheta<span style="color:#c65b43">.</span></div>
        <div style="margin-top:6px;font-size:10px;letter-spacing:2px;color:#77776e">A SMALL PAGE WITH A LOT OF HEART</div>
      </td></tr>
      <tr><td style="padding:34px 30px 14px">
        <div style="font-family:Georgia,serif;font-size:26px;line-height:1.25">${title}</div>
        <p style="margin:15px 0 23px;color:#66665f;font-size:14px;line-height:1.65">Enter this code to ${action}. For your security, it expires in <strong>5 minutes</strong>.</p>
        <div style="padding:18px 14px;background:#f4f0e6;border:1px solid #e3ddcf;text-align:center;font-family:Arial,sans-serif;font-size:32px;font-weight:bold;letter-spacing:10px;color:#252720">${code}</div>
        <p style="margin:22px 0 8px;color:#66665f;font-size:13px;line-height:1.6">If you didn’t request this, you can safely ignore this email. Never share this code with anyone.</p>
      </td></tr>
      <tr><td style="padding:18px 30px 24px;border-top:1px solid #e8e3d9;color:#88877f;font-size:10px;letter-spacing:1px">MADE FOR GOOD CONNECTIONS · TARHETA</td></tr>
    </table>
  </body>
</html>`;
}

function createMimeMessage(to, code, purpose) {
  const boundary = `tarheta_${randomUUID().replaceAll('-', '')}`;
  const subject = purpose === 'registration' ? 'Your Tarheta verification code' : 'Your Tarheta password reset code';
  const action = purpose === 'registration' ? 'verify your email address' : 'reset your Tarheta password';
  const text = `Your Tarheta code is ${code}.\n\nEnter this code to ${action}. It expires in 5 minutes. If you did not request this, ignore this email. Never share the code.`;
  const html = emailMarkup(code, purpose);
  const parts = [
    `From: Tarheta <${SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(html),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(parts.join('\r\n'), 'utf8').toString('base64url');
}

async function getAccessToken() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail API credentials are not configured.');
  }
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    throw new Error('Could not reach Google OAuth to send email.');
  }
  if (!response.ok) throw new Error('Google OAuth could not authorize email sending.');
  const token = await response.json();
  if (!token.access_token) throw new Error('Google OAuth did not return an access token.');
  return token.access_token;
}

export async function sendCodeEmail(to, code, purpose) {
  const accessToken = await getAccessToken();
  let response;
  try {
    response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: createMimeMessage(to, code, purpose) }),
    });
  } catch {
    throw new Error('Could not reach Gmail to send the verification email.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    console.error('Gmail API rejected an email message.', { status: response.status, reason: result.error?.status });
    throw new Error('Gmail could not send the verification email.');
  }
}
