import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

// Subjects answered incorrectly in the past 24h, deduped, most-recent first.
// Powers both "Recent Mistakes" flows — Extra Study (review-style) and Redo
// Lessons (lesson-style) — so it returns the SRS stage plus the related
// components/amalgamations the lesson info tabs need. Both flows are extra
// practice that must NOT touch SRS, so this endpoint is strictly read-only.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const mistakeLogs = await prisma.reviewLog.findMany({
    where: {
      userId,
      createdAt: { gte: dayAgo },
      OR: [
        { meaningIncorrectCount: { gt: 0 } },
        { readingIncorrectCount: { gt: 0 } },
        { recallIncorrectCount: { gt: 0 } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { subjectId: true },
  });

  const subjectIds: number[] = [];
  const seen = new Set<number>();
  for (const { subjectId } of mistakeLogs) {
    if (seen.has(subjectId)) continue;
    seen.add(subjectId);
    subjectIds.push(subjectId);
  }

  if (subjectIds.length === 0) {
    return NextResponse.json({ subjects: [] });
  }

  const [assignments, synonyms] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId, subjectId: { in: subjectIds } },
      include: { subject: true },
    }),
    synonymsBySubject(userId, subjectIds),
  ]);
  const byId = new Map(assignments.map((a) => [a.subjectId, a]));

  // Preserve most-recent-first order; a mistake always has a started assignment.
  const dtos = subjectIds
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => ({
      dto: toSubjectDTO(a.subject, synonyms.get(a.subjectId) ?? []),
      srsStage: a.srsStage,
    }));

  // Related subjects (components + amalgamations) for the lesson info tabs.
  const relatedIds = [
    ...new Set(dtos.flatMap((d) => [...d.dto.componentIds, ...d.dto.amalgamationIds])),
  ];
  const relatedSubjects = relatedIds.length
    ? await prisma.subject.findMany({ where: { id: { in: relatedIds } } })
    : [];
  const relatedMap = new Map(
    relatedSubjects.map((r) => {
      const meanings = JSON.parse(r.meanings) as { meaning: string; primary: boolean }[];
      const readings = JSON.parse(r.readings) as { reading: string; primary: boolean }[];
      return [
        r.id,
        {
          id: r.id,
          type: r.type,
          characters: r.characters,
          characterImage: r.characterImage,
          slug: r.slug,
          primaryMeaning: meanings.find((m) => m.primary)?.meaning ?? meanings[0]?.meaning ?? "",
          primaryReading: readings.find((m) => m.primary)?.reading ?? readings[0]?.reading ?? null,
        },
      ];
    }),
  );

  const subjects = dtos.map(({ dto, srsStage }) => ({
    ...dto,
    srsStage,
    components: dto.componentIds.map((id) => relatedMap.get(id)).filter(Boolean),
    amalgamations: dto.amalgamationIds.map((id) => relatedMap.get(id)).filter(Boolean),
  }));

  return NextResponse.json({ subjects });
}
