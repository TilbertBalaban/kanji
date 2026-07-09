import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isUserId, SESSION_COOKIE } from "@/lib/users";
import { sign } from "@/lib/auth";
import { getCurrentUserId, hasValidGate } from "@/lib/user";
import { ensureUserInitialized } from "@/lib/progression";

export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Current auth state: whether the password gate is passed and who is selected. */
export async function GET() {
  const [authed, user] = await Promise.all([hasValidGate(), getCurrentUserId()]);
  return NextResponse.json({ authed, user });
}

/** Select a user (requires the password gate): init their progress, set cookie. */
export async function POST(req: NextRequest) {
  if (!(await hasValidGate())) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const user = body?.user;
  if (!isUserId(user)) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }

  await ensureUserInitialized(user);

  const store = await cookies();
  store.set(SESSION_COOKIE, sign(user), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
  });
  return NextResponse.json({ ok: true, user });
}

/** Switch user: clear only the selected user, keep the password gate. */
export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
