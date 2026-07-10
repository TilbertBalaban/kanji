import { clerkClient } from "@clerk/nextjs/server";

// The per-user WaniKani API token lives in Clerk private metadata: it is only
// readable with the Clerk secret key (never sent to the browser), and it needs
// no extra database table. The profile page only ever sees a masked hint.

const META_KEY = "wanikaniApiKey";

export async function getStoredApiKey(userId: string): Promise<string | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const key = user.privateMetadata?.[META_KEY];
  return typeof key === "string" && key.length > 0 ? key : null;
}

/** Save (or clear, with null) the user's WaniKani API token. */
export async function setStoredApiKey(userId: string, apiKey: string | null): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { [META_KEY]: apiKey },
  });
}

/** Masked form safe to show in the UI, e.g. "••••3f2a". */
export function maskApiKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/** Check a token against the WaniKani API. Returns the account's username. */
export async function validateApiKey(apiKey: string): Promise<string> {
  const res = await fetch("https://api.wanikani.com/v2/user", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Wanikani-Revision": "20170710",
    },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("WaniKani rejected this API token");
  if (!res.ok) throw new Error(`WaniKani API error (${res.status})`);
  const data = (await res.json()) as { data?: { username?: string } };
  return data.data?.username ?? "unknown";
}
