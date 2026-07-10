import { NextResponse } from "next/server";
import { answerCounts } from "@/lib/accuracy";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const logs = await prisma.reviewLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { subject: { select: { type: true } } },
  });

  let totalAnswers = 0;
  let correctAnswers = 0;
  const byType: Record<string, { total: number; correct: number }> = {};

  for (const log of logs) {
    const { correct, total } = answerCounts(log);
    totalAnswers += total;
    correctAnswers += correct;

    const t = log.subject.type;
    byType[t] ??= { total: 0, correct: 0 };
    byType[t].total += total;
    byType[t].correct += correct;
  }

  const totalReviews = await prisma.reviewLog.count({ where: { userId } });

  return NextResponse.json({
    totalReviews,
    accuracy: totalAnswers ? correctAnswers / totalAnswers : null,
    byType,
    recent: logs.slice(0, 50).map((l) => ({
      subjectId: l.subjectId,
      createdAt: l.createdAt,
      startingStage: l.startingStage,
      endingStage: l.endingStage,
      incorrect: l.meaningIncorrectCount + l.readingIncorrectCount + l.recallIncorrectCount,
    })),
  });
}
