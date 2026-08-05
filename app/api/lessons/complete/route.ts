import { NextRequest, NextResponse } from "next/server";
import { startLessons } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const subjectIds: number[] = body.subjectIds;
  if (
    !Array.isArray(subjectIds) ||
    subjectIds.some((id) => typeof id !== "number" || !Number.isInteger(id))
  ) {
    return NextResponse.json({ error: "subjectIds must be an integer array" }, { status: 400 });
  }
  await startLessons(userId, subjectIds);
  return NextResponse.json({ ok: true });
}
