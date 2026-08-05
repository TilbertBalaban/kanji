import type { NextConfig } from "next";

// Proxy R2 asset bytes through the app's own origin. Radical character-images
// are used as CSS `mask` sources (see components/SubjectChar.tsx), and browsers
// refuse to paint a cross-origin image as a mask — so they must be same-origin.
const R2_BASE = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!R2_BASE) {
      // Silent absence used to surface only as blank radical glyphs in
      // production — make the misconfiguration visible at build time.
      console.warn(
        "R2_PUBLIC_BASE_URL is not set at build time — /r2-asset/* will 404 and radical character images will be blank.",
      );
      return [];
    }
    return [{ source: "/r2-asset/:path*", destination: `${R2_BASE}/:path*` }];
  },
};

export default nextConfig;
