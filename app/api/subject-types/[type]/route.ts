import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
  const to = Number(req.nextUrl.searchParams.get("to") ?? 60);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 60 || from > to) {
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
      id: s.id,
      type: s.type,
      level: s.level,
      characters: s.characters,
      characterImage: s.characterImage,
      primaryMeaning:
        (JSON.parse(s.meanings) as { meaning: string; primary: boolean }[]).find((m) => m.primary)
          ?.meaning ?? "",
      primaryReading:
        (JSON.parse(s.readings) as { reading: string; primary: boolean }[]).find((r) => r.primary)
          ?.reading ?? null,
      status: status(s.assignments[0] ?? null),
    })),
  });
}
