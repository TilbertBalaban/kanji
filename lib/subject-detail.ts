import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { noteForSubject } from "./notes";
import { toRelatedSubject, toSubjectDTO } from "./serialize";
import { synonymsBySubject } from "./synonyms";

// Maps the URL kind segment to the DB `type` filter used to resolve a subject
// from its human-readable key (slug for radicals, characters otherwise).
const KIND_WHERE: Record<string, (key: string) => Prisma.SubjectWhereInput> = {
  radicals: (key) => ({ type: "radical", slug: key }),
  kanji: (key) => ({ type: "kanji", characters: key }),
  vocabulary: (key) => ({
    type: { in: ["vocabulary", "kana_vocabulary"] },
    characters: key,
  }),
};

/** Resolve a `/radicals|kanji|vocabulary/{key}` URL to a numeric subject id. */
export async function resolveSubjectId(kind: string, key: string): Promise<number | null> {
  const build = KIND_WHERE[kind];
  if (!build) return null;
  const subject = await prisma.subject.findFirst({ where: build(key), select: { id: true } });
  return subject?.id ?? null;
}

/** The full subject-detail payload (subject, note, assignment, logs, related). */
export async function buildSubjectDetail(userId: string, subjectId: number) {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      assignments: { where: { userId } },
      reviewLogs: { where: { userId }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!subject) return null;

  const synonyms = await synonymsBySubject(userId, [subject.id]);
  const dto = toSubjectDTO(subject, synonyms.get(subject.id) ?? []);
  const note = await noteForSubject(userId, subject.id);
  const related = await prisma.subject.findMany({
    where: {
      id: { in: [...dto.componentIds, ...dto.amalgamationIds, ...dto.visuallySimilarIds] },
    },
    include: { assignments: { where: { userId }, select: { srsStage: true } } },
  });

  return {
    subject: dto,
    note,
    assignment: subject.assignments[0] ?? null,
    reviewLogs: subject.reviewLogs,
    related: related.map((r) => ({
      ...toRelatedSubject(r),
      level: r.level,
      srsStage: r.assignments[0]?.srsStage ?? null,
    })),
  };
}
