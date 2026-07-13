import { NextResponse } from "next/server";
import { sameMeaningCustomVocab, toCustomVocabDTO } from "@/lib/custom-vocab";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — the custom-vocab items currently due for review, shuffled. Each item
// carries the readings of the user's *other* words sharing a meaning, so the
// recall prompt can shake a right-word-wrong-card answer instead of failing it.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  // The whole collection, so same-meaning variants aren't limited to what
  // happens to be due right now.
  const all = (await prisma.customVocab.findMany({ where: { userId } })).map(toCustomVocabDTO);
  const sameMeaning = sameMeaningCustomVocab(all);

  const now = new Date().toISOString();
  const items = all.filter((v) => v.availableAt !== null && v.availableAt <= now);

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return NextResponse.json({
    items: items.map((item) => {
      const variants = sameMeaning.get(item.id);
      return variants ? { ...item, related: { sameMeaningVocab: variants } } : item;
    }),
  });
}
