"use client";

import { use } from "react";
import { SubjectDetail } from "@/components/SubjectDetail";

export default function VocabularyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <SubjectDetail kind="vocabulary" slug={slug} />;
}
