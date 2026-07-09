"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export const LEVEL_RANGES = Array.from({ length: 6 }, (_, i) => ({
  from: i * 10 + 1,
  to: i * 10 + 10,
}));

export function TypeNavDropdown({ label, basePath }: { label: string; basePath: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-sm transition-colors hover:text-white ${
          open ? "text-white" : "text-slate-300"
        }`}
      >
        {label}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
          {LEVEL_RANGES.map(({ from, to }) => (
            <Link
              key={from}
              href={`${basePath}?levels=${from}-${to}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Levels {from}–{to}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
