// Shared client-side display helpers: colors per subject type and SRS stage.

// Official WaniKani brand colors (radical blue, kanji pink, vocabulary purple);
// "custom" is ours — user-added vocabulary, amber to stand apart from the trio.
export const TYPE_COLORS: Record<string, string> = {
  radical: "#00a1f1",
  kanji: "#f100a1",
  vocabulary: "#a100f1",
  kana_vocabulary: "#a100f1",
  custom: "#f1a100",
};

export const TYPE_LABELS: Record<string, string> = {
  radical: "Radical",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  kana_vocabulary: "Vocabulary",
  custom: "Custom Vocab",
};

// The stage model (and its display grouping) lives in lib/srs.ts.
export { stageGroup } from "./srs";

export const STAGE_GROUP_COLORS: Record<string, string> = {
  locked: "#9ca3af",
  apprentice: "#dd0093",
  guru: "#882d9e",
  master: "#294ddb",
  enlightened: "#0093dd",
  burned: "#434343",
};
