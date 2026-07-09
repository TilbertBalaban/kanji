import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { id } = await params;
  const subject = await prisma.subject.findUnique({
    where: { id: Number(id) },
    include: {
      assignments: { where: { userId } },
      reviewLogs: { where: { userId }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!subject) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const dto = toSubjectDTO(subject);
  const related = await prisma.subject.findMany({
    where: { id: { in: [...dto.componentIds, ...dto.amalgamationIds] } },
    include: { assignments: { where: { userId }, select: { srsStage: true } } },
  });

  return NextResponse.json({
    subject: dto,
    assignment: subject.assignments[0] ?? null,
    reviewLogs: subject.reviewLogs,
    related: related.map((r) => ({
      id: r.id,
      type: r.type,
      level: r.level,
      characters: r.characters,
      characterImage: r.characterImage,
      primaryMeaning: (JSON.parse(r.meanings) as { meaning: string; primary: boolean }[]).find((m) => m.primary)?.meaning ?? "",
      srsStage: r.assignments[0]?.srsStage ?? null,
    })),
  });
}
