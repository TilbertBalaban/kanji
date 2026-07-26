// Typing romaji with a Cyrillic (ЙЦУКЕН) layout active produces Cyrillic letters
// instead of the intended latin ones. Map each Cyrillic character back to the
// letter sitting on the same physical key of a QWERTY keyboard, so "флфкш"
// becomes "akari" (→ 明かり) instead of nothing at all.
//
// Covers the Ukrainian layout plus the four keys where Russian differs
// (ы/ъ/э/ё); the two sets never claim the same character, so one map serves both.
// The ` key is left alone: it carries an apostrophe on the Ukrainian layout, and
// wanakana needs a literal apostrophe to disambiguate ん (kin'youbi → きんようび).
const QWERTY_BY_CYRILLIC: Record<string, string> = {
  й: "q",
  ц: "w",
  у: "e",
  к: "r",
  е: "t",
  н: "y",
  г: "u",
  ш: "i",
  щ: "o",
  з: "p",
  х: "[",
  ї: "]",
  ъ: "]",
  ф: "a",
  і: "s",
  ы: "s",
  в: "d",
  а: "f",
  п: "g",
  р: "h",
  о: "j",
  л: "k",
  д: "l",
  ж: ";",
  є: "'",
  э: "'",
  ґ: "\\",
  я: "z",
  ч: "x",
  с: "c",
  м: "v",
  и: "b",
  т: "n",
  ь: "m",
  б: ",",
  ю: ".",
};

/**
 * Rewrite Cyrillic characters as the QWERTY letters on the same physical keys.
 * Characters with no mapping (latin, kana, punctuation) are left untouched.
 * Uppercase input yields uppercase output, which keeps wanakana's
 * uppercase-romaji-to-katakana behaviour working.
 */
export function fromCyrillicLayout(text: string): string {
  let out = "";
  for (const char of text) {
    const lower = char.toLowerCase();
    const mapped = QWERTY_BY_CYRILLIC[lower];
    if (mapped === undefined) {
      out += char;
    } else {
      out += char === lower ? mapped : mapped.toUpperCase();
    }
  }
  return out;
}
