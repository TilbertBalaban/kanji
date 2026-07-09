"use client";

import { use } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ levels?: string }>;
}) {
  const { levels } = use(searchParams);
  return (
    <SubjectTypeBrowser
      type="vocabulary"
      title="Vocabulary"
      basePath="/vocabulary"
      levels={levels ?? "1-10"}
    />
  );
}
