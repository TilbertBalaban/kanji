"use client";

import { use } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function RadicalsPage({
  searchParams,
}: {
  searchParams: Promise<{ levels?: string }>;
}) {
  const { levels } = use(searchParams);
  return (
    <SubjectTypeBrowser
      type="radical"
      title="Radicals"
      basePath="/radicals"
      levels={levels ?? "1-10"}
    />
  );
}
