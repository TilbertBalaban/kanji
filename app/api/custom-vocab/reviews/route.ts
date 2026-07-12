import { NextResponse } from "next/server";
import { toCustomVocabDTO } from "@/lib/custom-vocab";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — the custom-vocab items currently due for review, shuffled.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const items = await prisma.customVocab.findMany({
    where: { userId, availableAt: { lte: new Date() } },
  });

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return NextResponse.json({ items: items.map(toCustomVocabDTO) });
}
