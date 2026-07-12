import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toRelatedSubject } from "@/lib/serialize";
import { MAX_LEVEL } from "@/lib/srs";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const TYPE_FILTERS: Record<string, string[]> = {
  radical: ["radical"],
  kanji: ["kanji"],
  vocabulary: ["vocabulary", "kana_vocabulary"],
};

type Status = "locked" | "lesson" | "review" | "burned";

function status(a: { srsStage: number; unlockedAt: Date | null; startedAt: Date | null } | null): Status {
  if (!a || !a.unlockedAt) return "locked";
  if (!a.startedAt) return "lesson";
  if (a.srsStage >= 9) return "burned";
  return "review";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { type } = await params;
  const types = TYPE_FILTERS[type];
  if (!types) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const from = Number(req.nextUrl.searchParams.get("from") ?? 1);
  const to = Number(req.nextUrl.searchParams.get("to") ?? MAX_LEVEL);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > MAX_LEVEL || from > to) {
    return NextResponse.json({ error: "invalid level range" }, { status: 400 });
  }

  const subjects = await prisma.subject.findMany({
    where: { type: { in: types }, level: { gte: from, lte: to } },
    include: {
      assignments: {
        where: { userId },
        select: { srsStage: true, unlockedAt: true, startedAt: true },
      },
    },
    orderBy: [{ level: "asc" }, { lessonPosition: "asc" }],
  });

  return NextResponse.json({
    subjects: subjects.map((s) => ({
      ...toRelatedSubject(s),
      level: s.level,
      status: status(s.assignments[0] ?? null),
    })),
  });
}
