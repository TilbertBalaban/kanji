// Shared client-side display helpers: colors per subject type and SRS stage.

export const TYPE_COLORS: Record<string, string> = {
  radical: "#00aaff",
  kanji: "#ff00aa",
  vocabulary: "#9e00ff",
  kana_vocabulary: "#9e00ff",
};

export const TYPE_LABELS: Record<string, string> = {
  radical: "Radical",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  kana_vocabulary: "Vocabulary",
};

export function stageGroup(stage: number | null): string {
  if (stage === null || stage === 0) return "locked";
  if (stage < 5) return "apprentice";
  if (stage < 7) return "guru";
  if (stage === 7) return "master";
  if (stage === 8) return "enlightened";
  return "burned";
}

export const STAGE_GROUP_COLORS: Record<string, string> = {
  locked: "#9ca3af",
  apprentice: "#dd0093",
  guru: "#882d9e",
  master: "#294ddb",
  enlightened: "#0093dd",
  burned: "#434343",
};
