"use client";

import { use } from "react";
import { SubjectDetail } from "@/components/SubjectDetail";

export default function KanjiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <SubjectDetail kind="kanji" slug={slug} />;
}
