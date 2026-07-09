/* eslint-disable @next/next/no-img-element */
// Renders a subject's characters, falling back to the radical image for
// image-only radicals.

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
    return (
      <img
        src={characterImage}
        alt="radical"
        className={`inline-block invert ${className}`}
        style={{ height: "1em", width: "auto" }}
      />
    );
  }
  return <span className={className}>?</span>;
}
