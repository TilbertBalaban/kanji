"use client";

import { useState } from "react";

// Sends an item's SRS progress back to the start (re-enters lessons/reviews
// from scratch). Used on subject/custom-vocab/grammar-point detail pages —
// each passes its own reset endpoint since the three item types don't share
// a single API shape.
export function ResetProgressButton({
  resetUrl,
  onReset,
}: {
  resetUrl: string;
  onReset?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-sm text-slate-400">Progress reset.</span>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-slate-400 hover:text-red-500"
      >
        Reset progress
      </button>
    );
  }

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(resetUrl, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Something went wrong");
        return;
      }
      setDone(true);
      onReset?.();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Reset all progress on this item?</span>
      <button
        onClick={reset}
        disabled={busy}
        className="rounded-lg bg-red-600 px-2 py-0.5 text-white hover:bg-red-500 disabled:opacity-50"
      >
        Reset
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
      {error && <span className="text-red-500">{error}</span>}
    </div>
  );
}
