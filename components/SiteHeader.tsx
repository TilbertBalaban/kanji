"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show } from "@clerk/nextjs";
import { UserBadge } from "@/components/UserBadge";

const NAV = [
  { href: "/levels", label: "Levels" },
  { href: "/radicals", label: "Radicals" },
  { href: "/kanji", label: "Kanji" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/custom", label: "My Vocab" },
  { href: "/grammar", label: "Grammar" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="bg-slate-900 text-white">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          蟹<span className="text-cyan-400">Local</span>
        </Link>

        <div className="ml-auto hidden items-center gap-6 lg:flex">
          <Show when="signed-in">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`text-sm transition-colors hover:text-white ${
                  isActive(item.href)
                    ? "font-medium text-white"
                    : "text-slate-300"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </Show>
          <UserBadge />
        </div>

        <div className="ml-auto flex items-center gap-3 lg:hidden">
          <UserBadge />
          <Show when="signed-in">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label="Toggle navigation menu"
              className="rounded-md border border-slate-700 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                {menuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>
          </Show>
        </div>
      </nav>

      <Show when="signed-in">
        {menuOpen && (
          <div
            id="mobile-nav"
            className="border-t border-slate-800 px-4 py-2 lg:hidden"
          >
            <div className="mx-auto flex max-w-5xl flex-col">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`border-b border-slate-800 py-3 text-sm transition-colors last:border-b-0 hover:text-white ${
                    isActive(item.href)
                      ? "font-medium text-white"
                      : "text-slate-300"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Show>
    </header>
  );
}
