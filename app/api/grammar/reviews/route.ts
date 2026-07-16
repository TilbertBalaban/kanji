import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sentenceAtCursor, toGrammarPointDTO, toGrammarSentenceDTO } from "@/lib/grammar";
import { reviewsDueBefore } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — grammar points currently due for review, shuffled, each carrying only
// its cursor-selected example sentence (not the whole set) — so a session
// never hands over sentences/answers for prompts it hasn't reached yet.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const progressRows = await prisma.grammarProgress.findMany({
    where: { userId, availableAt: { lte: await reviewsDueBefore(userId) } },
    include: { grammarPoint: true },
  });

  for (let i = progressRows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [progressRows[i], progressRows[j]] = [progressRows[j], progressRows[i]];
  }

  const sentences = progressRows.length
    ? await prisma.grammarSentence.findMany({
        where: { grammarPointId: { in: progressRows.map((p) => p.grammarPointId) } },
        orderBy: { position: "asc" },
      })
    : [];
  const sentencesByPoint = new Map<number, typeof sentences>();
  for (const s of sentences) {
    const list = sentencesByPoint.get(s.grammarPointId) ?? [];
    list.push(s);
    sentencesByPoint.set(s.grammarPointId, list);
  }

  const items = progressRows
    .map((p) => {
      const sentence = sentenceAtCursor(sentencesByPoint.get(p.grammarPointId) ?? [], p.sentenceCursor);
      if (!sentence) return null;
      return {
        grammarPoint: toGrammarPointDTO(p.grammarPoint),
        sentence: toGrammarSentenceDTO(sentence),
        srsStage: p.srsStage,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ items });
}
