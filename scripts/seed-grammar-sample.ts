// Minimal hand-seed of a handful of N5 grammar points, for exercising the
// grammar subsystem end-to-end before the real Bunpro seed pipeline exists
// (see scripts/seed-grammar.ts). Safe to re-run: upserts by slug.
//
// Usage: npx tsx --env-file=.env scripts/seed-grammar-sample.ts

import { prisma } from "../lib/db";

interface SampleSentence {
  japanese: string;
  english: string;
  acceptedAnswers: string[]; // must include at least one kana-only variant
}

interface SamplePoint {
  title: string;
  jlptLevel: number;
  position: number;
  meaning: string;
  structure: string;
  explanation: string;
  partOfSpeech?: string;
  slug: string;
  sentences: SampleSentence[];
}

const POINTS: SamplePoint[] = [
  {
    title: "〜ている",
    jlptLevel: 5,
    position: 1,
    meaning: "to be doing ~ / ongoing or resulting state",
    structure: "Verb (te-form) + いる",
    explanation:
      "Attaches to the te-form of a verb to show an action in progress, or the resulting state of a change.",
    partOfSpeech: "expression",
    slug: "te-iru-n5",
    sentences: [
      {
        japanese: "毎日日本語を＿＿＿。",
        english: "I study Japanese every day.",
        acceptedAnswers: ["べんきょうしている", "勉強している"],
      },
      {
        japanese: "彼は今テレビを＿＿＿。",
        english: "He is watching TV right now.",
        acceptedAnswers: ["みている", "見ている"],
      },
    ],
  },
  {
    title: "〜たい",
    jlptLevel: 5,
    position: 2,
    meaning: "want to ~",
    structure: "Verb (stem) + たい",
    explanation:
      "Attaches to the stem of a verb to express the speaker's (or, in questions, the listener's) desire to do something.",
    partOfSpeech: "expression",
    slug: "tai-n5",
    sentences: [
      {
        japanese: "すしを＿＿＿。",
        english: "I want to eat sushi.",
        acceptedAnswers: ["たべたい", "食べたい"],
      },
      {
        japanese: "日本へ＿＿＿。",
        english: "I want to go to Japan.",
        acceptedAnswers: ["いきたい", "行きたい"],
      },
    ],
  },
  {
    title: "〜ないでください",
    jlptLevel: 5,
    position: 3,
    meaning: "please don't ~",
    structure: "Verb (nai-form) + でください",
    explanation:
      "A polite request not to do something, formed from the negative te-form (nai-de) plus kudasai.",
    partOfSpeech: "expression",
    slug: "naide-kudasai-n5",
    sentences: [
      {
        japanese: "ここで＿＿＿。",
        english: "Please don't smoke here.",
        acceptedAnswers: ["すわないでください", "吸わないでください"],
      },
    ],
  },
  {
    title: "〜ことができる",
    jlptLevel: 5,
    position: 4,
    meaning: "can ~ / to be able to ~",
    structure: "Verb (dictionary form) + ことができる",
    explanation:
      "Expresses ability, attaching the dictionary form of a verb to koto ga dekiru (\"the thing of doing ~ is possible\").",
    partOfSpeech: "expression",
    slug: "koto-ga-dekiru-n5",
    sentences: [
      {
        japanese: "私はピアノを＿＿＿。",
        english: "I can play the piano.",
        acceptedAnswers: ["ひくことができる", "弾くことができる"],
      },
    ],
  },
  {
    title: "〜てもいいです",
    jlptLevel: 5,
    position: 5,
    meaning: "it's okay to ~ / may I ~",
    structure: "Verb (te-form) + もいいです",
    explanation:
      "Grants or asks for permission: the te-form plus mo ii desu (\"it's fine even if ~\").",
    partOfSpeech: "expression",
    slug: "temo-ii-desu-n5",
    sentences: [
      {
        japanese: "ここに＿＿＿。",
        english: "You may sit here.",
        acceptedAnswers: ["すわってもいいです", "座ってもいいです"],
      },
    ],
  },
];

async function main() {
  let sequence = 1;
  for (const p of POINTS.sort((a, b) => b.jlptLevel - a.jlptLevel || a.position - b.position)) {
    const point = await prisma.grammarPoint.upsert({
      where: { slug: p.slug },
      create: {
        title: p.title,
        jlptLevel: p.jlptLevel,
        position: p.position,
        sequence: sequence++,
        meaning: p.meaning,
        structure: p.structure,
        explanation: p.explanation,
        partOfSpeech: p.partOfSpeech ?? null,
        slug: p.slug,
      },
      update: {
        title: p.title,
        jlptLevel: p.jlptLevel,
        position: p.position,
        meaning: p.meaning,
        structure: p.structure,
        explanation: p.explanation,
        partOfSpeech: p.partOfSpeech ?? null,
      },
    });

    await prisma.grammarSentence.deleteMany({ where: { grammarPointId: point.id } });
    await prisma.grammarSentence.createMany({
      data: p.sentences.map((s, i) => ({
        grammarPointId: point.id,
        japanese: s.japanese,
        english: s.english,
        acceptedAnswers: JSON.stringify(s.acceptedAnswers),
        position: i,
      })),
    });
    console.log(`seeded ${p.slug} (${p.sentences.length} sentences)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
