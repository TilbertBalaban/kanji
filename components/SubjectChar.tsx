"use client";

// Renders a subject's characters, falling back to the radical image for
// image-only radicals.
//
// Image-only radicals are SVGs whose strokes are `var(--color-text, #000)`.
// We want them tinted to match the surrounding text (white on colored tiles,
// the type color on light backgrounds). The obvious techniques all fail:
//   - A plain <img> can't read `--color-text`, so the strokes render black —
//     invisible or wrong depending on the tile.
//   - A CSS `mask` can tint via currentColor, but browsers refuse to paint a
//     *cross-origin* image as a mask (these SVGs live on R2), so the glyph came
//     up blank on mobile. Same-origin masks work but are still finicky to size.
//
// Instead we inline the SVG into the DOM. Inlined, its `var(--color-text)`
// strokes resolve straight from the CSS cascade, so setting `--color-text:
// currentColor` on the wrapper tints the glyph to match the adjacent text
// everywhere — and inline SVG sizes reliably from its viewBox (unlike an <img>,
// whose intrinsic size iOS Safari computes as 0 for a viewBox-only SVG). The
// bytes are fetched once through the app's own origin (see lib/asset-url.ts and
// the /r2-asset rewrite) and cached across every tile that reuses them.

import { useEffect, useState, type CSSProperties } from "react";
import { sameOriginAsset } from "@/lib/asset-url";

// Keyed by the original (stored) characterImage URL. Both maps are shared across
// every SubjectChar instance so a glyph is fetched at most once per session.
const svgCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function prepareSvg(raw: string): string {
  return raw
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "") // defensive: strip any script
    .replace(/<svg\b/i, '<svg focusable="false" style="display:block;height:1em;width:auto"')
    .trim();
}

function loadSvg(characterImage: string): Promise<string> {
  const cached = svgCache.get(characterImage);
  if (cached) return Promise.resolve(cached);
  let p = inflight.get(characterImage);
  if (!p) {
    p = fetch(sameOriginAsset(characterImage))
      .then((r) => {
        if (!r.ok) throw new Error(`asset ${r.status}`);
        return r.text();
      })
      .then((t) => {
        const clean = prepareSvg(t);
        svgCache.set(characterImage, clean);
        return clean;
      })
      .finally(() => inflight.delete(characterImage));
    inflight.set(characterImage, p);
  }
  return p;
}

function RadicalImage({ characterImage, className }: { characterImage: string; className: string }) {
  // State is tagged with the URL it belongs to, so switching characterImage in
  // place never flashes the previous glyph and we never setState synchronously
  // inside the effect (loadSvg resolves on a microtask even for cache hits).
  const [loaded, setLoaded] = useState<{ url: string; svg: string } | null>(() => {
    const cached = svgCache.get(characterImage);
    return cached ? { url: characterImage, svg: cached } : null;
  });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadSvg(characterImage).then(
      (svg) => active && setLoaded({ url: characterImage, svg }),
      () => active && setFailedUrl(characterImage),
    );
    return () => {
      active = false;
    };
  }, [characterImage]);

  const svg = loaded?.url === characterImage ? loaded.svg : null;

  // Fall back to a plain same-origin <img> (visible, if uncolored) if the SVG
  // can't be fetched — never leave the tile blank.
  if (failedUrl === characterImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny SVG glyph, not a content image; next/image doesn't optimize SVG
      <img
        src={sameOriginAsset(characterImage)}
        alt="radical"
        className={`inline-block ${className}`}
        style={{ height: "1em", width: "auto" }}
      />
    );
  }

  // `--color-text` is the variable the radical SVGs reference for their strokes;
  // pointing it at currentColor makes them inherit the tile's text color.
  const style = { height: "1em", "--color-text": "currentColor" } as CSSProperties;
  return (
    <span
      role="img"
      aria-label="radical"
      className={`inline-flex items-center ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}

export function SubjectChar({
  characters,
  characterImage,
  className = "",
}: {
  characters: string | null;
  characterImage: string | null;
  className?: string;
}) {
  if (characters) return <span lang="ja" className={className}>{characters}</span>;
  if (characterImage) return <RadicalImage characterImage={characterImage} className={className} />;
  return <span className={className}>?</span>;
}
