// Google Translate helper for the custom-vocab "add a word" form. Pure,
// client-safe helpers only — the network call lives in app/api/translate.
//
// We use the same unofficial endpoint the Google Translate website hits
// (translate_a/single with client=gtx). Requesting dt=t gives the translation
// and dt=rm gives the romanization of both sides, which we turn into a kana
// reading for words written with kanji.

import * as wanakana from "wanakana";

// The languages the helper bridges: Japanese ↔ English/Ukrainian.
export type TranslateLang = "ja" | "en" | "uk";

const SUPPORTED: ReadonlySet<string> = new Set<TranslateLang>(["ja", "en", "uk"]);

export function isTranslateLang(value: unknown): value is TranslateLang {
  return typeof value === "string" && SUPPORTED.has(value);
}

export interface TranslateResult {
  translation: string;
  sourceRomaji: string | null; // romanization of the input text
  targetRomaji: string | null; // romanization of the translated text
  detectedSource: string | null; // language Google detected for the input
}

/**
 * Parse the array-of-arrays payload the gtx endpoint returns. Shape (with
 * dt=t&dt=rm), abbreviated:
 *   [ [ ["translated","source",…], … , [null,null,"targetRomaji","sourceRomaji"] ],
 *     …, "detectedLang", … ]
 * Translation chunks carry the text in slot 0; the trailing romanization chunk
 * has null in slots 0–1 and the two romanizations in slots 2–3. Returns null
 * when the payload isn't the shape we expect.
 */
export function parseTranslateResponse(raw: unknown): TranslateResult | null {
  if (!Array.isArray(raw)) return null;
  const segments = raw[0];
  if (!Array.isArray(segments)) return null;

  let translation = "";
  let targetRomaji = "";
  let sourceRomaji = "";
  for (const seg of segments) {
    if (!Array.isArray(seg)) continue;
    if (typeof seg[0] === "string") {
      translation += seg[0];
    } else if (seg[0] === null && seg[1] === null) {
      if (typeof seg[2] === "string") targetRomaji += seg[2];
      if (typeof seg[3] === "string") sourceRomaji += seg[3];
    }
  }

  translation = translation.trim();
  if (!translation) return null;

  return {
    translation,
    sourceRomaji: sourceRomaji.trim() || null,
    targetRomaji: targetRomaji.trim() || null,
    detectedSource: typeof raw[2] === "string" ? raw[2] : null,
  };
}

/**
 * Best-effort kana reading for a Japanese word. When the word is already all
 * kana we use it verbatim (exact). Otherwise we fall back to the romaji
 * transliteration converted to hiragana — imperfect for particles read
 * irregularly (は→わ, へ→え), so the form presents it as an editable
 * suggestion rather than a final answer.
 */
export function japaneseReading(japanese: string, romaji: string | null): string {
  const compact = japanese.replace(/\s+/g, "");
  if (compact && wanakana.isKana(compact)) return compact;
  return romaji ? wanakana.toHiragana(romaji.toLowerCase()) : "";
}
