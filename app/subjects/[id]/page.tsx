"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { MnemonicText } from "@/components/MnemonicText";
import { SubjectChar } from "@/components/SubjectChar";
import { SynonymManager } from "@/components/SynonymManager";
import type { SubjectDTO } from "@/lib/serialize";
import { STAGE_NAMES } from "@/lib/srs";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

interface RelatedSubject {
  id: number;
  type: string;
  level: number;
  characters: string | null;
  characterImage: string | null;
  primaryMeaning: string;
  srsStage: number | null;
}

interface SubjectDetail {
  subject: SubjectDTO;
  assignment: {
    srsStage: number;
    availableAt: string | null;
    unlockedAt: string | null;
    startedAt: string | null;
  } | null;
  reviewLogs: {
    id: number;
    createdAt: string;
    startingStage: number;
    endingStage: number;
    meaningIncorrectCount: number;
    readingIncorrectCount: number;
  }[];
  related: RelatedSubject[];
}

function RelatedList({ title, items }: { title: string; items: RelatedSubject[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/subjects/${r.id}`}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-white shadow-sm hover:opacity-90"
            style={{ backgroundColor: TYPE_COLORS[r.type] }}
          >
            <SubjectChar
              characters={r.characters}
              characterImage={r.characterImage}
              className="text-xl"
            />
            <span className="text-sm">{r.primaryMeaning}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/subjects/${id}`).then(async (r) => {
      if (!r.ok) return setNotFound(true);
      setDetail(await r.json());
    });
  }, [id]);

  if (notFound) return <p className="text-slate-500">Subject not found.</p>;
  if (!detail) return <p className="text-slate-500">Loading…</p>;

  const { subject, assignment, reviewLogs, related } = detail;
  const color = TYPE_COLORS[subject.type];
  const acceptedReadings = subject.readings.filter((r) => r.acceptedAnswer);
  const components = related.filter((r) => subject.componentIds.includes(r.id));
  const amalgamations = related.filter((r) => subject.amalgamationIds.includes(r.id));
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
      </div>

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
          <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-500">
            Hint: {subject.meaningHint}
          </p>
        )}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <SynonymManager subjectId={subject.id} initialSynonyms={subject.userSynonyms} />
        </div>
      </section>

      {acceptedReadings.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold">Reading</h2>
          <p className="mb-3 text-xl" lang="ja">
            {acceptedReadings.map((r) => `${r.reading}${r.type ? ` (${r.type})` : ""}`).join("、")}
          </p>
          {subject.readingMnemonic && <MnemonicText text={subject.readingMnemonic} />}
          {subject.audioUrls.length > 0 && (
            <button
              onClick={() => new Audio(subject.audioUrls[0].url).play()}
              className="mt-3 rounded-lg bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              ▶ Play audio
            </button>
          )}
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
              <span className="text-slate-500">{s.en}</span>
            </p>
          ))}
        </section>
      )}

      <RelatedList title="Components" items={components} />
      <RelatedList title="Found in" items={amalgamations} />

      {reviewLogs.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Review history</h2>
          <ul className="space-y-1 text-sm">
            {reviewLogs.map((log) => (
              <li key={log.id} className="flex justify-between border-b border-slate-100 py-1">
                <span>{new Date(log.createdAt).toLocaleString()}</span>
                <span>
                  {STAGE_NAMES[log.startingStage]} → {STAGE_NAMES[log.endingStage]}
                  {log.meaningIncorrectCount + log.readingIncorrectCount > 0 && (
                    <span className="ml-2 text-red-500">
                      ({log.meaningIncorrectCount + log.readingIncorrectCount} wrong)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
