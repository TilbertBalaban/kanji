import { NextRequest, NextResponse } from "next/server";
import { parseCustomVocabInput, toCustomVocabDTO } from "@/lib/custom-vocab";
import { prisma } from "@/lib/db";
import { parseIntParam } from "@/lib/params";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// PATCH { characters, meanings, readings?, notes? } — edit an item's content.
// SRS state is untouched: fixing a typo shouldn't reset progress.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const id = parseIntParam((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const input = parseCustomVocabInput(await req.json().catch(() => ({})));
  if (typeof input === "string") {
    return NextResponse.json({ error: input }, { status: 400 });
  }

  const existing = await prisma.customVocab.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Reading-only items (characters = null) sit outside the unique index — see
  // the POST route — so their duplicates are caught by hand.
  if (input.characters === null) {
    const duplicate = await prisma.customVocab.findFirst({
      where: { userId, characters: null, readings: JSON.stringify(input.readings), NOT: { id } },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `“${input.readings[0]}” is already in your custom vocabulary.` },
        { status: 409 },
      );
    }
  }

  try {
    const item = await prisma.customVocab.update({
      where: { id },
      data: {
        characters: input.characters,
        meanings: JSON.stringify(input.meanings),
        readings: JSON.stringify(input.readings),
        notes: input.notes,
      },
    });
    return NextResponse.json({ item: toCustomVocabDTO(item) });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: `“${input.characters}” is already in your custom vocabulary.` },
        { status: 409 },
      );
    }
    throw e;
  }
}

// DELETE — remove an item (and its SRS progress) permanently.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const id = parseIntParam((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const { count } = await prisma.customVocab.deleteMany({ where: { id, userId } });
  if (count === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
