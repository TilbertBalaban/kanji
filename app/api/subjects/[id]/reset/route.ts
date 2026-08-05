import { NextRequest, NextResponse } from "next/server";
import { parseIntParam } from "@/lib/params";
import { ProgressionError, resetAssignment } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// POST — send this subject's assignment back to "lesson not taken" so it
// re-enters the lesson queue.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const subjectId = parseIntParam((await params).id);
  if (subjectId === null) {
    return NextResponse.json({ error: "invalid subject id" }, { status: 400 });
  }
  try {
    await resetAssignment(userId, subjectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ProgressionError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
