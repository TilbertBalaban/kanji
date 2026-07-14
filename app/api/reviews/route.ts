import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reviewsDueBefore } from "@/lib/progression";
import { relatedAnswersBySubject } from "@/lib/related-answers";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const assignments = await prisma.assignment.findMany({
    where: { userId, availableAt: { lte: await reviewsDueBefore(userId) } },
    include: { subject: true },
  });

  // Shuffle so review order varies session to session.
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  const [synonyms, related] = await Promise.all([
    synonymsBySubject(
      userId,
      assignments.map((a) => a.subjectId),
    ),
    relatedAnswersBySubject(assignments.map((a) => a.subject)),
  ]);

  return NextResponse.json({
    subjects: assignments.map((a) => ({
      ...toSubjectDTO(a.subject, synonyms.get(a.subjectId) ?? []),
      related: related.get(a.subjectId),
      srsStage: a.srsStage,
    })),
  });
}
