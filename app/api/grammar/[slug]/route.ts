import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toGrammarPointDTO, toGrammarRelationDTO, toGrammarSentenceDTO } from "@/lib/grammar";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — one grammar point's detail: full text, every example sentence, and
// the caller's own SRS state (null if not yet in their queue).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { slug } = await params;
  const point = await prisma.grammarPoint.findUnique({
    where: { slug },
    include: { sentences: { orderBy: { position: "asc" } }, relations: true },
  });
  if (!point) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const progress = await prisma.grammarProgress.findUnique({
    where: { userId_grammarPointId: { userId, grammarPointId: point.id } },
    select: { srsStage: true, availableAt: true },
  });

  return NextResponse.json({
    point: toGrammarPointDTO(point),
    sentences: point.sentences.map(toGrammarSentenceDTO),
    relations: point.relations.map(toGrammarRelationDTO),
    srsStage: progress?.srsStage ?? null,
    availableAt: progress?.availableAt?.toISOString() ?? null,
  });
}
