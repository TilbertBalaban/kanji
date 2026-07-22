import { NextRequest, NextResponse } from "next/server";
import { parseIntParam } from "@/lib/params";
import { resetCustomVocab } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// POST — restart this item's SRS clock back to Apprentice I.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const id = parseIntParam((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    await resetCustomVocab(userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 422 });
  }
}
