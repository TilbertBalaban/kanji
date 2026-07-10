"use client";

import { useEffect, useRef, useState } from "react";

// WaniKani-style per-subject "Note" editor. Shows a saved free-form note with an
// edit affordance, or a "+ Add Note" button when empty. `field` selects which
// column (meaning/reading) this editor writes via PUT /api/subjects/:id/notes.
//
// Seeded from `initialNote`; callers that reuse it across subjects should pass a
// stable `key` so it remounts and re-seeds when the subject changes.

export function NoteEditor({
  subjectId,
  field,
  label = "Note",
  initialNote = null,
}: {
  subjectId: number;
  field: "meaning" | "reading";
  label?: string;
  initialNote?: string | null;
}) {
  const [note, setNote] = useState<string | null>(initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setDraft(note ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong");
        return;
      }
      const saved = field === "meaning" ? data.note.meaningNote : data.note.readingNote;
      setNote(saved ?? null);
      setEditing(false);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="mb-1 text-sm text-slate-400">{label}</h3>
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            disabled={busy}
            className="w-full resize-y rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="Write a note…"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </div>
      ) : note ? (
        <button
          onClick={startEditing}
          className="block w-full whitespace-pre-line rounded-lg border border-transparent p-2 text-left text-sm hover:border-slate-200 hover:bg-slate-50"
        >
          {note}
        </button>
      ) : (
        <button
          onClick={startEditing}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <span className="text-lg leading-none">+</span> Add Note
        </button>
      )}
    </div>
  );
}
