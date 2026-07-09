"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { USER_IDS, type UserId } from "@/lib/users";

type User = UserId;

type Status = "loading" | "locked" | "choosing" | "ready";

interface CurrentUserContextValue {
  user: User;
  switchUser: () => void;
  logout: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within AuthGate");
  return ctx;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // The signed httpOnly cookies are the source of truth. Ask the server what
  // state we're in on first load.
  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : { authed: false, user: null }))
      .then((s: { authed: boolean; user: User | null }) => {
        if (s.user) {
          setUser(s.user);
          setStatus("ready");
        } else {
          setStatus(s.authed ? "choosing" : "locked");
        }
      })
      .catch(() => setStatus("locked"));
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setError(false);
      setPasswordInput("");
      setStatus("choosing");
    } finally {
      setBusy(false);
    }
  }

  async function chooseUser(next: User) {
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: next }),
      });
      if (!res.ok) {
        // Gate likely expired — send them back to the password screen.
        setStatus(res.status === 401 ? "locked" : "choosing");
        return;
      }
      setUser(next);
      setStatus("ready");
    } finally {
      setBusy(false);
    }
  }

  async function switchUser() {
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
    setUser(null);
    setStatus("choosing");
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    setUser(null);
    setPasswordInput("");
    setStatus("locked");
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Loading…
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <form
          onSubmit={submitPassword}
          className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-xl"
        >
          <div className="text-center">
            <div className="text-3xl font-bold tracking-tight text-slate-900">
              蟹<span className="text-cyan-500">Local</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Enter the password to continue</p>
          </div>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {error && <p className="text-sm text-red-600">Incorrect password. Try again.</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  if (status === "choosing" || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 px-4">
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight text-white">
            蟹<span className="text-cyan-400">Local</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">Who&apos;s studying?</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {USER_IDS.map((name) => (
            <button
              key={name}
              onClick={() => chooseUser(name)}
              disabled={busy}
              className="w-40 rounded-xl bg-white px-6 py-8 text-xl font-semibold text-slate-900 shadow transition-transform hover:scale-[1.03] hover:bg-cyan-50 disabled:opacity-60"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <CurrentUserContext.Provider value={{ user, switchUser, logout }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
