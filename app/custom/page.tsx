"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as wanakana from "wanakana";
import { SpeechButton } from "@/components/SpeechButton";
import { displayCharacters, type CustomVocabDTO } from "@/lib/custom-vocab";
import { fromCyrillicLayout } from "@/lib/keyboard-layout";
import { readingWithoutSlots, STAGE_NAMES } from "@/lib/srs";
import { japaneseReading, type TranslateLang, type TranslateResult } from "@/lib/translate";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS } from "@/lib/ui";

interface FormState {
  characters: string;
  readings: string; // comma-separated, IME-converted to kana as you type
  meanings: string; // comma-separated
  notes: string;
}

const EMPTY_FORM: FormState = { characters: "", readings: "", meanings: "", notes: "" };

// What the translate helper's text box holds. Rōmaji is converted to hiragana
// locally; English/Ukrainian are translated into Japanese.
type InputType = "romaji" | "en" | "uk";
const INPUT_TYPES: { key: InputType; label: string; placeholder: string }[] = [
  { key: "romaji", label: "Rōmaji", placeholder: "konbanwa" },
  { key: "en", label: "English", placeholder: "good evening" },
  { key: "uk", label: "Українська", placeholder: "добрий вечір" },
];

// Kana IME for the reading field, minus the [placeholder] slots: whatever is
// typed between the brackets is a hint for the variable part of a pattern
// ("[years]さいです"), so it stays exactly as typed instead of being romaji-
// converted into kana. Unclosed brackets count as open to the end of the
// input, so the hint is left alone while you're still typing it.
const SLOT = /([[［][^\]］]*[\]］]?)/;

function toReadingKana(value: string): string {
  return value
    .split(SLOT)
    .map((part) =>
      part.startsWith("[") || part.startsWith("［")
        ? part
        : wanakana.toKana(fromCyrillicLayout(part), { IMEMode: true }),
    )
    .join("");
}

function toForm(item: CustomVocabDTO): FormState {
  return {
    characters: item.characters ?? "",
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
  const [helperText, setHelperText] = useState("");
  const [inputType, setInputType] = useState<InputType>("romaji");
  const [translating, setTranslating] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const charactersRef = useRef<HTMLInputElement>(null);
  // The meaning the translate helper last filled in — so re-translating can
  // refresh it, while a meaning you typed or edited yourself is left alone.
  const lastAutoMeaningRef = useRef("");

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

  // Google Translate helper: fill the Japanese / reading / meaning fields from
  // the text box, according to the selected input type.
  const handleTranslate = useCallback(async () => {
    const text = helperText.trim();
    if (!text) return;
    setTranslating(true);
    setHelperError(null);

    const translate = async (payload: { text: string; from: TranslateLang; to: TranslateLang }) => {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as TranslateResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn’t translate — please try again.");
      return data;
    };

    try {
      // Fill both an English and a Ukrainian meaning whichever way we come in,
      // so either language is an accepted quiz answer.
      let characters: string;
      let reading: string;
      let english: string;
      let ukrainian: string;

      if (wanakana.isJapanese(text)) {
        // Already Japanese — translate out to both meanings.
        characters = text;
        const [en, uk] = await Promise.all([
          translate({ text, from: "ja", to: "en" }),
          translate({ text, from: "ja", to: "uk" }),
        ]);
        english = en.translation;
        ukrainian = uk.translation;
        reading = japaneseReading(text, en.sourceRomaji);
      } else if (inputType === "romaji") {
        // Rōmaji → hiragana just well enough to translate into English, then
        // translate that meaning back to Japanese so Google supplies the proper
        // spelling (kanji, particle は over the phonetic わ) instead of a literal
        // transliteration — and out to Ukrainian for the second meaning.
        english = (
          await translate({ text: wanakana.toHiragana(text.toLowerCase()), from: "ja", to: "en" })
        ).translation;
        const [ja, uk] = await Promise.all([
          translate({ text: english, from: "en", to: "ja" }),
          translate({ text: english, from: "en", to: "uk" }),
        ]);
        characters = ja.translation;
        ukrainian = uk.translation;
        reading = japaneseReading(characters, ja.targetRomaji);
      } else if (inputType === "en") {
        english = text;
        const [ja, uk] = await Promise.all([
          translate({ text, from: "en", to: "ja" }),
          translate({ text, from: "en", to: "uk" }),
        ]);
        characters = ja.translation;
        ukrainian = uk.translation;
        reading = japaneseReading(characters, ja.targetRomaji);
      } else {
        // Ukrainian meaning typed in.
        ukrainian = text;
        const [ja, en] = await Promise.all([
          translate({ text, from: "uk", to: "ja" }),
          translate({ text, from: "uk", to: "en" }),
        ]);
        characters = ja.translation;
        english = en.translation;
        reading = japaneseReading(characters, ja.targetRomaji);
      }

      // English first, then Ukrainian; drop blanks and duplicates.
      const meaning = [english, ukrainian]
        .map((m) => m.trim())
        .filter((m, i, arr) => m && arr.indexOf(m) === i)
        .join(", ");

      // Overwrite the meaning when it's empty or still holds our last auto-fill;
      // keep it if you've typed or edited it yourself.
      const prevAuto = lastAutoMeaningRef.current;
      setForm((f) => {
        const isAuto = !f.meanings.trim() || f.meanings === prevAuto;
        return {
          ...f,
          characters,
          readings: reading,
          meanings: isAuto ? meaning : f.meanings,
        };
      });
      lastAutoMeaningRef.current = meaning;
    } catch (e) {
      setHelperError(e instanceof Error ? e.message : "Couldn’t translate — please try again.");
    } finally {
      setTranslating(false);
    }
  }, [helperText, inputType]);

  const handleDelete = useCallback(
    async (item: CustomVocabDTO) => {
      if (!confirm(`Delete “${displayCharacters(item)}” and its SRS progress?`)) return;
      const res = await fetch(`/api/custom-vocab/${item.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? prev);
      if (editingId === item.id) resetForm();
    },
    [editingId, resetForm],
  );

  const handleReset = useCallback(async (item: CustomVocabDTO) => {
    if (!confirm(`Reset “${displayCharacters(item)}” back to Apprentice I?`)) return;
    const res = await fetch(`/api/custom-vocab/${item.id}/reset`, { method: "POST" });
    if (!res.ok) return;
    const fresh = await fetch("/api/custom-vocab")
      .then((r) => r.json())
      .catch(() => null);
    if (fresh) setItems(fresh.items);
  }, []);

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

        <div className="mb-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">Translate helper</p>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm font-medium">
              {INPUT_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setInputType(t.key)}
                  className={
                    inputType === t.key
                      ? "bg-slate-700 px-3 py-2 text-white"
                      : "bg-white px-3 py-2 text-slate-600 hover:bg-slate-100"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={helperText}
              onChange={(e) => setHelperText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTranslate();
                }
              }}
              placeholder={INPUT_TYPES.find((t) => t.key === inputType)?.placeholder}
              lang={inputType === "uk" ? "uk" : undefined}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating || !helperText.trim()}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {translating ? "Translating…" : "Translate"}
            </button>
          </div>
          {helperError && <p className="mt-2 text-sm text-red-600">{helperError}</p>}
          <p className="mt-2 text-xs text-slate-400">
            Pick what you’re typing, then translate — fills the fields below. Powered by Google
            Translate + kana conversion; double-check kanji spelling and particle readings (は/へ)
            before saving.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Japanese <span className="text-slate-400">— optional if you fill in a reading</span>
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
            <span className="mt-1 block text-xs text-slate-400">
              Leave it empty to quiz from the reading alone: the item then asks two questions —
              reading → meaning, and meaning → reading.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Reading <span className="text-slate-400">— optional for kana-only words</span>
            </span>
            <input
              value={form.readings}
              onChange={(e) => setForm((f) => ({ ...f, readings: toReadingKana(e.target.value) }))}
              placeholder="はじめまして (type romaji, converts as you go)"
              lang="ja"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-lg outline-none focus:border-amber-500"
            />
            <span className="mt-1 block text-xs text-slate-400">
              〜 and [hints] stand in for the part that varies — 〜にみえます, [years]さいです. Anything
              you type in that slot counts as correct. Reading answers are typed in kana, so a
              reading written with kanji needs a kana one alongside it to be answerable.
            </span>
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
                  // Slots are hints, not sounds — speak only the fixed part.
                  text={
                    readingWithoutSlots(item.readings[0] ?? "") ||
                    readingWithoutSlots(item.characters ?? "")
                  }
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span lang="ja" className="text-xl font-medium">
                      {displayCharacters(item)}
                    </span>
                    {item.characters !== null &&
                      item.readings.length > 0 &&
                      item.readings.join("") !== item.characters && (
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
                  onClick={() => handleReset(item)}
                  className="text-sm text-slate-400 hover:text-slate-600 hover:underline"
                >
                  Reset
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
