import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sentenceAtCursor, toGrammarPointDTO, toGrammarSentenceDTO } from "@/lib/grammar";
import { recentMistakeGrammarPointIds } from "@/lib/grammar-mistakes";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — read-only Extra Study source: points missed in the past 24h, most
// recent mistake first, each carrying its cursor-selected sentence. Never
// writes a log or moves SRS — the reviews page's mistakes mode enforces that
// on completion.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const ids = await recentMistakeGrammarPointIds(userId);
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const [points, progressRows] = await Promise.all([
    prisma.grammarPoint.findMany({
      where: { id: { in: ids } },
      include: { sentences: { orderBy: { position: "asc" } } },
    }),
    prisma.grammarProgress.findMany({
      where: { userId, grammarPointId: { in: ids } },
      select: { grammarPointId: true, srsStage: true, sentenceCursor: true },
    }),
  ]);
  const pointById = new Map(points.map((p) => [p.id, p]));
  const progressByPoint = new Map(progressRows.map((p) => [p.grammarPointId, p]));

  const items = ids
    .map((id) => {
      const point = pointById.get(id);
      if (!point) return null;
      const progress = progressByPoint.get(id);
      const sentence = sentenceAtCursor(point.sentences, progress?.sentenceCursor ?? 0);
      if (!sentence) return null;
      return {
        grammarPoint: toGrammarPointDTO(point),
        sentence: toGrammarSentenceDTO(sentence),
        srsStage: progress?.srsStage ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ items });
}
