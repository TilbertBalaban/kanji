"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { SubjectChar } from "@/components/SubjectChar";
import { LEVEL_RANGES } from "@/components/TypeNavDropdown";
import { TYPE_COLORS } from "@/lib/ui";

interface BrowseSubject {
  id: number;
  type: string;
  level: number;
  characters: string | null;
  characterImage: string | null;
  primaryMeaning: string;
  primaryReading: string | null;
  status: "locked" | "lesson" | "review" | "burned";
}

const STATUS_LABELS: Record<BrowseSubject["status"], string> = {
  locked: "Locked",
  lesson: "In Lessons",
  review: "In Reviews",
  burned: "Burned",
};

const BURNED_BG = "#434343";

function tileStyle(status: BrowseSubject["status"], color: string): CSSProperties {
  switch (status) {
    case "locked":
      return { border: `2px dashed ${color}`, color };
    case "lesson":
      return { border: `2px solid ${color}`, color, backgroundColor: `${color}1f` };
    case "review":
      return { border: `2px solid ${color}`, color: "#fff", backgroundColor: color };
    case "burned":
      return { border: `2px solid ${BURNED_BG}`, color: "#fff", backgroundColor: BURNED_BG };
  }
}

export function SubjectTypeBrowser({
  type,
  title,
  basePath,
  levels,
}: {
  type: "radical" | "kanji" | "vocabulary";
  title: string;
  basePath: string;
  levels: string;
}) {
  const [from, to] = levels.split("-").map(Number);
  const requestKey = `${type}:${from}-${to}`;
  const [result, setResult] = useState<{ key: string; subjects: BrowseSubject[] } | null>(null);
  const color = TYPE_COLORS[type];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/subject-types/${type}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, subjects: data.subjects });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, type, from, to]);

  // Only show data matching the current range; otherwise we're loading.
  const subjects = result?.key === requestKey ? result.subjects : null;

  const byLevel = new Map<number, BrowseSubject[]>();
  for (const s of subjects ?? []) {
    const group = byLevel.get(s.level);
    if (group) group.push(s);
    else byLevel.set(s.level, [s]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex flex-wrap gap-2">
          {LEVEL_RANGES.map((r) => {
            const active = r.from === from && r.to === to;
            return (
              <Link
                key={r.from}
                href={`${basePath}?levels=${r.from}-${r.to}`}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 shadow-sm hover:bg-slate-200"
                }`}
              >
                {r.from}–{r.to}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg bg-white px-4 py-3 shadow-sm">
        {(Object.keys(STATUS_LABELS) as BrowseSubject["status"][]).map((status) => (
          <div key={status} className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md text-base"
              style={tileStyle(status, color)}
            >
              語
            </span>
            <span className="text-sm text-slate-600">{STATUS_LABELS[status]}</span>
          </div>
        ))}
      </div>

      {!subjects ? (
        <p className="text-slate-500">
          Loading {title.toLowerCase()} for levels {from}–{to}…
        </p>
      ) : byLevel.size === 0 ? (
        <p className="text-slate-500">No {title.toLowerCase()} in levels {from}–{to}.</p>
      ) : (
        [...byLevel.entries()].map(([level, items]) => (
          <section key={level}>
            <h2 className="mb-3 text-lg font-semibold">
              <Link href={`/levels/${level}`} className="hover:underline">
                Level {level}
              </Link>{" "}
              <span className="text-sm text-slate-400">({items.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {items.map((s) => (
                <Link
                  key={s.id}
                  href={`/subjects/${s.id}`}
                  className={`flex flex-col items-center rounded-lg px-3 py-2 shadow-sm transition-transform hover:scale-105 ${
                    s.status === "locked" || s.status === "lesson" ? "[&_img]:invert-0" : ""
                  }`}
                  style={tileStyle(s.status, color)}
                  title={`${s.primaryMeaning}${s.primaryReading ? ` · ${s.primaryReading}` : ""} — ${STATUS_LABELS[s.status]}`}
                >
                  <SubjectChar
                    characters={s.characters}
                    characterImage={s.characterImage}
                    className="text-2xl"
                  />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
