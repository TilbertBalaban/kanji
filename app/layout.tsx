import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { TypeNavDropdown } from "@/components/TypeNavDropdown";
import { AuthGate } from "@/components/AuthGate";
import { UserBadge } from "@/components/UserBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KaniLocal — Japanese SRS",
  description: "Local WaniKani-style SRS for radicals, kanji and vocabulary",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/lessons", label: "Lessons" },
  { href: "/reviews", label: "Reviews" },
  { href: "/levels", label: "Levels" },
];

const TYPE_NAV = [
  { basePath: "/radicals", label: "Radicals" },
  { basePath: "/kanji", label: "Kanji" },
  { basePath: "/vocabulary", label: "Vocabulary" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-screen bg-slate-100 text-slate-900">
        <AuthGate>
          <header className="bg-slate-900 text-white">
            <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
              <Link href="/" className="text-lg font-bold tracking-tight">
                蟹<span className="text-cyan-400">Local</span>
              </Link>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-slate-300 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              {TYPE_NAV.map((item) => (
                <TypeNavDropdown key={item.basePath} label={item.label} basePath={item.basePath} />
              ))}
              <UserBadge />
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
