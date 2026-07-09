import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  DAILY_LESSON_LIMIT,
  EXTRA_LESSON_BATCH,
  lessonsDoneToday,
} from "@/lib/progression";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const TYPE_ORDER: Record<string, number> = {
  radical: 0,
  kanji: 1,
  vocabulary: 2,
  kana_vocabulary: 2,
};

export async function GET(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  // ?extra=1 bypasses the daily limit for one opt-in batch of EXTRA_LESSON_BATCH
  const extra = req.nextUrl.searchParams.get("extra") === "1";

  const [assignments, doneToday] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId, startedAt: null, unlockedAt: { not: null } },
      include: { subject: true },
    }),
    lessonsDoneToday(userId),
  ]);

  const remainingToday = Math.max(0, DAILY_LESSON_LIMIT - doneToday);
  const batch = extra ? EXTRA_LESSON_BATCH : Math.min(limit, remainingToday);

  // WaniKani default order: level asc, then radicals → kanji → vocab,
  // then lesson_position.
  assignments.sort((a, b) => {
    const sa = a.subject;
    const sb = b.subject;
    return (
      sa.level - sb.level ||
      TYPE_ORDER[sa.type] - TYPE_ORDER[sb.type] ||
      sa.lessonPosition - sb.lessonPosition
    );
  });

  return NextResponse.json({
    total: assignments.length,
    doneToday,
    dailyLimit: DAILY_LESSON_LIMIT,
    extraBatchSize: EXTRA_LESSON_BATCH,
    subjects: assignments.slice(0, batch).map((a) => toSubjectDTO(a.subject)),
  });
}
