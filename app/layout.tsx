import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KaniLocal — Japanese SRS",
  description: "Local WaniKani-style SRS for radicals, kanji and vocabulary",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-slate-100 text-slate-900"
        suppressHydrationWarning
      >
        <ClerkProvider>
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
