// Radical character-images live on R2 (a different origin than the app). A plain
// <img> can load them cross-origin, but a CSS `mask` cannot: browsers apply a
// CORS restriction to mask sources that ordinary images don't get, and the
// cross-origin mask silently paints nothing — which is why image-only radicals
// (beggar, kick, rib-cage…) came up blank on mobile.
//
// The `/r2-asset/*` rewrite in next.config.ts proxies those same bytes through
// the app's own origin, so the mask is same-origin and paints. We rewrite any
// absolute asset URL to that prefix by its pathname; relative URLs (already
// same-origin) pass through untouched. Runs identically on server and client —
// no `window`/env lookup — so SSR and hydration agree.
export function sameOriginAsset(url: string): string {
  const m = /^https?:\/\/[^/]+(\/.*)$/.exec(url);
  return m ? `/r2-asset${m[1]}` : url;
}
