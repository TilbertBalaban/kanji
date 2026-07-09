import { Suspense } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function KanjiPage() {
  return (
    <Suspense>
      <SubjectTypeBrowser type="kanji" title="Kanji" basePath="/kanji" />
    </Suspense>
  );
}
