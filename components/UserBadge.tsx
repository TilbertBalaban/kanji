"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

export function UserBadge() {
  const { isSignedIn, user } = useUser();
  if (!isSignedIn) return null;

  const name = user.firstName ?? user.username ?? "";
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
      >
        Profile
      </Link>
      {name && (
        <span className="text-sm text-slate-300">
          <span className="text-slate-500">Studying as</span>{" "}
          <span className="font-medium text-white">{name}</span>
        </span>
      )}
      <UserButton />
    </div>
  );
}
