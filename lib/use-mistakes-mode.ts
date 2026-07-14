"use client";

import { useSearchParams } from "next/navigation";

/**
 * True when the page was opened from a Recent Mistakes flow (?source=mistakes).
 * Both flows are extra practice that must never touch the SRS.
 *
 * Uses useSearchParams (not window.location): during a client-side <Link>
 * navigation the new page renders before the browser URL updates, so
 * window.location.search would still show the previous page's query string.
 * Callers must sit under a <Suspense> boundary (see the page files).
 */
export function useMistakesMode(): boolean {
  return useSearchParams().get("source") === "mistakes";
}
