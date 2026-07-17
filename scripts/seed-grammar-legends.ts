// Seeds the GrammarLegend table — Bunpro's explainer modals (Parts of Speech
// Legend, Word Type Legend, Register, Structure Legend, All Technical Terms)
// that back the info dots on grammar pages. Site-wide static content, so this
// is a single scrape, not a per-point crawl: one page fetch plus a walk of
// Bunpro's webpack chunks to find the translation bundle (see
// lib/bunpro-scraper.ts fetchLegendSources). Owner-run against the owner's
// own account, like scripts/seed-grammar.ts.
//
// Raw sources are cached so re-runs (or assembleLegends changes) don't
// re-hit Bunpro — same philosophy as seed-grammar.ts's raw cache.
//
// Usage:
//   ./node_modules/.bin/tsx --env-file=.env scripts/seed-grammar-legends.ts

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleLegends,
  type BunproLegendSources,
  fetchLegendSources,
} from "../lib/bunpro-scraper";
import { prisma } from "../lib/db";

const CACHE_PATH = path.join(__dirname, "..", ".bunpro-cache-raw", "legend-sources.json");

async function cachedSources(sessionCookie: string): Promise<BunproLegendSources> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf-8"));
  } catch {
    const sources = await fetchLegendSources(sessionCookie);
    await mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(sources));
    return sources;
  }
}

async function main() {
  const sessionCookie = process.env.BUNPRO_SESSION_COOKIE;
  if (!sessionCookie) {
    throw new Error("BUNPRO_SESSION_COOKIE is not set — see .env");
  }

  console.log("Fetching legend sources…");
  const sources = await cachedSources(sessionCookie);
  console.log(`Sources ready (${Object.keys(sources.terms).length} glossary terms).`);

  const legends = assembleLegends(sources);
  for (const legend of legends) {
    const data = JSON.stringify(legend.data);
    await prisma.grammarLegend.upsert({
      where: { key: legend.key },
      create: { key: legend.key, data },
      update: { data },
    });
    const rows = legend.data.sections.reduce((n, s) => n + (s.rows?.length ?? 0), 0);
    console.log(`  ${legend.key}: ${rows} rows`);
  }
  console.log(`Done: seeded ${legends.length} legends.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
