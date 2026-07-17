import type { ReactNode } from "react";

// Renders `text` with every <tag>…</tag> span replaced by wrap(content) and
// the surrounding text passed through as-is. Handles any number of spans,
// including none. The one splitter behind the grammar UI's pseudo-HTML
// accents — <strong> emphasis (EmphasisText), the struck-through <s> in
// legend row titles, and Bunpro's <0> colored spans in legend bullets —
// mirroring components/MnemonicText.tsx's renderMarkup for WaniKani tags.
export function renderTagged(
  text: string,
  tag: string,
  wrap: (content: string, key: number) => ReactNode,
): ReactNode[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(wrap(m[1], m.index!));
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
