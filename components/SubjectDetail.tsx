"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReadingColumns } from "@/components/ItemInfoPanel";
import { MnemonicText, renderMarkup } from "@/components/MnemonicText";
import { NoteEditor } from "@/components/NoteEditor";
import { ReadingAudio } from "@/components/ReadingAudio";
import { ResetProgressButton } from "@/components/ResetProgressButton";
import { SubjectChar } from "@/components/SubjectChar";
import { SynonymManager } from "@/components/SynonymManager";
import { answerCounts, type AccuracyLog } from "@/lib/accuracy";
import type { SubjectDTO } from "@/lib/serialize";
import { STAGE_NAMES } from "@/lib/srs";
import { subjectPath } from "@/lib/subject-url";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

interface RelatedSubject {
  id: number;
  type: string;
  level: number;
  characters: string | null;
  characterImage: string | null;
  slug: string;
  primaryMeaning: string;
  primaryReading: string | null;
  srsStage: number | null;
}

interface SubjectDetailData {
  subject: SubjectDTO;
  note: { meaningNote: string | null; readingNote: string | null };
  assignment: {
    srsStage: number;
    availableAt: string | null;
    unlockedAt: string | null;
    startedAt: string | null;
  } | null;
  reviewLogs: ({
    id: number;
    createdAt: string;
    startingStage: number;
    endingStage: number;
  } & AccuracyLog)[];
  related: RelatedSubject[];
}

function RadicalCombination({ items }: { items: RelatedSubject[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 border-b border-slate-200 pb-3 text-2xl font-semibold">
        Radical Combination
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {items.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3">
            {i > 0 && <span className="text-2xl text-slate-400">+</span>}
            <Link
              href={subjectPath(r)}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: TYPE_COLORS[r.type], color: "#fff" }}
              >
                <SubjectChar
                  characters={r.characters}
                  characterImage={r.characterImage}
                  className="text-2xl"
                />
              </span>
              <span className="text-lg text-slate-700">{r.primaryMeaning}</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function RelatedList({ title, items }: { title: string; items: RelatedSubject[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => {
          const color = TYPE_COLORS[r.type];
          // srsStage null or 0 means the subject is still locked (not yet studied).
          const studied = r.srsStage !== null && r.srsStage > 0;
          // Vocabulary can be several characters wide, so let its tile grow to
          // fit on one line instead of cramming into a fixed square.
          const isVocab = r.type === "vocabulary";
          return (
            <Link
              key={r.id}
              href={subjectPath(r)}
              title={studied ? "Studied" : "Not studied yet"}
              className={`flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm hover:shadow-md ${
                isVocab ? "min-w-24 max-w-40" : "w-24"
              }`}
            >
              <span
                className={`flex h-12 items-center justify-center rounded-lg ${
                  isVocab ? "min-w-12 max-w-full whitespace-nowrap px-3" : "w-12"
                }`}
                style={
                  studied
                    ? { backgroundColor: color, color: "#fff" }
                    : { color, border: `2px dashed ${color}` }
                }
              >
                <SubjectChar
                  characters={r.characters}
                  characterImage={r.characterImage}
                  className="text-xl"
                />
              </span>
              <span className="text-xs text-slate-500">{r.primaryMeaning}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// Like RelatedList but surfaces each kanji's primary reading, matching the
// WaniKani "Visually Similar Kanji" cards (character, reading, meaning).
function VisuallySimilarList({ items }: { items: RelatedSubject[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 border-b border-slate-200 pb-3 text-2xl font-semibold">
        Visually Similar Kanji
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => {
          const color = TYPE_COLORS[r.type];
          // srsStage null or 0 means the subject is still locked (not yet studied).
          const studied = r.srsStage !== null && r.srsStage > 0;
          return (
            <Link
              key={r.id}
              href={subjectPath(r)}
              title={studied ? "Studied" : "Not studied yet"}
              className="flex w-24 flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm hover:shadow-md"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={
                  studied
                    ? { backgroundColor: color, color: "#fff" }
                    : { color, border: `2px dashed ${color}` }
                }
              >
                <SubjectChar
                  characters={r.characters}
                  characterImage={r.characterImage}
                  className="text-xl"
                />
              </span>
              {r.primaryReading && (
                <span className="text-xs text-slate-700" lang="ja">
                  {r.primaryReading}
                </span>
              )}
              <span className="text-xs text-slate-500">{r.primaryMeaning}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function SubjectDetail({ kind, slug }: { kind: string; slug: string }) {
  const [detail, setDetail] = useState<SubjectDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = () => {
    // The route param may reach a client component already URL-encoded (e.g.
    // "%E4%B8%83" for 七), so decode first and encode exactly once — encoding a
    // raw kanji straight away would double-encode it and 404 the lookup.
    let key = slug;
    try {
      key = decodeURIComponent(slug);
    } catch {
      // slug wasn't valid percent-encoding; use it as-is.
    }
    return fetch(`/api/subjects/by/${kind}/${encodeURIComponent(key)}`).then(async (r) => {
      if (!r.ok) return setNotFound(true);
      setDetail(await r.json());
    });
  };

  useEffect(() => {
    setDetail(null);
    setNotFound(false);
    load();
  }, [kind, slug]);

  if (notFound) return <p className="text-slate-500">Subject not found.</p>;
  if (!detail) return <p className="text-slate-500">Loading…</p>;

  const { subject, note, assignment, reviewLogs, related } = detail;
  const color = TYPE_COLORS[subject.type];
  const acceptedReadings = subject.readings.filter((r) => r.acceptedAnswer);
  // Kanji readings carry an on/kun/nanori type; vocab readings don't.
  const hasReadingTypes = subject.readings.some((r) => r.type);
  const components = related.filter((r) => subject.componentIds.includes(r.id));
  const amalgamations = related.filter((r) => subject.amalgamationIds.includes(r.id));
  const visuallySimilar = related.filter((r) => subject.visuallySimilarIds.includes(r.id));
  const stage = assignment?.srsStage ?? null;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl shadow">
        <div
          className="subject-tile flex flex-col items-center justify-center gap-2 p-10"
          style={{ backgroundColor: color }}
        >
          <SubjectChar
            characters={subject.characters}
            characterImage={subject.characterImage}
            className="text-8xl font-medium"
          />
          <div className="text-lg opacity-90">
            {subject.meanings.find((m) => m.primary)?.meaning}
          </div>
          <div className="text-sm opacity-75">
            {TYPE_LABELS[subject.type]} · Level {subject.level}
          </div>
        </div>
        <div className="flex items-center justify-between bg-slate-800 px-4 py-2 text-sm text-white">
          <span
            className="rounded px-2 py-0.5"
            style={{ backgroundColor: STAGE_GROUP_COLORS[stageGroup(stage)] }}
          >
            {stage === null ? "Locked" : STAGE_NAMES[stage]}
          </span>
          {assignment?.availableAt && (
            <span className="text-slate-300">
              Next review: {new Date(assignment.availableAt).toLocaleString()}
            </span>
          )}
        </div>
        {stage !== null && stage > 0 && (
          <div className="flex justify-end bg-white px-4 py-2">
            <ResetProgressButton
              resetUrl={`/api/subjects/${subject.id}/reset`}
              onReset={load}
            />
          </div>
        )}
      </div>

      <RadicalCombination items={components} />

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-2 text-lg font-semibold">Meaning</h2>
        <p className="mb-3 text-xl">
          {subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning).join(", ")}
        </p>
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
          <div className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-500">
            <MnemonicText text={`Hint: ${subject.meaningHint}`} className="whitespace-pre-line leading-relaxed" />
          </div>
        )}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <SynonymManager subjectId={subject.id} initialSynonyms={subject.userSynonyms} />
        </div>
        <NoteEditor subjectId={subject.id} field="meaning" initialNote={note.meaningNote} />
      </section>

      {acceptedReadings.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Reading</h2>
          {hasReadingTypes ? (
            <ReadingColumns readings={subject.readings} />
          ) : subject.audioUrls.length > 0 ? (
            <div className="mb-3">
              <ReadingAudio
                audioUrls={subject.audioUrls}
                readings={acceptedReadings.map((r) => r.reading)}
              />
            </div>
          ) : (
            <p className="mb-3 text-xl" lang="ja">
              {acceptedReadings.map((r) => r.reading).join("、")}
            </p>
          )}
          {subject.readingMnemonic && (
            <>
              <h3 className="mb-1 text-sm text-slate-400">Mnemonic</h3>
              <MnemonicText text={subject.readingMnemonic} />
            </>
          )}
          {subject.readingHint && (
            <div className="mt-3 rounded-lg bg-slate-100 p-4">
              <h3 className="mb-1 flex items-center gap-1 font-semibold text-slate-700">
                <span aria-hidden>ⓘ</span> Hints
              </h3>
              <MnemonicText text={subject.readingHint} />
            </div>
          )}
          <NoteEditor subjectId={subject.id} field="reading" initialNote={note.readingNote} />
        </section>
      )}

      {subject.contextSentences.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Context sentences</h2>
          {subject.contextSentences.map((s, i) => (
            <p key={i} className="mb-2 text-sm">
              <span lang="ja" className="text-base">
                {s.ja}
              </span>
              <br />
              <span className="text-slate-500">{renderMarkup(s.en)}</span>
            </p>
          ))}
        </section>
      )}

      <VisuallySimilarList items={visuallySimilar} />

      <RelatedList title="Found in" items={amalgamations} />

      {reviewLogs.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Review history</h2>
          <ul className="space-y-1 text-sm">
            {reviewLogs.map((log) => {
              const counts = answerCounts(log);
              const wrong = counts.total - counts.correct;
              return (
                <li key={log.id} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                  <span>
                    {STAGE_NAMES[log.startingStage]} → {STAGE_NAMES[log.endingStage]}
                    {wrong > 0 && (
                      <span className="ml-2 text-red-500">({wrong} wrong)</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
