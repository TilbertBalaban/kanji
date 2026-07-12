"use client";

import Link from "next/link";
import { MnemonicText } from "@/components/MnemonicText";
import { ReadingAudio } from "@/components/ReadingAudio";
import { SubjectChar } from "@/components/SubjectChar";
import type { SubjectDTO } from "@/lib/serialize";
import type { Reading } from "@/lib/srs";
import { subjectPath } from "@/lib/subject-url";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

// The On'yomi / Kun'yomi / Nanori grid WaniKani shows for kanji. Each column
// lists that type's readings (or "None"); the primary reading's column is bold.
export function ReadingColumns({ readings }: { readings: Reading[] }) {
  const primaryType = readings.find((r) => r.primary)?.type;
  const columns: { key: string; label: string }[] = [
    { key: "onyomi", label: "On'yomi" },
    { key: "kunyomi", label: "Kun'yomi" },
    { key: "nanori", label: "Nanori" },
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {columns.map(({ key, label }) => {
        const list = readings.filter((r) => r.type === key);
        const isPrimary = key === primaryType;
        return (
          <div key={key}>
            <div className={`text-sm ${isPrimary ? "font-semibold text-slate-700" : "text-slate-400"}`}>
              {label}
            </div>
            <div className="text-xl" lang="ja">
              {list.length > 0 ? list.map((r) => r.reading).join("、") : (
                <span className="text-slate-400">None</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The WaniKani "Item Info" panel shown under a graded quiz answer: full
// meaning and reading info with mnemonics and hints, pronunciation audio,
// and context sentences — all rendered from the already-loaded subject DTO.
export function ItemInfoPanel({ subject }: { subject: SubjectDTO }) {
  const acceptedMeanings = subject.meanings.filter((m) => m.acceptedAnswer);
  const acceptedReadings = subject.readings.filter((r) => r.acceptedAnswer);
  // Kanji readings carry an on/kun/nanori type; vocab readings don't.
  const hasReadingTypes = subject.readings.some((r) => r.type);

  return (
    <div className="space-y-4 rounded-xl bg-white p-5 text-left text-sm shadow">
      <div className="flex items-center gap-4">
        <div
          className="subject-tile flex items-center justify-center rounded-lg px-4 py-2 text-4xl font-medium"
          style={{ backgroundColor: TYPE_COLORS[subject.type] }}
          lang="ja"
        >
          <SubjectChar characters={subject.characters} characterImage={subject.characterImage} />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {TYPE_LABELS[subject.type]}
          </div>
          {acceptedReadings.length > 0 && (
            <p className="text-lg text-slate-700" lang="ja">
              {acceptedReadings.map((r) => r.reading).join("、")}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Meaning
        </h3>
        <p className="mb-2 text-lg">
          {acceptedMeanings.map((m) => m.meaning).join(", ")}
        </p>
        {subject.userSynonyms.length > 0 && (
          <p className="mb-2 text-slate-500">
            Your synonyms: {subject.userSynonyms.join(", ")}
          </p>
        )}
        {subject.mnemonicImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={subject.mnemonicImage}
            alt={`${TYPE_LABELS[subject.type]} mnemonic`}
            className="mx-auto mb-3 max-h-64 rounded-lg border border-slate-200"
          />
        )}
        <MnemonicText text={subject.meaningMnemonic} />
        {subject.meaningHint && (
          <p className="mt-2 rounded bg-slate-50 p-2 text-slate-500">
            Hint: {subject.meaningHint}
          </p>
        )}
      </div>

      {acceptedReadings.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reading
          </h3>
          {hasReadingTypes ? (
            <ReadingColumns readings={subject.readings} />
          ) : subject.audioUrls.length > 0 ? (
            <div className="mb-2">
              <ReadingAudio
                audioUrls={subject.audioUrls}
                readings={acceptedReadings.map((r) => r.reading)}
              />
            </div>
          ) : (
            <p className="mb-2 text-lg" lang="ja">
              {acceptedReadings.map((r) => r.reading).join("、")}
            </p>
          )}
          {subject.readingMnemonic && <MnemonicText text={subject.readingMnemonic} />}
          {subject.readingHint && (
            <p className="mt-2 rounded bg-slate-50 p-2 text-slate-500">
              Hint: {subject.readingHint}
            </p>
          )}
        </div>
      )}

      {subject.partsOfSpeech.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Word type
          </h3>
          <p>{subject.partsOfSpeech.join(", ")}</p>
        </div>
      )}

      {subject.contextSentences.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Context sentences
          </h3>
          {subject.contextSentences.slice(0, 3).map((s, i) => (
            <p key={i} className="mb-2">
              <span lang="ja" className="text-base">
                {s.ja}
              </span>
              <br />
              <span className="text-slate-500">{s.en}</span>
            </p>
          ))}
        </div>
      )}

      <Link
        href={subjectPath(subject)}
        target="_blank"
        className="inline-block text-sky-600 hover:underline"
      >
        Open full details page ↗
      </Link>
    </div>
  );
}
