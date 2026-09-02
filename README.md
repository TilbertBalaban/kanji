# KaniLocal

A web app for learning Japanese: kanji, radicals, vocabulary, and grammar,
drilled with a spaced-repetition system (SRS) in the style of WaniKani and
Bunpro.

## What it does

- Syncs your real WaniKani account (levels, unlocks, review queue) and lets you
  run reviews and lessons here, at your own pace.
- Bunpro-style grammar path with lessons, example sentences, and audio.
- Custom vocabulary decks you add yourself, reviewed alongside the synced items.
- KaniWani-style recall prompts: English to Japanese, not just recognition.
- Level browser for every radical, kanji, and vocabulary item.

Stack: Next.js (App Router), Prisma on Neon Postgres, Clerk auth, deployed on
Vercel with images and audio mirrored to Cloudflare R2.

For personal study use only. The WaniKani and Bunpro content it syncs is not
redistributable.

## Try it

Live: <https://kanji-phi-eight.vercel.app/sign-in>

1. Create an account on the sign-up page (email + password).
2. Paste your own WaniKani API token on `/profile` and press **Sync** to pull your
   levels, unlocks, and review queue.
3. Open `/reviews` or `/lessons` and study. Without a WaniKani token you can
   still browse `/radicals`, `/kanji`, `/vocabulary`, and `/grammar`.

## Setup

1. `cp .env.example .env` and fill it in (Neon, Clerk, WaniKani API key, R2 —
   each variable is documented in the file).
2. `npm install` (runs `prisma generate`).
3. `npm run migrate:deploy` to create the schema.
4. `npm run seed` to load the WaniKani subject catalog, then
   `npm run mirror:assets` to mirror images/audio to R2.
5. Optional grammar path: `npm run seed:grammar` and
   `npm run mirror:grammar-audio` (needs `BUNPRO_SESSION_COOKIE`).
6. `npm run dev` and open <http://localhost:3000>.

Each user signs up via Clerk, saves their own WaniKani API token on
`/profile`, and syncs their account progress from there.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm test` | Vitest unit tests (answer checker, SRS math, …) |
| `npm run lint` | ESLint |
| `npm run seed` | Seed/refresh the WaniKani subject catalog |
| `npm run sync` | Sync one account's assignments from WaniKani (see `/profile`) |
| `npm run sync:content` | Pull WaniKani content updates (also runs weekly via cron) |
| `npm run mirror:assets` | Mirror subject images/audio to R2 |
| `npm run seed:grammar` | Seed the Bunpro grammar catalog (owner-run) |

See `DEPLOY.md` for the full Vercel/Neon/R2 deployment walkthrough and
`AGENTS.md` for repo conventions.
