"use client";

import { useState } from "react";

interface Msg {
  ok: boolean;
  text: string;
}

// WaniKani section of the profile page: save a personal API token (kept
// server-side in Clerk private metadata — only a masked hint ever comes back)
// and trigger a sync of the account's progress into this app.

export function ProfileForm({ initialKeyHint }: { initialKeyHint: string | null }) {
  const [keyHint, setKeyHint] = useState(initialKeyHint);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const busy = saving || syncing;

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    const apiKey = apiKeyInput.trim();
    if (!apiKey || busy) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error ?? "Could not save API token" });
        return;
      }
      setKeyHint(data.keyHint);
      setApiKeyInput("");
      setMsg({
        ok: true,
        text: data.username
          ? `Token saved — linked to WaniKani account “${data.username}”`
          : "Token saved",
      });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (busy) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "" }),
      });
      if (res.ok) {
        setKeyHint(null);
        setMsg({ ok: true, text: "Token removed" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    if (busy) return;
    setSyncing(true);
    setMsg({ ok: true, text: "Syncing from WaniKani…" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error ?? "Sync failed" });
        return;
      }
      setMsg({
        ok: true,
        text: `Synced ${data.assignmentsSynced} items · ${data.synonymsSynced} synonyms · level ${data.level}`,
      });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-slate-900">WaniKani</h2>
      <p className="mt-1 text-sm text-slate-500">
        Save your personal WaniKani API token, then sync to pull your real account&apos;s
        progress and synonyms into this app. The token is stored server-side and never
        shown again in full.
      </p>

      <form onSubmit={saveKey} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-slate-700" htmlFor="wk-api-key">
          API token
        </label>
        {keyHint && (
          <p className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              Saved token: <span className="font-mono">{keyHint}</span>
            </span>
            <button
              type="button"
              onClick={() => void removeKey()}
              disabled={busy}
              className="text-xs text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <input
            id="wk-api-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={keyHint ? "Paste a new token to replace it" : "Paste API token"}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <button
            type="submit"
            disabled={busy || !apiKeyInput.trim()}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={busy || !keyHint}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync from WaniKani"}
        </button>
        {!keyHint && (
          <p className="mt-2 text-xs text-slate-400">Save an API token to enable sync.</p>
        )}
        {msg && (
          <p className={`mt-2 text-sm ${msg.ok ? "text-cyan-700" : "text-red-600"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
