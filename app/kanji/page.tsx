"use client";

import { use } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function KanjiPage({
  searchParams,
}: {
  searchParams: Promise<{ levels?: string }>;
}) {
  const { levels } = use(searchParams);
  return (
    <SubjectTypeBrowser type="kanji" title="Kanji" basePath="/kanji" levels={levels ?? "1-10"} />
  );
}
