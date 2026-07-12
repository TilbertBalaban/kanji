// The one WaniKani HTTP client. Every module that talks to the WaniKani API
// (account sync, content sync, key validation, backfill scripts) goes through
// wkFetch so the base URL, API revision, rate-limit backoff, and auth errors
// live in exactly one place. Must stay free of next/headers so standalone tsx
// scripts can import it.

export const WK_API_BASE = "https://api.wanikani.com/v2";
export const WK_REVISION = "20170710";

export async function wkFetch<T>(
  apiKey: string,
  url: string,
  init: RequestInit = {},
  attempt = 1,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Wanikani-Revision": WK_REVISION,
      ...init.headers,
    },
  });
  if (res.status === 429 && attempt <= 5) {
    // Rate limited (60 req/min) — wait for the window to reset.
    const wait = 15_000 * attempt;
    await new Promise((r) => setTimeout(r, wait));
    return wkFetch<T>(apiKey, url, init, attempt + 1);
  }
  if (res.status === 401) {
    throw new Error("WaniKani rejected the API key (401 Unauthorized)");
  }
  if (!res.ok) {
    throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
