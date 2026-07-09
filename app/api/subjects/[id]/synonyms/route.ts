import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/user";
import { normalizeSynonym } from "@/lib/synonyms";

export const dynamic = "force-dynamic";

async function currentSynonyms(userId: string, subjectId: number): Promise<string[]> {
  const rows = await prisma.userSynonym.findMany({
    where: { userId, subjectId },
    orderBy: { createdAt: "asc" },
    select: { synonym: true },
  });
  return rows.map((r) => r.synonym);
}

// GET — list the current user's synonyms for this subject.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = Number((await params).id);
  return NextResponse.json({ synonyms: await currentSynonyms(userId, subjectId) });
}

// POST { synonym } — add one synonym (idempotent on the unique constraint).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  const synonym = normalizeSynonym(body?.synonym);
  if (!synonym) {
    return NextResponse.json({ error: "Empty synonym" }, { status: 400 });
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.userSynonym.upsert({
    where: { userId_subjectId_synonym: { userId, subjectId, synonym } },
    create: { userId, subjectId, synonym },
    update: {},
  });

  return NextResponse.json({ synonyms: await currentSynonyms(userId, subjectId) });
}

// DELETE { synonym } — remove one synonym.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  const synonym = normalizeSynonym(body?.synonym);
  if (!synonym) {
    return NextResponse.json({ error: "Empty synonym" }, { status: 400 });
  }

  await prisma.userSynonym.deleteMany({ where: { userId, subjectId, synonym } });

  return NextResponse.json({ synonyms: await currentSynonyms(userId, subjectId) });
}
