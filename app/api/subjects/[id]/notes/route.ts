import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIntParam } from "@/lib/params";
import { requireUserId } from "@/lib/user";
import { noteForSubject, normalizeNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

// GET — the current user's meaning/reading notes for this subject.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = parseIntParam((await params).id);
  if (subjectId === null) {
    return NextResponse.json({ error: "invalid subject id" }, { status: 400 });
  }
  return NextResponse.json({ note: await noteForSubject(userId, subjectId) });
}

// PUT { field: "meaning" | "reading", value } — set (or clear, when empty) one note.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = parseIntParam((await params).id);
  if (subjectId === null) {
    return NextResponse.json({ error: "invalid subject id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const field = body?.field;
  if (field !== "meaning" && field !== "reading") {
    return NextResponse.json({ error: "field must be 'meaning' or 'reading'" }, { status: 400 });
  }
  const value = normalizeNote(body?.value);

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const column = field === "meaning" ? "meaningNote" : "readingNote";
  await prisma.userNote.upsert({
    where: { userId_subjectId: { userId, subjectId } },
    create: { userId, subjectId, [column]: value },
    update: { [column]: value },
  });

  return NextResponse.json({ note: await noteForSubject(userId, subjectId) });
}
