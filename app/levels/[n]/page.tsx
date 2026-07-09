"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { SubjectChar } from "@/components/SubjectChar";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS } from "@/lib/ui";

interface LevelSubject {
  id: number;
  type: string;
  characters: string | null;
  characterImage: string | null;
  primaryMeaning: string;
  primaryReading: string | null;
  srsStage: number | null;
  unlocked: boolean;
  started: boolean;
}

const SECTIONS: { type: string[]; title: string }[] = [
  { type: ["radical"], title: "Radicals" },
  { type: ["kanji"], title: "Kanji" },
  { type: ["vocabulary", "kana_vocabulary"], title: "Vocabulary" },
];

export default function LevelPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = use(params);
  const [subjects, setSubjects] = useState<LevelSubject[] | null>(null);

  useEffect(() => {
    fetch(`/api/levels/${n}`)
      .then((r) => r.json())
      .then((data) => setSubjects(data.subjects));
  }, [n]);

  if (!subjects) return <p className="text-slate-500">Loading level {n}…</p>;

  const level = Number(n);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Level {level}</h1>
        <div className="flex gap-2 text-sm">
          {level > 1 && (
            <Link href={`/levels/${level - 1}`} className="text-sky-600 hover:underline">
              ← Level {level - 1}
            </Link>
          )}
          {level < 60 && (
            <Link href={`/levels/${level + 1}`} className="text-sky-600 hover:underline">
              Level {level + 1} →
            </Link>
          )}
        </div>
      </div>

      {SECTIONS.map((section) => {
        const items = subjects.filter((s) => section.type.includes(s.type));
        if (items.length === 0) return null;
        return (
          <section key={section.title}>
            <h2 className="mb-3 text-lg font-semibold">
              {section.title} <span className="text-sm text-slate-400">({items.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {items.map((s) => (
                <Link
                  key={s.id}
                  href={`/subjects/${s.id}`}
                  className="group relative flex flex-col items-center rounded-lg px-3 py-2 text-white shadow-sm transition-transform hover:scale-105"
                  style={{
                    backgroundColor: s.started
                      ? TYPE_COLORS[s.type]
                      : s.unlocked
                        ? "#64748b"
                        : "#cbd5e1",
                  }}
                  title={`${s.primaryMeaning}${s.primaryReading ? ` · ${s.primaryReading}` : ""}`}
                >
                  <SubjectChar
                    characters={s.characters}
                    characterImage={s.characterImage}
                    className="text-2xl"
                  />
                  <span
                    className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: STAGE_GROUP_COLORS[stageGroup(s.srsStage)] }}
                  />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
