// Human-readable per-type URLs mirroring WaniKani:
//   radicals   → /radicals/{slug}       (many are image-only, so no character)
//   kanji      → /kanji/{characters}
//   vocabulary → /vocabulary/{characters} (incl. kana_vocabulary)
// The captured `params` value is URL-decoded by Next, so we pass the raw
// character(s) here and let the platform encode them in the href.

export interface SubjectPathParts {
  type: string;
  characters: string | null;
  slug: string;
}

/** The URL kind segment (radicals | kanji | vocabulary) for a subject type. */
export function subjectKind(type: string): "radicals" | "kanji" | "vocabulary" {
  if (type === "radical") return "radicals";
  if (type === "kanji") return "kanji";
  return "vocabulary"; // vocabulary + kana_vocabulary
}

export function subjectPath({ type, characters, slug }: SubjectPathParts): string {
  const kind = subjectKind(type);
  const key = kind === "radicals" ? slug : characters ?? slug;
  return `/${kind}/${key}`;
}
