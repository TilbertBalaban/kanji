"use client";

import { use } from "react";
import { SubjectDetail } from "@/components/SubjectDetail";

export default function RadicalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <SubjectDetail kind="radicals" slug={slug} />;
}
