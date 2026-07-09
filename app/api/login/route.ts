import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GATE_COOKIE, SESSION_COOKIE } from "@/lib/users";
import { checkPassword, sign, GATE_PAYLOAD } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

function cookieOpts(maxAge: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

/** Verify the shared password and set the gate cookie. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!checkPassword(body?.password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const store = await cookies();
  store.set(GATE_COOKIE, sign(GATE_PAYLOAD), cookieOpts(ONE_YEAR));
  return NextResponse.json({ ok: true });
}

/** Full logout: clear both the gate and the selected user. */
export async function DELETE() {
  const store = await cookies();
  store.delete(GATE_COOKIE);
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
