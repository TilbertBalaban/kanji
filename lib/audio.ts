// Pronunciation audio for vocabulary, as stored (JSON) and served to the client.
// Each clip carries the reading it voices plus the voice actor, so the UI can
// group speakers under each reading the way WaniKani does.
export interface PronunciationAudio {
  url: string;
  contentType: string; // "audio/mpeg" | "audio/webm"
  pronunciation: string; // the reading this clip voices, e.g. "きゅう"
  voiceActorName: string; // "Kyoko" | "Kenichi"
  gender: string; // "female" | "male"
  accent: string; // voice_description, e.g. "Tokyo accent"
}

// Raw shape from the WaniKani API v2 (data.pronunciation_audios[]).
export interface WKPronunciationAudio {
  url: string;
  content_type: string;
  metadata?: {
    pronunciation?: string;
    voice_actor_name?: string;
    gender?: string;
    voice_description?: string;
  };
}

// Pick a single clip to play (for review/lesson autoplay). Prefers mpeg for
// cross-browser playback, optionally restricts to a given reading, and picks a
// random voice actor among the candidates the way WaniKani does.
export function pickAudioClip(
  audioUrls: PronunciationAudio[],
  reading?: string,
): string | null {
  if (audioUrls.length === 0) return null;
  const forReading = reading
    ? audioUrls.filter((a) => a.pronunciation === reading)
    : [];
  const pool = forReading.length > 0 ? forReading : audioUrls;
  const mpeg = pool.filter((a) => a.contentType === "audio/mpeg");
  const choices = mpeg.length > 0 ? mpeg : pool;
  return choices[Math.floor(Math.random() * choices.length)].url;
}

export function mapAudioUrls(
  audios: WKPronunciationAudio[] | undefined,
): PronunciationAudio[] {
  return (audios ?? []).map((a) => ({
    url: a.url,
    contentType: a.content_type,
    pronunciation: a.metadata?.pronunciation ?? "",
    voiceActorName: a.metadata?.voice_actor_name ?? "",
    gender: a.metadata?.gender ?? "",
    accent: a.metadata?.voice_description ?? "",
  }));
}
