"use client";

import { useState } from "react";

/**
 * True when the page was opened from a Recent Mistakes flow (?source=mistakes).
 * Both flows are extra practice that must never touch the SRS.
 */
export function useMistakesMode(): boolean {
  const [mistakesMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("source") === "mistakes",
  );
  return mistakesMode;
}
