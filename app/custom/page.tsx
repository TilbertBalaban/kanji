"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as wanakana from "wanakana";
import { SpeechButton } from "@/components/SpeechButton";
import type { CustomVocabDTO } from "@/lib/custom-vocab";
import { STAGE_NAMES } from "@/lib/srs";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS } from "@/lib/ui";

interface FormState {
  characters: string;
  readings: string; // comma-separated, IME-converted to kana as you type
  meanings: string; // comma-separated
  notes: string;
}

const EMPTY_FORM: FormState = { characters: "", readings: "", meanings: "", notes: "" };

function toForm(item: CustomVocabDTO): FormState {
  return {
    characters: item.characters,
    readings: item.readings.join(", "),
    meanings: item.meanings.join(", "),
    notes: item.notes ?? "",
  };
}

function nextReviewLabel(item: CustomVocabDTO): string {
  if (item.srsStage === 9) return "Burned";
  if (!item.availableAt) return "—";
  const at = new Date(item.availableAt);
  if (at <= new Date()) return "Now";
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomVocabPage() {
  const [items, setItems] = useState<CustomVocabDTO[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const charactersRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/custom-vocab")
      .then((r) => r.json())
      .then((data: { items: CustomVocabDTO[]; dueCount: number }) => {
        setItems(data.items);
        setDueCount(data.dueCount);
      });
  }, []);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(
      editingId === null ? "/api/custom-vocab" : `/api/custom-vocab/${editingId}`,
      {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong — please try again.");
      return;
    }
    const item: CustomVocabDTO = data.item;
    setItems((prev) => {
      if (!prev) return prev;
      return editingId === null
        ? [item, ...prev]
        : prev.map((i) => (i.id === editingId ? item : i));
    });
    resetForm();
    charactersRef.current?.focus();
  }, [form, editingId, resetForm]);

  const handleDelete = useCallback(
    async (item: CustomVocabDTO) => {
      if (!confirm(`Delete “${item.characters}” and its SRS progress?`)) return;
      const res = await fetch(`/api/custom-vocab/${item.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? prev);
      if (editingId === item.id) resetForm();
    },
    [editingId, resetForm],
  );

  if (!items) return <p className="text-slate-500">Loading custom vocabulary…</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Custom Vocabulary</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your own words and phrases, with their own SRS — separate from the WaniKani
            progression.
          </p>
        </div>
        {dueCount > 0 ? (
          <Link
            href="/custom/reviews"
            className="rounded-lg px-5 py-2.5 font-medium text-white shadow transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: TYPE_COLORS.custom }}
          >
            Review {dueCount} due now →
          </Link>
        ) : (
          items.length > 0 && (
            <span className="text-sm text-slate-500">No custom reviews due right now.</span>
          )
        )}
      </div>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">
          {editingId === null ? "Add a word or phrase" : "Edit item"}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Japanese <span className="text-red-500">*</span>
            </span>
            <input
              ref={charactersRef}
              value={form.characters}
              onChange={(e) => setForm((f) => ({ ...f, characters: e.target.value }))}
              placeholder="はじめまして"
              lang="ja"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-lg outline-none focus:border-amber-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Reading (kana) <span className="text-slate-400">— optional for kana-only words</span>
            </span>
            <input
              value={form.readings}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  readings: wanakana.toKana(e.target.value, { IMEMode: true }),
                }))
              }
              placeholder="はじめまして (type romaji, converts as you go)"
              lang="ja"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-lg outline-none focus:border-amber-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Meaning(s) <span className="text-red-500">*</span>{" "}
              <span className="text-slate-400">— separate with commas</span>
            </span>
            <input
              value={form.meanings}
              onChange={(e) => setForm((f) => ({ ...f, meanings: e.target.value }))}
              placeholder="nice to meet you, how do you do"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Where you met the word, a mnemonic…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500"
            />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg px-5 py-2 font-medium text-white shadow disabled:opacity-50"
            style={{ backgroundColor: TYPE_COLORS.custom }}
          >
            {saving ? "Saving…" : editingId === null ? "Add to my vocabulary" : "Save changes"}
          </button>
          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancel editing
            </button>
          )}
          {editingId === null && (
            <span className="text-sm text-slate-400">
              New items start at Apprentice I — first review in 4 hours.
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-white shadow">
        <h2 className="border-b border-slate-100 p-6 pb-4 text-lg font-semibold">
          My words <span className="font-normal text-slate-400">· {items.length}</span>
        </h2>
        {items.length === 0 ? (
          <p className="p-6 pt-4 text-sm text-slate-500">
            Nothing here yet — add your first word above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-6 py-3">
                <SpeechButton
                  text={item.readings[0] ?? item.characters}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span lang="ja" className="text-xl font-medium">
                      {item.characters}
                    </span>
                    {item.readings.length > 0 && item.readings.join("") !== item.characters && (
                      <span lang="ja" className="ml-3 text-slate-500">
                        {item.readings.join("、")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {item.meanings.join(", ")}
                    {item.notes && <span className="text-slate-400"> · {item.notes}</span>}
                  </p>
                </div>
                <div className="hidden text-right text-xs text-slate-400 sm:block">
                  <p>Next review</p>
                  <p className="font-medium text-slate-600">{nextReviewLabel(item)}</p>
                </div>
                <span
                  className="w-28 shrink-0 rounded-full px-3 py-1 text-center text-xs font-medium text-white"
                  style={{ backgroundColor: STAGE_GROUP_COLORS[stageGroup(item.srsStage)] }}
                >
                  {STAGE_NAMES[item.srsStage]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setForm(toForm(item));
                    setError(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="text-sm text-sky-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
