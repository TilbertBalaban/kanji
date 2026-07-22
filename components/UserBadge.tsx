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
        className="hidden rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white sm:inline-block"
      >
        Profile
      </Link>
      {name && (
        <span className="hidden text-sm text-slate-300 sm:inline">
          <span className="text-slate-500">Studying as</span>{" "}
          <span className="font-medium text-white">{name}</span>
        </span>
      )}
      <UserButton />
    </div>
  );
}
