import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recentMistakeSubjectIds } from "@/lib/mistakes";
import { toRelatedSubject, toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

// Recent Mistakes (WaniKani semantics — see lib/mistakes.ts), deduped,
// most-recent first. Powers both "Recent Mistakes" flows — Extra Study
// (review-style) and Redo Lessons (lesson-style) — so it returns the SRS
// stage plus the related components/amalgamations the lesson info tabs need.
// Both flows are extra practice that must NOT touch SRS, so this endpoint is
// strictly read-only.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectIds = await recentMistakeSubjectIds(userId);

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
  const relatedMap = new Map(relatedSubjects.map((r) => [r.id, toRelatedSubject(r)]));

  const subjects = dtos.map(({ dto, srsStage }) => ({
    ...dto,
    srsStage,
    components: dto.componentIds.map((id) => relatedMap.get(id)).filter(Boolean),
    amalgamations: dto.amalgamationIds.map((id) => relatedMap.get(id)).filter(Boolean),
  }));

  return NextResponse.json({ subjects });
}
