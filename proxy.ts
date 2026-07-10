import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Next 16 renamed the `middleware` file convention to `proxy`. Clerk's
// middleware is a plain NextMiddleware, so it works as the default export.
//
// Public: the auth screens, and /api/cron (called by Vercel Cron with no
// Clerk session — it does its own CRON_SECRET check). Everything else needs
// a signed-in user: API requests get a 401 JSON response, page requests are
// redirected to /sign-in. API routes ALSO check auth themselves via
// requireUserId (lib/user.ts) — this is just the outer wall.
const PUBLIC_PATH = /^\/(sign-in|sign-up|api\/cron)(\/|$)/;

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATH.test(pathname)) return;

  if (pathname.startsWith("/api")) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files (unless found in search params).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3|ogg)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path (frontend API proxied through this domain).
    "/__clerk/:path*",
  ],
};
