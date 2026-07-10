# Deploying KaniLocal (Vercel + Neon Postgres)

The app uses Postgres in production and [Clerk](https://clerk.com) for
authentication: each user registers their own account (email + password or
whatever methods you enable in the Clerk dashboard).

## Environment variables

| Var | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | local + Vercel | Neon **pooled** connection string (host contains `-pooler`), `?sslmode=require` |
| `DIRECT_URL` | local + Vercel | Neon **direct** connection string (no `-pooler`), used for migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | local + Vercel | Clerk publishable key (dashboard → API Keys) |
| `CLERK_SECRET_KEY` | local + Vercel | Clerk secret key (dashboard → API Keys) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | local + Vercel | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | local + Vercel | `/sign-up` |
| `WANIKANI_API_KEY` | local + Vercel | seeds subject content; on Vercel, used by the weekly content-update cron |
| `CRON_SECRET` | Vercel | random string protecting `/api/cron/sync-content`; Vercel Cron sends it automatically |

See `.env.example`.

## 1. Create the database (Neon)

1. Create a free project at https://neon.tech.
2. From the dashboard, copy **both** connection strings:
   - Pooled (has `-pooler` in the host) → `DATABASE_URL`
   - Direct (no `-pooler`) → `DIRECT_URL`
3. Put them (plus the Clerk keys and `WANIKANI_API_KEY`) into `.env`.

## 2. Create tables + load content (run once, from your machine)

```bash
npm run migrate:deploy   # creates the tables in Neon
npm run seed             # loads ~9,367 WaniKani subjects (per-user unlocks happen on first sign-in)
```

`seed` is idempotent and re-runnable. It reads `WANIKANI_API_KEY` from `.env`.

## 3. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import Project** from the repo (framework auto-detected as Next.js).
3. Add the env vars from the table above (Production **and** Preview):
   `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`,
   `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `WANIKANI_API_KEY`, `CRON_SECRET`.
4. Deploy. The build runs `prisma generate && next build`.
5. Open the URL → sign up (or sign in) with your own account.

## Weekly content updates

WaniKani ships content updates roughly weekly (updated mnemonics, readings,
new context sentences, …). `vercel.json` schedules a Vercel Cron job every
Friday 09:00 UTC that hits `/api/cron/sync-content`, which upserts every
subject WaniKani changed in the last 30 days (the overlap makes runs
idempotent and covers missed weeks). User progress, notes, and synonyms are
untouched.

- Requires `WANIKANI_API_KEY` and `CRON_SECRET` in the Vercel project env.
- Run it manually from your machine with `npm run sync:content` (optionally
  `npm run sync:content -- 90` for a 90-day lookback), or
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/sync-content`.
- Note: on the Vercel Hobby plan, cron runs can fire at any minute within the
  scheduled hour.

## Asset mirror on Cloudflare R2 (images + audio)

Radical character images and vocabulary pronunciation audio are mirrored into
a Cloudflare R2 bucket and the `Subject` rows point at its public URLs — the
app does not depend on `files.wanikani.com` at runtime, and the repo stays
free of binary assets. The content sync preserves these URLs on update;
brand-new subjects arrive with WaniKani URLs, so after a sync introduces new
subjects run (from your machine — nothing R2-related is needed on Vercel):

```bash
npm run mirror:assets   # uploads any WaniKani-hosted assets to R2, repoints the DB
```

It is idempotent (already-uploaded objects and already-repointed rows are
skipped) and retries are safe.

One-time bucket setup (Cloudflare dashboard → R2):

1. Create the bucket (`wanikani-assets`) and enable public access on it
   (Settings → Public access → r2.dev subdomain, or attach a custom domain).
2. Create an API token with Object Read & Write on the bucket.
3. Fill in the `R2_*` variables in `.env` (see `.env.example`).
4. Add a CORS rule on the bucket allowing `GET` from your app origins —
   required because the radical SVGs are used as CSS `mask` images, which
   browsers fetch in CORS mode:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "MaxAgeSeconds": 86400 }]
```

The mirrored files are for personal study use only — keep the bucket URL
private and do not redistribute them.

## Users

Anyone can register via `/sign-up` (restrict sign-ups in the Clerk dashboard
if you want an invite-only instance). Progress rows are keyed by the Clerk
user id and initialize automatically on first sign-in. Each user saves their
own WaniKani API token on `/profile` (stored in Clerk private metadata) and
syncs from there.

To carry over progress recorded under the old fixed roster, map the old name
to the new Clerk user id (shown on the user's page in the Clerk dashboard):

```bash
npm run migrate:user -- Tilbert user_2abc123...
```

## Notes
- The Neon free tier auto-suspends when idle; the first request after a pause
  has a short cold start. Fine for a handful of users.
- Local dev now needs a Postgres `DATABASE_URL` too — use a Neon branch or the
  same database. SQLite (`prisma/dev.db`) is no longer used.
