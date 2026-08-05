"use client";

import { useEffect, useRef, useState } from "react";

// WaniKani-style "User Synonyms" editor: shows the extra accepted meanings the
// user has added for a subject and lets them add/remove more. Used on the
// subject detail page and inline during lessons.
//
// State is initialized from `initialSynonyms`; callers that reuse this component
// across different subjects (lessons, reviews) pass `key={subjectId}` so it
// remounts and re-seeds when the subject changes.

export function SynonymManager({
  subjectId,
  initialSynonyms = [],
  onChange,
}: {
  subjectId: number;
  initialSynonyms?: string[];
  onChange?: (synonyms: string[]) => void;
}) {
  const [synonyms, setSynonyms] = useState<string[]>(initialSynonyms);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = (next: string[]) => {
    setSynonyms(next);
    onChange?.(next);
  };

  const send = async (method: "POST" | "DELETE", synonym: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/synonyms`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synonym }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong");
        return false;
      }
      commit(data.synonyms as string[]);
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const value = input.trim();
    if (!value || busy) return;
    if (synonyms.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setInput("");
      return;
    }
    // Keep the typed text on failure so the user can retry without retyping.
    if (await send("POST", value)) setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold uppercase text-slate-400">User Synonyms</span>
        {synonyms.length === 0 && !editing && (
          <span className="text-slate-400">None</span>
        )}
        {synonyms.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-700"
          >
            {s}
            {editing && (
              <button
                type="button"
                onClick={() => send("DELETE", s)}
                disabled={busy}
                aria-label={`Remove ${s}`}
                className="text-slate-400 hover:text-red-500 disabled:opacity-40"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-1 text-sky-600 hover:underline"
        >
          <span aria-hidden>✎</span>
          {editing ? "Done" : "Manage Synonyms"}
        </button>
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="Add a synonym"
            className="w-48 rounded border border-slate-300 px-2 py-1 outline-none focus:border-sky-500"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || input.trim().length === 0}
            className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-700 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-red-500">{error}</p>}
    </div>
  );
}
