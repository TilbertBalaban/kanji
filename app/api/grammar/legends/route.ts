import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toGrammarLegendDTO } from "@/lib/grammar";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — every legend modal keyed by GrammarLegendKey. Static site-wide
// content (seeded by scripts/seed-grammar-legends.ts); the client fetches
// once and caches for the session (see components/GrammarLegendModal.tsx).
export async function GET() {
  const { response } = await requireUserId();
  if (response) return response;

  const rows = await prisma.grammarLegend.findMany();
  return NextResponse.json({
    legends: Object.fromEntries(rows.map((l) => [l.key, toGrammarLegendDTO(l)])),
  });
}
