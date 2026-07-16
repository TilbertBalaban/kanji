import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  EXTRA_LESSON_BATCH,
  getLessonLimits,
  lessonsDoneToday,
} from "@/lib/progression";
import { relatedAnswersBySubject } from "@/lib/related-answers";
import { toRelatedSubject, toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

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

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 5;
  // ?extra=1 bypasses the daily limit for one opt-in batch of EXTRA_LESSON_BATCH
  const extra = req.nextUrl.searchParams.get("extra") === "1";

  const [assignments, doneToday, { dailyLessonLimit }] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId, startedAt: null, unlockedAt: { not: null } },
      select: {
        subjectId: true,
        subject: { select: { level: true, type: true, lessonPosition: true } },
      },
    }),
    lessonsDoneToday(userId),
    getLessonLimits(userId),
  ]);

  const remainingToday = Math.max(0, dailyLessonLimit - doneToday);
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

  const batchIds = assignments.slice(0, batch).map((a) => a.subjectId);
  const [batchSubjects, synonyms] = await Promise.all([
    batchIds.length
      ? prisma.subject.findMany({ where: { id: { in: batchIds } } })
      : Promise.resolve([]),
    synonymsBySubject(userId, batchIds),
  ]);
  const subjectById = new Map(batchSubjects.map((s) => [s.id, s]));
  const dtos = batchIds
    .map((id) => subjectById.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => toSubjectDTO(s, synonyms.get(s.id) ?? []));

  // Fetch the related subjects (components + amalgamations) referenced by this
  // batch in one query, so the lesson tabs can show radical/kanji composition
  // and example vocabulary without extra round-trips.
  const relatedIds = [
    ...new Set(dtos.flatMap((d) => [...d.componentIds, ...d.amalgamationIds])),
  ];
  const [relatedSubjects, relatedAnswers] = await Promise.all([
    relatedIds.length
      ? prisma.subject.findMany({ where: { id: { in: relatedIds } } })
      : Promise.resolve([]),
    relatedAnswersBySubject(batchSubjects),
  ]);
  const relatedMap = new Map(relatedSubjects.map((r) => [r.id, toRelatedSubject(r)]));

  const subjects = dtos.map((d) => ({
    ...d,
    related: relatedAnswers.get(d.id),
    components: d.componentIds.map((id) => relatedMap.get(id)).filter(Boolean),
    amalgamations: d.amalgamationIds.map((id) => relatedMap.get(id)).filter(Boolean),
  }));

  return NextResponse.json({
    total: assignments.length,
    doneToday,
    dailyLimit: dailyLessonLimit,
    extraBatchSize: EXTRA_LESSON_BATCH,
    subjects,
  });
}
