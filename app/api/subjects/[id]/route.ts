import { NextRequest, NextResponse } from "next/server";
import { parseIntParam } from "@/lib/params";
import { buildSubjectDetail } from "@/lib/subject-detail";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

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
  const detail = await buildSubjectDetail(userId, subjectId);
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
