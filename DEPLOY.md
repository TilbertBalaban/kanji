# Deploying KaniLocal (Vercel + Neon Postgres)

The app uses Postgres in production and a lightweight shared-password login
(one password for everyone, then pick your name). No registration.

## Environment variables

| Var | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | local + Vercel | Neon **pooled** connection string (host contains `-pooler`), `?sslmode=require` |
| `DIRECT_URL` | local + Vercel | Neon **direct** connection string (no `-pooler`), used for migrations |
| `APP_PASSWORD` | local + Vercel | the single shared login password |
| `AUTH_SECRET` | local + Vercel | random string used to sign cookies (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |
| `WANIKANI_API_KEY` | local only | only needed to seed subject content |

See `.env.example`.

## 1. Create the database (Neon)

1. Create a free project at https://neon.tech.
2. From the dashboard, copy **both** connection strings:
   - Pooled (has `-pooler` in the host) → `DATABASE_URL`
   - Direct (no `-pooler`) → `DIRECT_URL`
3. Put them (plus `APP_PASSWORD`, `AUTH_SECRET`, `WANIKANI_API_KEY`) into `.env`.

## 2. Create tables + load content (run once, from your machine)

```bash
npm run migrate:deploy   # creates the tables in Neon
npm run seed             # loads ~9,367 WaniKani subjects + unlocks level-1 radicals for both users
```

`seed` is idempotent and re-runnable. It reads `WANIKANI_API_KEY` from `.env`.

## 3. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import Project** from the repo (framework auto-detected as Next.js).
3. Add the env vars from the table above (Production **and** Preview):
   `DATABASE_URL`, `DIRECT_URL`, `APP_PASSWORD`, `AUTH_SECRET`.
   (You do **not** need `WANIKANI_API_KEY` on Vercel — seeding is done from your machine.)
4. Deploy. The build runs `prisma generate && next build`.
5. Open the URL → enter `APP_PASSWORD` → pick a user.

## Adding / changing users

Edit `USER_IDS` in `lib/users.ts` (max ~10 for this setup). Everyone shares the
same `APP_PASSWORD`. New users initialize their own progress on first login.

## Notes

- Changing `AUTH_SECRET` logs everyone out (existing cookies stop verifying).
- The Neon free tier auto-suspends when idle; the first request after a pause
  has a short cold start. Fine for a handful of users.
- Local dev now needs a Postgres `DATABASE_URL` too — use a Neon branch or the
  same database. SQLite (`prisma/dev.db`) is no longer used.
