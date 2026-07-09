import { Suspense } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function VocabularyPage() {
  return (
    <Suspense>
      <SubjectTypeBrowser type="vocabulary" title="Vocabulary" basePath="/vocabulary" />
    </Suspense>
  );
}
