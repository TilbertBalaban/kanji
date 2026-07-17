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

// Sentence translations keep their <strong> emphasis — Bunpro marks the
// answer's English equivalent with it ("It <strong>is</strong> ice cream."),
// and components/GrammarPointInfo.tsx's EmphasisText renders it highlighted.
// Every other tag (gp-popout spans etc.) is stripped; an attributed
// <strong class=…> would be stripped too, degrading to plain text.
function stripMarkupKeepStrong(s: string): string {
  return s.replace(/<(?!\/?strong>)[^>]+>/g, "").trim();
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
  // Wrong-but-plausible answers → hint message ("です" → "Could you try a
  // grammar point that is more casual here?"). Bunpro's own reviews shake
  // these with a warning instead of counting a miss — see
  // lib/grammar-answer-checker.ts.
  wrongAnswerHints: Record<string, string>;
  audioUrl: string | null;
}

// Bunpro attaches two per-question maps of wrong answers to localized hint
// messages: alternate_answers (usually same meaning, different register) and
// wrong_answers (point-specific traps). Merge both, keeping the English text.
function parseWrongAnswerHints(q: any): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const source of [q.wrong_answers, q.alternate_answers]) {
    for (const [wrong, msg] of Object.entries(source ?? {})) {
      const text = typeof msg === "string" ? msg : ((msg as { en?: string })?.en ?? "");
      if (text) hints[wrong] = stripMarkup(text);
    }
  }
  return hints;
}

// Bunpro clozes use a run of ASCII underscores for the blank; normalize to
// our own GRAMMAR_BLANK marker (see lib/grammar.ts) so downstream rendering
// doesn't need to know about the source format.
const BUNPRO_BLANK_RE = /_{2,}/;

function questionToExample(q: any, blankMarker: string): BunproWriteupExample {
  return {
    japanese: stripMarkup(q.content).replace(BUNPRO_BLANK_RE, blankMarker),
    english: stripMarkupKeepStrong(q.translation || ""),
    answer: q.answer || null,
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
        english: stripMarkupKeepStrong(q.translation || ""),
        acceptedAnswers: [...answers],
        wrongAnswerHints: parseWrongAnswerHints(q),
        audioUrl: q.female_audio_url || q.male_audio_url || null,
      };
    })
    .filter((s) => s.acceptedAnswers.length > 0);
}

export interface BunproWriteupExample {
  japanese: string;
  english: string;
  answer: string | null; // the cloze answer, so displays can fill the blank
  audioUrl: string | null;
}

// A writeup's prose interleaves with <ul class='writeup-examples--holder'>
// example groups mid-paragraph (see parseBlocks) — a block is either a prose
// chunk or the group of examples that follows it, in the order Bunpro shows
// them, so the UI can render examples right where they're cited instead of
// dumping them all at the end.
export type BunproWriteupBlock =
  | { type: "text"; text: string }
  | { type: "examples"; examples: BunproWriteupExample[] };

export interface BunproWriteup {
  introBlocks: BunproWriteupBlock[];
  cautions: { text: string; examples: BunproWriteupExample[] }[];
}

const STUDY_QUESTION_ID_RE = /data-study-question=['"](\d+)['"]/g;
const CAUTION_SECTION_RE = /<section class='caution'>([\s\S]*?)<\/section>/g;
const H4_RE = /<h4>[\s\S]*?<\/h4>/;
const EXAMPLES_HOLDER_RE = /<ul class='writeup-examples--holder'>([\s\S]*?)<\/ul>/g;

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
 * Splits a writeup HTML chunk into ordered text/examples blocks, keeping
 * each example group positioned right after the prose that introduces it
 * (Bunpro interleaves <ul class='writeup-examples--holder'> between <p>s).
 */
function parseBlocks(
  html: string,
  questionsById: Map<number, any>,
  blankMarker: string,
): BunproWriteupBlock[] {
  const blocks: BunproWriteupBlock[] = [];
  let lastIndex = 0;
  for (const m of html.matchAll(EXAMPLES_HOLDER_RE)) {
    const text = stripMarkup(html.slice(lastIndex, m.index)).trim();
    if (text) blocks.push({ type: "text", text });
    const examples = resolveExamples(extractStudyQuestionIds(m[1]), questionsById, blankMarker);
    if (examples.length > 0) blocks.push({ type: "examples", examples });
    lastIndex = m.index! + m[0].length;
  }
  const tail = stripMarkup(html.slice(lastIndex)).trim();
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks;
}

/**
 * Bunpro's "About" writeup body: prose paragraphs interleaved with example
 * groups and <section class='caution'>…</section> callouts, each citing
 * specific example sentences via data-study-question ids. Those ids
 * reference Bunpro's full studyQuestions pool (including read-only
 * illustrative questions never scraped into GrammarSentence), so they're
 * resolved to actual sentence content here at scrape time rather than
 * cross-referenced against the quiz pool at render time.
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
    introBlocks: parseBlocks(introHtml, questionsById, blankMarker),
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

// Bunpro's "Readings" tab: external articles ("Online") and textbook page
// references ("Offline") for further study.
export interface BunproOnlineResource {
  site: string; // e.g. "Tae Kim"
  description: string; // link title, e.g. "Declaring something is so and so using 「だ」"
  link: string;
}

export interface BunproOfflineResource {
  source: string; // e.g. "Genki I 2nd Edition"
  location: string; // e.g. "Page 42"
}

export interface BunproPointDetail {
  sentences: BunproSentence[];
  writeup: BunproWriteup;
  relations: BunproRelation[];
  onlineResources: BunproOnlineResource[];
  offlineResources: BunproOfflineResource[];
}

/**
 * One point's raw `included` page blob — everything parsePointDetail reads.
 * Fetched and parsed separately so the seed script can cache the raw JSON:
 * the v1→v4 cache rewrites (each forcing a ~945-page re-scrape) all came from
 * caching parsed output, which goes stale on every parser change.
 */
export async function fetchPointIncluded(
  sessionCookie: string,
  bunproId: number,
): Promise<any> {
  const html = await fetchBunproHtml(`/grammar_points/${bunproId}`, sessionCookie);
  const data = extractNextData(html);
  return data.props.pageProps.included ?? {};
}

/** One grammar point's example sentences, About writeup, and synonym/antonym/related links. */
export function parsePointDetail(
  included: any,
  bunproId: number,
  blankMarker: string,
): BunproPointDetail {
  const questions: any[] = included.studyQuestions ?? [];
  const writeupBody: string = included.writeups?.[0]?.body ?? "";
  const relatedContents: any[] = included.relatedContents ?? [];
  const supplementalLinks: any[] = included.supplementalLinks ?? [];
  const offlineResources: any[] = included.offlineResources ?? [];
  const questionsById = new Map<number, any>(questions.map((q) => [q.id, q]));

  return {
    sentences: parseSentences(questions, blankMarker),
    writeup: parseWriteup(writeupBody, questionsById, blankMarker),
    relations: parseRelations(bunproId, relatedContents),
    onlineResources: supplementalLinks
      .filter((l) => l.link)
      .map((l) => ({
        site: l.site ?? "",
        description: stripMarkup(l.description ?? ""),
        link: l.link,
      })),
    offlineResources: offlineResources
      .filter((r) => r.source)
      .map((r) => ({
        source: r.source,
        location: stripMarkup(r.location ?? ""),
      })),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Legend modals ("Parts of Speech Legend", "Word Type Legend", "Register",
// "Structure Legend", "All Technical Terms"). Unlike the per-point content
// above, these are site-wide static texts that live in Bunpro's front-end
// translation bundles, not in page props:
//   - modal body strings: the "encyclo" i18n namespace, shipped as a
//     lazily-loaded webpack chunk (a JSON.parse('…') blob) discovered by
//     walking the webpack runtime's chunk map;
//   - the term dictionary (Japanese term + furigana per glossary entry) and
//     the modal titles: eagerly-loaded page chunks / __NEXT_DATA__.
// Which terms appear in which modal (and their order) is Bunpro component
// code, mirrored here as slug lists — identifiers only, no scraped text.

/** slug (e.g. "linking-particle") → Japanese term + reading from Bunpro's term dictionary. */
export type BunproTermDict = Record<string, { termJa: string; reading: string | null }>;

export interface BunproLegendSources {
  encyclo: any; // decoded "encyclo" translation namespace
  structureLegendTitle: string; // rev:structure.legend-title
  registerLegendTitle: string; // rev:details.register
  terms: BunproTermDict;
}

// Any grammar point page carries the needed chunks; だ is N5 lesson 1 and as
// stable a slug as Bunpro has.
const LEGEND_PAGE_PATH = "/grammar_points/%E3%81%A0";

// Decodes the body of a single-quoted JS string literal (webpack emits
// translation JSON as JSON.parse('…')). Handles the escapes webpack's
// serializer produces; unknown \X degrades to X.
function decodeJsSingleQuotedString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[++i];
    switch (n) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "v": out += "\v"; break;
      case "0": out += "\0"; break;
      case "x":
        out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16));
        i += 2;
        break;
      case "u":
        if (raw[i + 1] === "{") {
          const end = raw.indexOf("}", i);
          out += String.fromCodePoint(parseInt(raw.slice(i + 2, end), 16));
          i = end;
        } else {
          out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16));
          i += 4;
        }
        break;
      default:
        out += n; // \' \\ \" — and anything unrecognized — decode to the char
    }
  }
  return out;
}

const TERM_DECL_RE =
  /\{termKey:"([^"]+)",titleKey:"encyclo:terms\.([a-z0-9-]+)-tit",descKey:"encyclo:terms\.[a-z0-9-]+-desc"\}/g;

function parseTermDict(js: string): BunproTermDict {
  const dict: BunproTermDict = {};
  for (const m of js.matchAll(TERM_DECL_RE)) {
    // termKey is "漢字・かんじ" (term・reading); a few terms may have no reading.
    const [termJa, reading] = m[1].split("・");
    dict[m[2]] = { termJa, reading: reading ?? null };
  }
  return dict;
}

// The webpack runtime's chunk-URL function maps chunk id → filename in two
// styles: literal `1234===e?"static/chunks/1234-<hash>.js"` ternaries, and
// map-built `"static/chunks/"+(({id:"name"})[e]||e)+"."+({id:"hash"})[e]+".js"`.
function parseLazyChunkPaths(webpackJs: string): string[] {
  // The map-built expression ends in +".js"; matching up to a bare ".js"
  // would stop inside the first literal-ternary entry and lose the maps.
  const fnMatch = webpackJs.match(/\.u=e=>[\s\S]*?\+"\.js"/);
  if (!fnMatch) throw new Error("Bunpro webpack runtime shape changed: no chunk-URL function");
  const seg = fnMatch[0];
  const paths = new Set<string>();
  for (const m of seg.matchAll(/"(static\/chunks\/[^"]+\.js)"/g)) paths.add(`/_next/${m[1]}`);
  const names = new Map(seg.matchAll(/(\d+):"([0-9a-f]{8})"/g).map((m) => [m[1], m[2]]));
  for (const m of seg.matchAll(/(\d+):"([0-9a-f]{16})"/g)) {
    paths.add(`/_next/static/chunks/${names.get(m[1]) ?? m[1]}.${m[2]}.js`);
  }
  return [...paths];
}

// The encyclo chunk is found by content, not name: hashes change every deploy.
const ENCYCLO_MARKERS = ["godan-ru", "all-terms", "if-you-see"];

function tryExtractEncyclo(chunkJs: string): any | null {
  if (!ENCYCLO_MARKERS.every((s) => chunkJs.includes(s))) return null;
  for (const m of chunkJs.matchAll(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/g)) {
    try {
      const obj = JSON.parse(decodeJsSingleQuotedString(m[1]));
      if (!(obj.terms && obj.structure && obj.register && obj.pos && obj.ui)) continue;
      // The namespace ships once per UI language (same keys, translated
      // values) — accept only the English one.
      if (!String(obj.ui["if-you-see"]).startsWith("If you see")) continue;
      return obj;
    } catch {
      // not the blob we want — keep scanning
    }
  }
  return null;
}

/**
 * Everything the legend modals need, gathered from one grammar point page:
 * its __NEXT_DATA__ (modal titles), its eager chunks (term dictionary,
 * webpack runtime), and a scan of lazy chunks for the encyclo translations.
 * The page and its assets are public; the cookie is passed for parity with
 * the rest of this owner-run pipeline.
 */
export async function fetchLegendSources(sessionCookie: string): Promise<BunproLegendSources> {
  const html = await fetchBunproHtml(LEGEND_PAGE_PATH, sessionCookie);

  const nextData = extractNextData(html);
  const rev = nextData.props?.pageProps?.__namespaces?.rev ?? {};
  const structureLegendTitle: string = rev.structure?.["legend-title"] ?? "";
  const registerLegendTitle: string = rev.details?.register ?? "";
  if (!structureLegendTitle || !registerLegendTitle) {
    throw new Error("Bunpro page shape changed: rev namespace missing legend titles");
  }

  const eagerPaths = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  let terms: BunproTermDict = {};
  let webpackJs = "";
  for (const p of eagerPaths) {
    const js = await fetchBunproHtml(p, sessionCookie);
    Object.assign(terms, parseTermDict(js));
    if (p.includes("/webpack-")) webpackJs = js;
    await sleep(100);
  }
  if (Object.keys(terms).length < 50) {
    throw new Error(
      `Bunpro term dictionary parse found only ${Object.keys(terms).length} terms — chunk shape changed?`,
    );
  }
  if (!webpackJs) throw new Error("Bunpro page has no webpack runtime chunk");

  const lazyPaths = parseLazyChunkPaths(webpackJs);
  if (process.env.LEGEND_DEBUG) console.error(`[legend-debug] ${lazyPaths.length} lazy paths`);
  for (const p of lazyPaths) {
    let js: string;
    try {
      js = await fetchBunproHtml(p, sessionCookie);
    } catch (e) {
      if (process.env.LEGEND_DEBUG) console.error(`[legend-debug] FETCH FAIL ${p}: ${e}`);
      continue; // stale map entry — skip
    }
    if (process.env.LEGEND_DEBUG && ENCYCLO_MARKERS.every((s) => js.includes(s))) {
      console.error(`[legend-debug] candidate ${p} len=${js.length}`);
    }
    const encyclo = tryExtractEncyclo(js);
    if (encyclo) return { encyclo, structureLegendTitle, registerLegendTitle, terms };
    await sleep(100);
  }
  throw new Error("encyclo translation chunk not found in any lazy webpack chunk");
}

// --- assembly: sources → render-ready legend objects (see GrammarLegendDTO) ---

// Which terms each modal lists, in Bunpro's own order (its component hoists
// the highlighted target row to the top at render time; so do we).
const POS_LEGEND_TERMS = [
  "adjective", "adverb", "auxiliary-verb", "conjunctive-particle", "expression",
  "noun", "particle", "pronoun", "verb",
];
const WORD_TYPE_LEGEND_TERMS = [
  "abbreviation", "adjectival-noun", "adjective", "adverb", "adverb-phrase",
  "adverbial-particle", "auxiliary-verb", "case-marking-particle", "conjunction",
  "conjunctive-particle", "definite-article", "demonstrative-pronoun",
  "dependent-word", "dictionary-form", "indefinite-article", "independent-word",
  "informal-speech", "linking-particle", "noun", "ordinary", "personal-pronoun",
  "plural", "possessive", "possessive-pronoun", "predicate",
  "present-simple-tense", "pronoun", "question-sentence-order",
  "sentence-ending-particle", "verb",
];

export interface BunproLegend {
  key: string;
  data: {
    title: string;
    intro: string[];
    sections: {
      heading?: string;
      bullets?: { text: string; accent?: "red" | "orange" }[];
      rows?: { title: string; termJa?: string; reading?: string; description: string }[];
    }[];
    seeAllTerms?: boolean;
    labels: { ifYouSee: string; itMeans: string; seeAllTerms: string };
  };
}

/** Builds the five legend modals from the scraped sources. Fails loudly on any missing key. */
export function assembleLegends(src: BunproLegendSources): BunproLegend[] {
  const t = (path: string): string => {
    const [group, key] = path.split(".");
    const v = src.encyclo[group]?.[key];
    if (typeof v !== "string" || !v) throw new Error(`encyclo translation missing: ${path}`);
    return v;
  };

  const labels = {
    ifYouSee: t("ui.if-you-see"),
    itMeans: t("ui.it-means"),
    seeAllTerms: t("ui.see-all-terms"),
  };

  const termRow = (slug: string) => {
    const term = src.terms[slug];
    if (!term) throw new Error(`term dictionary missing slug: ${slug}`);
    return {
      title: t(`terms.${slug}-tit`),
      termJa: term.termJa,
      reading: term.reading ?? undefined,
      description: t(`terms.${slug}-desc`),
    };
  };

  const v = t("structure.verb");
  const structureRows = [
    { title: v, description: t("structure.form-plain") },
    { title: `${v}[る]`, description: t("structure.form-dictionary") },
    { title: t("structure.verb-stem"), description: t("structure.form-conjunctive") },
    { title: `${v}[た]`, description: t("structure.form-ta") },
    { title: `${v}[ない]`, description: t("structure.form-nai") },
    // Bunpro renders the nai-stem row's ない struck through; <s> is the one
    // markup tag legend row titles may carry (see GrammarLegendModal).
    { title: `${v}[<s>ない</s>]`, description: t("structure.form-nai-stem") },
    { title: `${v}[て]`, description: t("structure.form-te") },
    { title: `${v}[よう]`, description: t("structure.form-volitional") },
    { title: t("structure.verb-potential"), description: t("structure.form-potential") },
    { title: t("structure.verb-passive"), description: t("structure.form-passive") },
    { title: t("structure.verb-causative"), description: t("structure.form-causative") },
    { title: `${v}[ば]`, description: t("structure.form-ba") },
    { title: "V(る1)", description: t("structure.verb-ichidan") },
    { title: "V(る5)", description: t("structure.godan-ru") },
    { title: "V(う)", description: t("structure.godan-u") },
    { title: "V(く)", description: t("structure.godan-ku") },
    { title: "V(す)", description: t("structure.godan-su") },
    { title: "V(つ)", description: t("structure.godan-tsu") },
    { title: "V(ぬ)", description: t("structure.godan-nu") },
    { title: "V(ぶ)", description: t("structure.godan-bu") },
    { title: "V(む)", description: t("structure.godan-mu") },
    { title: "V(ぐ)", description: t("structure.godan-gu") },
  ];

  const allTermRows = Object.keys(src.terms)
    .map(termRow)
    .sort((a, b) => a.title.localeCompare(b.title, "en"));

  return [
    {
      key: "part-of-speech",
      data: {
        title: t("pos.title"),
        intro: [t("pos.intro-1"), t("pos.intro-2")],
        sections: [{ rows: POS_LEGEND_TERMS.map(termRow) }],
        seeAllTerms: true,
        labels,
      },
    },
    {
      key: "word-type",
      data: {
        title: t("word-type.title"),
        intro: [t("word-type.intro-1"), t("word-type.intro-2")],
        sections: [{ rows: WORD_TYPE_LEGEND_TERMS.map(termRow) }],
        seeAllTerms: true,
        labels,
      },
    },
    {
      key: "register",
      data: {
        title: src.registerLegendTitle,
        intro: [t("register.intro-1")],
        sections: [
          {
            rows: (["standard", "formal", "polite", "casual"] as const).map((k) => ({
              title: t(`register.${k}-title`),
              description: t(`register.${k}-desc`),
            })),
          },
        ],
        labels,
      },
    },
    {
      key: "structure",
      data: {
        title: src.structureLegendTitle,
        intro: [],
        sections: [
          {
            heading: t("structure.joining-title"),
            bullets: [
              { text: t("structure.joining-msg-accepted") },
              { text: t("structure.joining-msg-form") },
            ],
          },
          {
            heading: t("structure.color-title"),
            // <0>…</0> in these strings marks Bunpro's colored span — red for
            // the grammar point itself, orange for its forming rules.
            bullets: [
              { text: t("structure.color-msg-grammar"), accent: "red" },
              { text: t("structure.color-msg-rules"), accent: "orange" },
              { text: t("structure.color-msg-example") },
            ],
          },
          { rows: structureRows },
        ],
        labels,
      },
    },
    {
      key: "all-terms",
      data: {
        title: t("all-terms.title"),
        intro: [t("all-terms.intro-1")],
        sections: [{ rows: allTermRows }],
        labels,
      },
    },
  ];
}
