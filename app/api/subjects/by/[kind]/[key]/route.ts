import { NextRequest, NextResponse } from "next/server";
import { buildSubjectDetail, resolveSubjectId } from "@/lib/subject-detail";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// Resolves a human-readable subject URL (/radicals|kanji|vocabulary/{key}) to
// its detail payload. `key` is URL-decoded by Next before it reaches us.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; key: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { kind, key } = await params;
  const subjectId = await resolveSubjectId(kind, key);
  if (subjectId === null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const detail = await buildSubjectDetail(userId, subjectId);
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
