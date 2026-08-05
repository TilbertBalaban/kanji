"use client";

// Bunpro-style legend modals — the explainers behind the little info dots on
// a grammar point's Structure / Part of Speech / Word Type / Register, plus
// the "All Technical Terms" glossary the first two link to. Content is
// seeded into GrammarLegend by scripts/seed-grammar-legends.ts and served by
// /api/grammar/legends; this file only renders it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderTagged } from "@/components/TaggedText";
import type { GrammarLegendDTO, GrammarLegendKey, GrammarLegendRowDTO } from "@/lib/grammar";

type LegendMap = Partial<Record<GrammarLegendKey, GrammarLegendDTO>>;

// One fetch per session, shared by every dot on the page.
let legendsPromise: Promise<LegendMap> | null = null;
function loadLegends(): Promise<LegendMap> {
  legendsPromise ??= fetch("/api/grammar/legends")
    .then((r) => {
      if (!r.ok) throw new Error(`legends fetch failed: ${r.status}`);
      return r.json();
    })
    .then((d) => d.legends ?? {})
    .catch(() => {
      // Don't memoize failure — a cached rejection (or a transient 500's
      // empty map) would brick every legend modal until a full page reload.
      // Resolve empty for this open; the next open retries the fetch.
      legendsPromise = null;
      return {};
    });
  return legendsPromise;
}

// Row titles may carry <s>…</s> (the struck-through ない of the nai-stem row).
function RowTitle({ title }: { title: string }) {
  return (
    <>
      {renderTagged(title, "s", (content, key) => (
        <s key={key} className="decoration-2">
          {content}
        </s>
      ))}
    </>
  );
}

// Bullet text may carry <0>…</0> spans — Bunpro's colored highlight.
const ACCENT_CLASSES = { red: "text-red-600", orange: "text-amber-500" } as const;

function BulletText({ text, accent }: { text: string; accent?: "red" | "orange" }) {
  if (!accent) return <>{text.replace(/<\/?0>/g, "")}</>;
  return (
    <>
      {renderTagged(text, "0", (content, key) => (
        <span key={key} className={ACCENT_CLASSES[accent]}>
          {content}
        </span>
      ))}
    </>
  );
}

function LegendRow({ row, isTarget }: { row: GrammarLegendRowDTO; isTarget: boolean }) {
  return (
    <div
      className={`grid grid-cols-[minmax(7.5rem,1fr)_2fr] gap-x-6 rounded-lg px-3 py-2 ${
        isTarget ? "bg-red-100/70" : ""
      }`}
    >
      <div>
        <p className="font-semibold text-slate-800">
          <RowTitle title={row.title} />
        </p>
        {row.termJa && (
          <p className="text-sm text-slate-400" lang="ja">
            {row.reading ? (
              <ruby>
                {row.termJa}
                <rt className="text-[0.6em]">{row.reading}</rt>
              </ruby>
            ) : (
              row.termJa
            )}
          </p>
        )}
      </div>
      <p className="text-slate-700">{row.description}</p>
    </div>
  );
}

/** Rows with the highlighted target hoisted to the top, the way Bunpro does. */
function orderRows(rows: GrammarLegendRowDTO[], target: string | null | undefined) {
  if (!target) return rows.map((row) => ({ row, isTarget: false }));
  const norm = target.trim().toLowerCase();
  const marked = rows.map((row) => ({ row, isTarget: row.title.trim().toLowerCase() === norm }));
  return [...marked.filter((r) => r.isTarget), ...marked.filter((r) => !r.isTarget)];
}

function GrammarLegendDialog({
  legend,
  target,
  onClose,
}: {
  legend: GrammarLegendKey;
  target?: string | null;
  onClose: () => void;
}) {
  const [legends, setLegends] = useState<LegendMap | null>(null);
  const [view, setView] = useState<GrammarLegendKey>(legend);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadLegends().then((map) => {
      if (!cancelled) setLegends(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog on open and back to the trigger on close, so
    // keyboard users aren't left tabbing through the page behind the overlay.
    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [onClose]);

  const dto = legends?.[view];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dto?.title ?? "Legend"}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-red-600 transition-colors hover:text-red-800"
          >
            ×
          </button>
          <h2 className="text-2xl font-semibold text-slate-800">{dto?.title ?? "…"}</h2>
        </header>

        <div className="space-y-5 overflow-y-auto p-6">
          {!dto && (
            <p className="text-slate-500">
              {legends ? "Legend not seeded yet — run scripts/seed-grammar-legends.ts." : "Loading…"}
            </p>
          )}
          {dto?.intro.map((text, i) => (
            <p key={i} className="text-slate-700">
              {text}
            </p>
          ))}
          {dto?.sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h3 className="mb-2 text-sm text-slate-500">{section.heading}</h3>
              )}
              {section.bullets && (
                <ul className="list-disc space-y-1.5 pl-5 text-slate-700">
                  {section.bullets.map((b, j) => (
                    <li key={j}>
                      <BulletText text={b.text} accent={b.accent} />
                    </li>
                  ))}
                </ul>
              )}
              {section.rows && (
                <div>
                  <div className="grid grid-cols-[minmax(7.5rem,1fr)_2fr] gap-x-6 px-3 pb-1 text-sm text-slate-400">
                    <span>{dto.labels.ifYouSee}</span>
                    <span>{dto.labels.itMeans}</span>
                  </div>
                  <div className="space-y-1">
                    {orderRows(section.rows, view === legend ? target : null).map(
                      ({ row, isTarget }, j) => (
                        <LegendRow key={j} row={row} isTarget={isTarget} />
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {dto?.seeAllTerms && view !== "all-terms" && (
            <button
              onClick={() => setView("all-terms")}
              className="w-full rounded-lg bg-red-700 px-4 py-3 font-medium text-white transition-colors hover:bg-red-800"
            >
              {dto.labels.seeAllTerms}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The small "i" dot that opens a legend modal — drop-in wherever a section
 * heading or details label needs its Bunpro-style explainer. `target` is the
 * point's own value for that field (e.g. its register); the matching row is
 * highlighted and hoisted to the top.
 */
export function LegendInfoButton({
  legend,
  target,
  label,
  size = "md",
}: {
  legend: GrammarLegendKey;
  target?: string | null;
  label?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const dotClasses =
    size === "sm" ? "h-3.5 w-3.5 text-[9px]" : "h-4 w-4 text-[10px]";
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={label ?? "What does this mean?"}
        className={`inline-flex ${dotClasses} items-center justify-center rounded-full bg-slate-300 font-semibold text-white transition-colors hover:bg-slate-400`}
      >
        i
      </button>
      {open && (
        <GrammarLegendDialog legend={legend} target={target} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
