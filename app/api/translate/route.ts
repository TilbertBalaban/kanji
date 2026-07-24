import { NextRequest, NextResponse } from "next/server";
import { isTranslateLang, parseTranslateResponse } from "@/lib/translate";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// Unofficial Google Translate endpoint (the one the translate.google.com site
// itself calls). No API key; dt=t returns the translation, dt=rm the
// romanization we turn into a kana reading. Proxied server-side so the browser
// doesn't hit CORS and so the call sits behind the same auth wall as the rest
// of the API.
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

// POST { text, from, to } — from/to are "ja" | "en" | "uk". Returns the parsed
// translation and romanizations (see TranslateResult).
export async function POST(req: NextRequest) {
  const { response } = await requireUserId();
  if (response) return response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const { from, to } = body;

  if (!text) {
    return NextResponse.json({ error: "Nothing to translate." }, { status: 400 });
  }
  if (text.length > 200) {
    return NextResponse.json(
      { error: "That's too long to translate (max 200 characters)." },
      { status: 400 },
    );
  }
  if (!isTranslateLang(from) || !isTranslateLang(to) || from === to) {
    return NextResponse.json({ error: "Unsupported language pair." }, { status: 400 });
  }

  const url =
    `${ENDPOINT}?client=gtx&dt=t&dt=rm&sl=${from}&tl=${to}` + `&q=${encodeURIComponent(text)}`;

  let raw: unknown;
  try {
    const res = await fetch(url, {
      // The endpoint 403s requests without a browser-like User-Agent.
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`translate responded ${res.status}`);
    raw = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Translation service is unavailable right now — please try again." },
      { status: 502 },
    );
  }

  const parsed = parseTranslateResponse(raw);
  if (!parsed) {
    return NextResponse.json({ error: "No translation found." }, { status: 502 });
  }
  return NextResponse.json(parsed);
}
