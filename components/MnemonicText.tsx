// Renders mnemonic/hint text containing WaniKani-style markup tags
// (<radical>, <kanji>, <vocabulary>, <reading>, <ja>, <em>) as styled spans
// instead of showing the raw tags.

const TAG_STYLES: Record<string, string> = {
  radical: "bg-sky-100 text-sky-800",
  kanji: "bg-pink-100 text-pink-800",
  vocabulary: "bg-purple-100 text-purple-800",
  reading: "bg-slate-200 text-slate-800",
  ja: "font-medium",
};

const TAG_RE = /<(radical|kanji|vocabulary|reading|ja|em)>([\s\S]*?)<\/\1>/g;

// Parses WaniKani markup tags out of `text` into styled React nodes, without
// wrapping them in a block element — for embedding inline (e.g. in a <span>).
export function renderMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const tag = match[1];
    const Wrapper = tag === "em" ? "em" : "span";
    parts.push(
      <Wrapper key={key++} className={tag === "em" ? "italic" : `rounded px-1 ${TAG_STYLES[tag] ?? ""}`}>
        {match[2]}
      </Wrapper>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts;
}

export function MnemonicText({ text, className }: { text: string; className?: string }) {
  return <p className={className ?? "whitespace-pre-line leading-relaxed"}>{renderMarkup(text)}</p>;
}
