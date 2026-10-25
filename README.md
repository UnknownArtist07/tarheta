# Tarheta

Tarheta is a React digital calling-card app with a refreshed editorial interface. People can create an account, share a public page, save a contact, and organize links and other profile cards. It uses React with Vite, Vercel serverless functions, and Neon Postgres.

## Run locally

1. Install a supported Node.js LTS version (20 or 22 recommended).
2. In this folder, run `npm install`.
3. Link the project with `npx vercel link` and pull its environment variables with `npx vercel env pull .env.local`.
4. Run `npm run dev` and open the local URL Vercel prints.
5. Use `npm run build` to create a production build in `dist/`.

`index.html` is the React/Vite entry point. The old `Tarheta.html` address redirects to it while preserving profile query/hash parameters; use the local Vercel runtime rather than opening either HTML file directly.
The original root-level `script.js` and `style.css` are retained as inactive prototype assets; the running React UI is in `src/`.

## Neon and Vercel setup

1. Create a Neon Postgres database using the Neon integration from the Vercel project dashboard.
2. Make sure `DATABASE_URL` is available in Vercel Production and Preview. Add Development too if you want to run the serverless API locally.
3. Link the project locally and pull the `DATABASE_URL` variable with `npx vercel link` and `npx vercel env pull .env.local`.
4. Deploy with `npx vercel --prod`.

The API creates its tables on the first request. Accounts, verified account email addresses, salted password hashes, profile content, short-lived email challenges, session records, rate-limit counters, and profile-view counts are stored in Neon. Passwords are hashed server-side. Login issues a cryptographically random opaque bearer token (only its SHA-256 digest is stored in Neon) and also sets the existing HTTP-only session cookie for the browser app. Tokens expire after 30 days and are revoked on sign-out or password reset. API clients can send the login response token as `Authorization: Bearer <token>`; browser sessions continue to use the secure, same-site cookie. Treat bearer tokens as passwords; do not expose them in URLs or frontend storage. New sign-ups must verify an email code before the account is created. Password recovery also uses an email code; both codes expire after five minutes and allow a limited number of attempts.

All API routes enforce shared, database-backed rate limits so counters work across Vercel function instances. The general limit is 120 requests per IP per minute, with stricter limits on login, registration, email-code, password, profile-update, and public-profile routes. A 429 response includes `Retry-After` and rate-limit headers. Set an optional, randomly generated `RATE_LIMIT_SECRET` in Vercel to key the hashed client identifiers independently of `DATABASE_URL`; if omitted, the database connection string is used as the HMAC key. Never expose either value to frontend code or use a `VITE_` prefix.

Verification and recovery messages are sent through the Gmail API as `tarheta.noreply@gmail.com`. This uses HTTPS (not SMTP), which works with Vercel Functions. Configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as server-side Vercel environment variables alongside `DATABASE_URL`. Never use a `VITE_` prefix or put these credentials in frontend code.

To create Gmail API credentials:

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, then enable **Gmail API** under **APIs & Services → Library**.
2. Configure the OAuth consent screen. Sign in as `tarheta.noreply@gmail.com`; if the consent screen is in Testing mode, add that account as a test user. Testing-mode refresh tokens expire after seven days, so set the app to Production for ongoing use and complete any Google verification requirements shown for the Gmail sending scope.
3. Under **APIs & Services → Credentials**, create an OAuth client ID. Use a Web application client and add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
4. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), open its settings, enable **Use your own OAuth credentials**, and enter the OAuth client ID and secret.
5. In Step 1, authorize `https://www.googleapis.com/auth/gmail.send` while signed in as `tarheta.noreply@gmail.com`. In Step 2, exchange the authorization code and copy the refresh token.
6. Add the client ID, client secret, and refresh token to the Vercel project's **Settings → Environment Variables** for Production and Preview. Add Development too for local email testing. Treat all three as secrets. Redeploy after adding or changing them.

The database connection string must only be configured as a server-side environment variable; never add it to a `VITE_` variable or frontend code.

## Website feedback and support

Feedback is available from the landing page, public profiles, and the signed-in workspace at `/api/feedback` and is stored in the existing Neon Postgres database. The form accepts bug reports, problems, feature suggestions, and other notes. Reports are limited to five submissions per hour per client, and a hidden honeypot field provides basic bot protection.

### Setup

1. Add `FEEDBACK_ADMIN_PASSWORD` to `.env.local` for local development and to Vercel Production/Preview environment variables. Use a long, randomly generated password; it is never sent to the browser as configuration.
2. Keep `DATABASE_URL` and (recommended) `RATE_LIMIT_SECRET` configured as described above. The feedback table is created automatically during the first API request after deployment.
3. To create it manually instead, run this SQL in the Neon SQL editor:

```sql
CREATE TABLE IF NOT EXISTS tarheta_feedback (
  id TEXT PRIMARY KEY,
  ref_code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('bug', 'problem', 'feature', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  email TEXT,
  screenshot_url TEXT,
  page_url TEXT,
  profile_username TEXT,
  user_agent TEXT,
  screen_size TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved', 'wont_fix')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tarheta_feedback_created_idx
  ON tarheta_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS tarheta_feedback_status_idx
  ON tarheta_feedback (status);
```

4. Deploy with `npx vercel --prod`. The admin inbox is available at `/admin/feedback`; enter the value of `FEEDBACK_ADMIN_PASSWORD` to view, filter, search, and update reports.

Screenshots are resized in the browser and stored as validated data URLs in Neon because Tarheta already has a Neon backend and does not currently use Supabase Storage. `screenshot_url` is retained as the field name so the storage implementation can later be moved to object storage without changing the report shape. No Supabase bucket or service-role key is required for the current implementation.

Run `npm run dev` to use Vercel's local function runtime alongside the Vite frontend. It requires the project to be linked and `DATABASE_URL` to be present in `.env.local`.

## Profile routes and demo

Open `/` for the landing page or `/?u=demo` for the illustrative demo public profile. Hash routes such as `/#/demo` are also recognized. Other public profiles load from the API; unknown usernames show a profile-not-found screen. The app updates the browser URL when navigating between screens.

## Try contact actions

Open `/?u=demo` on a phone (or deploy the app to a reachable HTTPS URL). **Call** uses a `tel:` link, which asks the phone to open its dialer; the phone owner confirms the call. **Save contact** downloads a vCard `.vcf` file that can be opened/imported by the phone's Contacts app. Message and Email open the corresponding device apps when supported. Desktop Call/Message affordances also provide the number for copying.

## Prototype limitations

- Profile visits increment a simple database counter; it is not unique-visitor analytics.
- Social metadata is updated client-side; most messaging crawlers need server-rendered or pre-rendered profile metadata to create per-profile previews.
- Card images can use a URL or an image selected from the device. Uploaded images are resized and optimized before being saved with profile data; Tarheta does not provide managed media hosting.
- Existing accounts and profiles saved in an earlier browser `localStorage` version are not automatically imported into Neon.
- The verified account email used for password recovery is separate from the public contact email shown on the profile.

## Recommended next steps

1. Add safe media storage and upload processing for photos, video, and payment QR images.
2. Add server-rendered profile metadata for social previews and clean profile routes.
3. Add automated API tests, monitoring, database backups, and security review.
