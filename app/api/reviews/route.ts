import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPacingSettings, reviewsDueBefore } from "@/lib/progression";
import { relatedAnswersBySubject } from "@/lib/related-answers";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const [{ reviewBatchSize }, dueBefore] = await Promise.all([
    getPacingSettings(userId),
    reviewsDueBefore(userId),
  ]);

  // Only the stage/id pairs first: a queue of hundreds must not drag every
  // subject row (mnemonics and all) over the wire just to serve one batch.
  const due = await prisma.assignment.findMany({
    where: { userId, availableAt: { lte: dueBefore } },
    select: { subjectId: true, srsStage: true },
  });

  // Shuffle so review order varies session to session — and so each batch is a
  // random slice of the queue rather than the oldest items every time.
  for (let i = due.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [due[i], due[j]] = [due[j], due[i]];
  }
  const batch = due.slice(0, reviewBatchSize);

  const subjects = await prisma.subject.findMany({
    where: { id: { in: batch.map((a) => a.subjectId) } },
  });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const [synonyms, related] = await Promise.all([
    synonymsBySubject(
      userId,
      batch.map((a) => a.subjectId),
    ),
    relatedAnswersBySubject(subjects),
  ]);

  return NextResponse.json({
    subjects: batch
      .map((a) => {
        const subject = subjectById.get(a.subjectId);
        if (!subject) return null;
        return {
          ...toSubjectDTO(subject, synonyms.get(a.subjectId) ?? []),
          related: related.get(a.subjectId),
          srsStage: a.srsStage,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
    totalDue: due.length,
    batchSize: reviewBatchSize,
  });
}
