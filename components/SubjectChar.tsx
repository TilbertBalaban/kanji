// Renders a subject's characters, falling back to the radical image for
// image-only radicals.
//
// Image-only radicals are SVGs whose strokes are `var(--color-text, #000)`.
// That CSS variable never reaches an <img>'s SVG, so it falls back to black —
// invisible on light tiles and wrong on colored ones. Instead of guessing with
// an `invert` filter, we paint the glyph with the surrounding text color via a
// CSS mask, so it matches the adjacent text everywhere (white on colored tiles,
// the type color on light backgrounds).

export function SubjectChar({
  characters,
  characterImage,
  className = "",
}: {
  characters: string | null;
  characterImage: string | null;
  className?: string;
}) {
  if (characters) return <span className={className}>{characters}</span>;
  if (characterImage) {
    const mask = `url("${characterImage}") center / contain no-repeat`;
    return (
      <span
        role="img"
        aria-label="radical"
        className={`inline-block ${className}`}
        style={{
          height: "1em",
          width: "1em",
          backgroundColor: "currentColor",
          WebkitMask: mask,
          mask,
        }}
      />
    );
  }
  return <span className={className}>?</span>;
}
