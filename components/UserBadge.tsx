"use client";

import { useCurrentUser } from "@/components/AuthGate";

export function UserBadge() {
  const { user, switchUser } = useCurrentUser();
  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm text-slate-300">
        <span className="text-slate-500">Studying as</span>{" "}
        <span className="font-medium text-white">{user}</span>
      </span>
      <button
        onClick={switchUser}
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
      >
        Switch
      </button>
    </div>
  );
}
