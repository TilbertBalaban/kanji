import { NextRequest, NextResponse } from "next/server";
import { parseCustomVocabInput, toCustomVocabDTO } from "@/lib/custom-vocab";
import { prisma } from "@/lib/db";
import { reviewsDueBefore } from "@/lib/progression";
import { nextAvailableAt } from "@/lib/srs";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — all of the current user's custom vocab, newest first, plus the number
// of items currently due for review.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const dueBefore = await reviewsDueBefore(userId);
  const [items, dueCount] = await Promise.all([
    prisma.customVocab.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.customVocab.count({ where: { userId, availableAt: { lte: dueBefore } } }),
  ]);

  return NextResponse.json({ items: items.map(toCustomVocabDTO), dueCount });
}

// POST { characters, meanings, readings?, notes? } — add a new item. It enters
// the SRS at Apprentice I with the first review due after the stage-1 interval,
// exactly as if a lesson had just been completed.
export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const input = parseCustomVocabInput(await req.json().catch(() => ({})));
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  // A reading-only item has characters = null, which the (userId, characters)
  // unique index can't police — Postgres treats every NULL as distinct — so
  // check it by reading here to keep "already in your list" working.
  if (input.characters === null) {
    const duplicate = await prisma.customVocab.findFirst({
      where: { userId, characters: null, readings: JSON.stringify(input.readings) },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `“${input.readings[0]}” is already in your custom vocabulary.` },
        { status: 409 },
      );
    }
  }

  const now = new Date();
  try {
    const item = await prisma.customVocab.create({
      data: {
        userId,
        characters: input.characters,
        meanings: JSON.stringify(input.meanings),
        readings: JSON.stringify(input.readings),
        notes: input.notes,
        srsStage: 1,
        availableAt: nextAvailableAt(1, now),
      },
    });
    return NextResponse.json({ item: toCustomVocabDTO(item) }, { status: 201 });
  } catch (e) {
    // Unique (userId, characters) violation — the word is already in the list.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: `“${input.characters}” is already in your custom vocabulary.` },
        { status: 409 },
      );
    }
    throw e;
  }
}
