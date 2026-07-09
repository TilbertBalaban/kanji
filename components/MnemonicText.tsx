// Renders mnemonic text containing WaniKani-style markup tags
// (<radical>, <kanji>, <vocabulary>, <reading>, <ja>) as highlighted spans.

const TAG_STYLES: Record<string, string> = {
  radical: "bg-sky-100 text-sky-800",
  kanji: "bg-pink-100 text-pink-800",
  vocabulary: "bg-purple-100 text-purple-800",
  reading: "bg-slate-200 text-slate-800",
  ja: "font-medium",
};

const TAG_RE = /<(radical|kanji|vocabulary|reading|ja)>([\s\S]*?)<\/\1>/g;

export function MnemonicText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} className={`rounded px-1 ${TAG_STYLES[match[1]] ?? ""}`}>
        {match[2]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <p className="whitespace-pre-line leading-relaxed">{parts}</p>;
}
