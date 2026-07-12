import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toRelatedSubject } from "@/lib/serialize";
import { MAX_LEVEL } from "@/lib/srs";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ n: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { n } = await params;
  const level = Number(n);
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
  }

  const subjects = await prisma.subject.findMany({
    where: { level },
    include: {
      assignments: {
        where: { userId },
        select: { srsStage: true, startedAt: true, unlockedAt: true },
      },
    },
    orderBy: { lessonPosition: "asc" },
  });

  return NextResponse.json({
    level,
    subjects: subjects.map((s) => {
      const assignment = s.assignments[0];
      return {
        ...toRelatedSubject(s),
        srsStage: assignment?.srsStage ?? null,
        unlocked: !!assignment?.unlockedAt,
        started: !!assignment?.startedAt,
      };
    }),
  });
}
