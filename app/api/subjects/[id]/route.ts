import { NextRequest, NextResponse } from "next/server";
import { buildSubjectDetail } from "@/lib/subject-detail";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { id } = await params;
  const detail = await buildSubjectDetail(userId, Number(id));
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
