---
name: verify
description: Build, launch, and drive the KaniLocal Next.js app to verify changes end-to-end (Clerk auth, dashboard, reviews).
---

# Verifying changes in this repo

## Launch

```bash
npm run dev   # Next 16 dev server detaches (prints PID); server on http://localhost:3000
```

The background task "fails" with exit code 1 after detaching — that's normal; check `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` (307 = up, redirecting to sign-in).

## Authenticate (Clerk)

All pages and `/api/*` require a Clerk session (`401` unauthenticated). Mint a sign-in token with the backend API and consume it via the ticket param:

```bash
export $(grep CLERK_SECRET_KEY .env)
# find user id (Tilbert = tilbert.balaban@gmail.com)
curl -s "https://api.clerk.com/v1/users?limit=5" -H "Authorization: Bearer $CLERK_SECRET_KEY" -o users.json
# mint token
curl -s -X POST "https://api.clerk.com/v1/sign_in_tokens" -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  -H "Content-Type: application/json" -d '{"user_id":"<id>","expires_in_seconds":600}' -o token.json
```

Then navigate the browser (chrome-devtools MCP) to
`http://localhost:3000/sign-in?__clerk_ticket=<token>` — it signs in automatically after a few seconds; then navigate to the page under test. Authenticated API responses can be fetched from the page with `evaluate_script` + `fetch("/api/…")`.

## Gotchas

- After a Prisma schema change, `prisma generate` alone is not enough for the dev server — Next's build cache keeps the old client and API routes 500 with `Unknown field … for select statement`. Kill the server and `rm -rf .next` before relaunching.

- Quote Clerk API URLs (`?` triggers zsh glob errors) and dump curl JSON to a file — the rtk hook can mangle inline output.
- An external process auto-commits the working tree with generated messages; a "clean" `git status` mid-session may mean your edits were already committed. Check `git log` before assuming changes vanished.
- The DB is Neon Postgres (real user data) — verify read-only; don't submit reviews/lessons against it casually.
