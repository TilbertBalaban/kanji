// Bunpro's public catalog API (api.bunpro.jp/user/{api_key}/...) has been
// retired — see grammar-plan.md's "Risks" section. The only remaining source
// for the full N5→N1 grammar catalog is Bunpro's own Next.js pages, which
// embed their page data as JSON in a __NEXT_DATA__ script tag (server-side
// props, not a documented API). This reads that embedded JSON from two page
// types the user's authenticated session can already reach:
//   - /grammar_points        — the full catalog in one page (~979 points)
//   - /grammar_points/{id}   — one point's example sentences, About writeup,
//                              and synonym/antonym/related links
//
// This is a one-time, owner-run seed script against the owner's own paid
// account, not a redistributed scraping product — see grammar-plan.md.

const USER_AGENT = "Mozilla/5.0 (compatible; KaniLocal grammar seed script)";

function extractNextData(html: string): any {
  const match = html.match(/__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Could not find __NEXT_DATA__ in Bunpro response — page shape may have changed");
  return JSON.parse(match[1]);
}

async function fetchBunproHtml(
  path: string,
  sessionCookie: string,
  attempt = 1,
): Promise<string> {
  const res = await fetch(`https://bunpro.jp${path}`, {
    headers: {
      Cookie: `remember_user_token=${sessionCookie}`,
      "User-Agent": USER_AGENT,
    },
  });
  // Rate-limited: back off and retry rather than aborting a long seed run.
  if (res.status === 429 && attempt <= 5) {
    await sleep(15_000 * attempt);
    return fetchBunproHtml(path, sessionCookie, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Bunpro request failed: ${path} -> ${res.status}`);
  }
  return res.text();
}

export const JLPT_LEVEL_MAP: Record<string, number> = {
  JLPT5: 5,
  JLPT4: 4,
  JLPT3: 3,
  JLPT2: 2,
  JLPT1: 1,
};

export interface BunproCatalogPoint {
  id: number;
  slug: string;
  title: string;
  jlptLevel: number;
  grammarOrder: number;
  lessonId: number;
  lessonDescription: string;
  meaning: string;
  structure: string;
  explanation: string;
  partOfSpeech: string | null;
  register: string | null;
  wordType: string | null;
  caution: string;
}

// Strips Bunpro's inline <strong>/<span> markup from prose fields we store as
// plain text (structure/explanation render as-is in our UI, unlike Bunpro's
// own richer renderer).
function stripMarkup(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/**
 * The full grammar catalog in a single request. Filtered to the fixed N5→N1
 * path (Non-JLPT and 関西弁 entries are out of scope per grammar-plan.md) and
 * sorted by Bunpro's own global grammar_order, which is already N5→N1
 * sequential — exactly the fixed path this feature wants.
 */
export async function fetchCatalog(sessionCookie: string): Promise<BunproCatalogPoint[]> {
  const html = await fetchBunproHtml("/grammar_points", sessionCookie);
  const data = extractNextData(html);
  const raw: any[] = data.props.pageProps.grammarPoints;
  const lessons: any[] = data.props.pageProps.lessons ?? [];
  const lessonDescById = new Map<number, string>(lessons.map((l) => [l.id, l.description]));

  return raw
    .filter((g) => g.level in JLPT_LEVEL_MAP)
    .map((g) => {
      const structure = stripMarkup(
        [g.casual_structure, g.polite_structure].filter(Boolean).join(" / "),
      );
      return {
        id: g.id,
        slug: g.slug,
        title: g.title,
        jlptLevel: JLPT_LEVEL_MAP[g.level],
        grammarOrder: g.grammar_order,
        lessonId: g.lesson_id,
        lessonDescription: lessonDescById.get(g.lesson_id) ?? "",
        meaning: g.meaning,
        structure,
        explanation: stripMarkup(g.nuance_translation || g.nuance || ""),
        partOfSpeech: g.part_of_speech_translation || null,
        register: g.register_translation || null,
        wordType: g.word_type_translation || null,
        caution: stripMarkup(g.caution || "").trim(),
      };
    })
    .sort((a, b) => a.grammarOrder - b.grammarOrder);
}

export interface BunproSentence {
  bunproId: number; // Bunpro's study_question id — cited by aboutCautions/aboutIntroExampleIds
  japanese: string; // Bunpro's "____" blank already normalized to GRAMMAR_BLANK
  english: string;
  acceptedAnswers: string[];
  audioUrl: string | null;
}

// Bunpro clozes use a run of ASCII underscores for the blank; normalize to
// our own GRAMMAR_BLANK marker (see lib/grammar.ts) so downstream rendering
// doesn't need to know about the source format.
const BUNPRO_BLANK_RE = /_{2,}/;

function questionToExample(q: any, blankMarker: string): BunproWriteupExample {
  return {
    japanese: stripMarkup(q.content).replace(BUNPRO_BLANK_RE, blankMarker),
    english: stripMarkup(q.translation || ""),
    audioUrl: q.female_audio_url || q.male_audio_url || null,
  };
}

function parseSentences(questions: any[], blankMarker: string): BunproSentence[] {
  return questions
    .filter((q) => q.question_type === "cloze" && q.validation_status === "validated")
    .sort((a, b) => a.sentence_order - b.sentence_order)
    .map((q) => {
      const answers = new Set<string>();
      if (q.answer) answers.add(q.answer);
      if (q.kanji_answer) answers.add(q.kanji_answer);
      for (const a of q.alternate_grammar ?? []) answers.add(a);
      for (const a of q.kanji_alt_grammar ?? []) answers.add(a);
      return {
        bunproId: q.id,
        japanese: stripMarkup(q.content).replace(BUNPRO_BLANK_RE, blankMarker),
        english: stripMarkup(q.translation || ""),
        acceptedAnswers: [...answers],
        audioUrl: q.female_audio_url || q.male_audio_url || null,
      };
    })
    .filter((s) => s.acceptedAnswers.length > 0);
}

export interface BunproWriteupExample {
  japanese: string;
  english: string;
  audioUrl: string | null;
}

export interface BunproWriteup {
  introText: string;
  introExamples: BunproWriteupExample[];
  cautions: { text: string; examples: BunproWriteupExample[] }[];
}

const STUDY_QUESTION_ID_RE = /data-study-question="(\d+)"/g;
const CAUTION_SECTION_RE = /<section class='caution'>([\s\S]*?)<\/section>/g;
const H4_RE = /<h4>[\s\S]*?<\/h4>/;

function extractStudyQuestionIds(html: string): number[] {
  return [...html.matchAll(STUDY_QUESTION_ID_RE)].map((m) => Number(m[1]));
}

function resolveExamples(
  ids: number[],
  questionsById: Map<number, any>,
  blankMarker: string,
): BunproWriteupExample[] {
  return ids
    .map((id) => questionsById.get(id))
    .filter((q): q is any => !!q)
    .map((q) => questionToExample(q, blankMarker));
}

/**
 * Bunpro's "About" writeup body: prose paragraphs interleaved with
 * <section class='caution'>…</section> callouts, each citing specific
 * example sentences via data-study-question ids. Those ids reference
 * Bunpro's full studyQuestions pool (including read-only illustrative
 * questions never scraped into GrammarSentence), so they're resolved to
 * actual sentence content here at scrape time rather than cross-referenced
 * against the quiz pool at render time.
 */
function parseWriteup(
  bodyHtml: string,
  questionsById: Map<number, any>,
  blankMarker: string,
): BunproWriteup {
  const cautions: { text: string; examples: BunproWriteupExample[] }[] = [];
  let introHtml = bodyHtml;
  for (const m of bodyHtml.matchAll(CAUTION_SECTION_RE)) {
    const inner = m[1];
    cautions.push({
      text: stripMarkup(inner.replace(H4_RE, "")).trim(),
      examples: resolveExamples(extractStudyQuestionIds(inner), questionsById, blankMarker),
    });
    introHtml = introHtml.replace(m[0], "");
  }
  return {
    introText: stripMarkup(introHtml).trim(),
    introExamples: resolveExamples(
      extractStudyQuestionIds(bodyHtml.replace(CAUTION_SECTION_RE, "")),
      questionsById,
      blankMarker,
    ),
    cautions,
  };
}

export interface BunproRelation {
  relationshipType: string; // "synonym" | "antonym" | "related"
  body: string;
  otherSlug: string;
  otherTitle: string;
  otherMeaning: string;
  otherIsGrammarPoint: boolean;
  otherLevel: string;
}

function parseRelations(bunproId: number, relatedContents: any[]): BunproRelation[] {
  return relatedContents.map((r) => {
    const other = r.first_relatable.id === bunproId ? r.second_relatable : r.first_relatable;
    return {
      relationshipType: r.relationship_type,
      body: stripMarkup(r.body || ""),
      otherSlug: other.slug,
      otherTitle: other.title,
      otherMeaning: other.meaning,
      otherIsGrammarPoint: other.type_snake === "grammar_point",
      otherLevel: other.level,
    };
  });
}

export interface BunproPointDetail {
  sentences: BunproSentence[];
  writeup: BunproWriteup;
  relations: BunproRelation[];
}

/** One grammar point's example sentences, About writeup, and synonym/antonym/related links. */
export async function fetchPointDetail(
  sessionCookie: string,
  bunproId: number,
  blankMarker: string,
): Promise<BunproPointDetail> {
  const html = await fetchBunproHtml(`/grammar_points/${bunproId}`, sessionCookie);
  const data = extractNextData(html);
  const included = data.props.pageProps.included ?? {};
  const questions: any[] = included.studyQuestions ?? [];
  const writeupBody: string = included.writeups?.[0]?.body ?? "";
  const relatedContents: any[] = included.relatedContents ?? [];
  const questionsById = new Map<number, any>(questions.map((q) => [q.id, q]));

  return {
    sentences: parseSentences(questions, blankMarker),
    writeup: parseWriteup(writeupBody, questionsById, blankMarker),
    relations: parseRelations(bunproId, relatedContents),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
