// Real N5→N1 grammar catalog seed, sourced from the owner's own Bunpro
// account (see lib/bunpro-scraper.ts and grammar-plan.md — Bunpro's old
// public API is retired, so this reads the same page data the owner's
// browser would). One-time / re-runnable: upserts by Bunpro's slug, and
// caches each fetched page to disk so a re-run (or the later audio-mirror
// step) doesn't re-hit Bunpro's servers for pages already fetched.
//
// Sentences are upserted by (grammarPointId, position) rather than
// deleted+recreated, so their ids — and any audioUrl already mirrored to R2
// by scripts/mirror-grammar-audio.ts — survive a re-run. Re-seeding used to
// delete+recreate every sentence, silently orphaning mirrored audio; see the
// GrammarSentence schema comment.
//
// Usage: BUNPRO_SESSION_COOKIE must be set (see .env).
//   ./node_modules/.bin/tsx --env-file=.env scripts/seed-grammar.ts

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GRAMMAR_BLANK } from "../lib/grammar";
import {
  type BunproCatalogPoint,
  type BunproPointDetail,
  fetchCatalog,
  fetchPointDetail,
  sleep,
} from "../lib/bunpro-scraper";
import { prisma } from "../lib/db";

// v2: includes writeup + relations alongside sentences (v1 cache only held
// sentences and is no longer compatible — see git history if you need it).
const CACHE_DIR = path.join(__dirname, "..", ".bunpro-cache-v2");
// Politeness delay between per-point requests — this is a personal account
// scraping its own paid content, not a bulk crawl; no reason to hammer it.
const REQUEST_DELAY_MS = 400;

// The quiz input converts every keystroke through wanakana.toKana, so typing
// can only ever produce kana — hiragana, katakana, or the prolonged-sound
// mark. A sentence whose accepted answers all contain kanji is unanswerable.
const KANA_ONLY_RE = /^[ぁ-ゖァ-ヺー]+$/;

/**
 * The plan's hard seed-time invariants (see grammar-plan.md "Risks"): every
 * sentence must carry at least one kana-only accepted answer, and exactly one
 * cloze blank (the quiz card splits on the first GRAMMAR_BLANK — a second one
 * would render as raw text, none would show the sentence with no gap). Fail
 * loudly rather than seed an unstudiable point.
 */
function assertStudiable(slug: string, sentences: BunproPointDetail["sentences"]) {
  for (const s of sentences) {
    const blanks = s.japanese.split(GRAMMAR_BLANK).length - 1;
    if (blanks !== 1) {
      throw new Error(
        `${slug} (question ${s.bunproId}): expected exactly one cloze blank, found ${blanks}: ${s.japanese}`,
      );
    }
    if (!s.acceptedAnswers.some((a) => KANA_ONLY_RE.test(a))) {
      throw new Error(
        `${slug} (question ${s.bunproId}): no kana-only accepted answer — the quiz input ` +
          `can't type kanji. Answers: ${s.acceptedAnswers.join("、")}`,
      );
    }
  }
}

async function cachedDetail(
  sessionCookie: string,
  point: BunproCatalogPoint,
): Promise<BunproPointDetail> {
  const cachePath = path.join(CACHE_DIR, `${point.id}.json`);
  try {
    const cached = await readFile(cachePath, "utf-8");
    return JSON.parse(cached);
  } catch {
    // not cached yet — fetch below
  }
  const detail = await fetchPointDetail(sessionCookie, point.id, GRAMMAR_BLANK);
  await writeFile(cachePath, JSON.stringify(detail, null, 2));
  await sleep(REQUEST_DELAY_MS);
  return detail;
}

async function main() {
  const sessionCookie = process.env.BUNPRO_SESSION_COOKIE;
  if (!sessionCookie) {
    throw new Error("BUNPRO_SESSION_COOKIE is not set — see .env");
  }
  await mkdir(CACHE_DIR, { recursive: true });

  console.log("Fetching Bunpro catalog…");
  const catalog = await fetchCatalog(sessionCookie);
  console.log(`Catalog: ${catalog.length} JLPT grammar points (N5→N1)`);

  // position = ordinal within its own JLPT level, using Bunpro's own
  // grammar_order (already N5→N1 sequential) as the tiebreak.
  const positionByLevel = new Map<number, number>();

  let sequence = 1;
  let seeded = 0;
  let skippedNoSentences = 0;
  const details = new Map<number, BunproPointDetail>();
  const pointIdByBunproId = new Map<number, number>();
  const seededSlugs = new Set<string>();

  // Pass 1: points + sentences. Collects seededSlugs so pass 2 can drop
  // relation links to points that got skipped (no usable sentences).
  for (const bp of catalog) {
    const position = (positionByLevel.get(bp.jlptLevel) ?? 0) + 1;
    positionByLevel.set(bp.jlptLevel, position);

    const detail = await cachedDetail(sessionCookie, bp);
    details.set(bp.id, detail);

    if (detail.sentences.length === 0) {
      // No validated cloze sentences to quiz with — skip rather than seed an
      // unstudiable point (mirrors the plan's "kana-only variant required").
      skippedNoSentences++;
      sequence++;
      continue;
    }
    assertStudiable(bp.slug, detail.sentences);

    const point = await prisma.grammarPoint.upsert({
      where: { slug: bp.slug },
      create: {
        title: bp.title,
        jlptLevel: bp.jlptLevel,
        position,
        sequence,
        lessonId: bp.lessonId,
        lessonDescription: bp.lessonDescription,
        meaning: bp.meaning,
        structure: bp.structure,
        explanation: bp.explanation,
        partOfSpeech: bp.partOfSpeech,
        register: bp.register,
        wordType: bp.wordType ?? "",
        caution: bp.caution,
        aboutIntro: detail.writeup.introText,
        aboutIntroExamples: JSON.stringify(detail.writeup.introExamples),
        aboutCautions: JSON.stringify(detail.writeup.cautions),
        slug: bp.slug,
      },
      update: {
        title: bp.title,
        jlptLevel: bp.jlptLevel,
        position,
        sequence,
        lessonId: bp.lessonId,
        lessonDescription: bp.lessonDescription,
        meaning: bp.meaning,
        structure: bp.structure,
        explanation: bp.explanation,
        partOfSpeech: bp.partOfSpeech,
        register: bp.register,
        wordType: bp.wordType ?? "",
        caution: bp.caution,
        aboutIntro: detail.writeup.introText,
        aboutIntroExamples: JSON.stringify(detail.writeup.introExamples),
        aboutCautions: JSON.stringify(detail.writeup.cautions),
      },
    });
    pointIdByBunproId.set(bp.id, point.id);
    seededSlugs.add(bp.slug);

    for (const [i, s] of detail.sentences.entries()) {
      await prisma.grammarSentence.upsert({
        where: { grammarPointId_position: { grammarPointId: point.id, position: i } },
        create: {
          grammarPointId: point.id,
          bunproId: s.bunproId,
          japanese: s.japanese,
          english: s.english,
          acceptedAnswers: JSON.stringify(s.acceptedAnswers),
          audioUrl: s.audioUrl,
          position: i,
        },
        // audioUrl is deliberately omitted from update: once mirrored to R2
        // by scripts/mirror-grammar-audio.ts it must not be overwritten back
        // to the Bunpro/CDN URL by a later re-seed of the same content.
        update: {
          bunproId: s.bunproId,
          japanese: s.japanese,
          english: s.english,
          acceptedAnswers: JSON.stringify(s.acceptedAnswers),
        },
      });
    }
    // A shorter re-run may leave stale trailing sentences (old position N+
    // that the new fetch no longer has) — prune them.
    await prisma.grammarSentence.deleteMany({
      where: { grammarPointId: point.id, position: { gte: detail.sentences.length } },
    });

    seeded++;
    sequence++;
    if (seeded % 50 === 0) console.log(`…${seeded}/${catalog.length}`);
  }

  // Pass 2: synonym/antonym/related links, now that we know which slugs
  // actually got seeded (skips dangling links to skipped points).
  let relationsSeeded = 0;
  for (const bp of catalog) {
    const pointId = pointIdByBunproId.get(bp.id);
    if (!pointId) continue;
    const detail = details.get(bp.id)!;
    const relations = detail.relations.filter(
      (r) => r.otherIsGrammarPoint && seededSlugs.has(r.otherSlug),
    );
    await prisma.grammarRelation.deleteMany({ where: { grammarPointId: pointId } });
    if (relations.length === 0) continue;
    await prisma.grammarRelation.createMany({
      data: relations.map((r) => ({
        grammarPointId: pointId,
        relationshipType: r.relationshipType,
        body: r.body,
        otherSlug: r.otherSlug,
        otherTitle: r.otherTitle,
        otherMeaning: r.otherMeaning,
      })),
    });
    relationsSeeded += relations.length;
  }

  console.log(
    `Done: seeded ${seeded} points (${relationsSeeded} relations), skipped ${skippedNoSentences} with no usable sentences.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
