import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resetGrammarProgress } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// POST — drop this grammar point's progress so it re-enters the lesson queue.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const { slug } = await params;
  const point = await prisma.grammarPoint.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!point) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await resetGrammarProgress(userId, point.id);
  return NextResponse.json({ ok: true });
}
