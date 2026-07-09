"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LevelsPage() {
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then((s) => setCurrentLevel(s.currentLevel));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Levels</h1>
      <div className="grid grid-cols-6 gap-3 sm:grid-cols-10">
        {Array.from({ length: 60 }, (_, i) => i + 1).map((level) => {
          const isCurrent = level === currentLevel;
          const isPast = currentLevel !== null && level < currentLevel;
          return (
            <Link
              key={level}
              href={`/levels/${level}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-lg font-semibold shadow-sm transition-transform hover:scale-105 ${
                isCurrent
                  ? "bg-pink-600 text-white ring-2 ring-pink-300"
                  : isPast
                    ? "bg-slate-700 text-white"
                    : "bg-white text-slate-400"
              }`}
            >
              {level}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
