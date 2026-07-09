import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSubjectDTO } from "@/lib/serialize";
import { requireUserId } from "@/lib/user";
import { synonymsBySubject } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const assignments = await prisma.assignment.findMany({
    where: { userId, availableAt: { lte: new Date() } },
    include: { subject: true },
  });

  // Shuffle so review order varies session to session.
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  const synonyms = await synonymsBySubject(
    userId,
    assignments.map((a) => a.subjectId),
  );

  return NextResponse.json({
    subjects: assignments.map((a) => ({
      ...toSubjectDTO(a.subject, synonyms.get(a.subjectId) ?? []),
      srsStage: a.srsStage,
    })),
  });
}
