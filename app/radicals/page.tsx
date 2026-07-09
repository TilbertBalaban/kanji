import { Suspense } from "react";
import { SubjectTypeBrowser } from "@/components/SubjectTypeBrowser";

export default function RadicalsPage() {
  return (
    <Suspense>
      <SubjectTypeBrowser type="radical" title="Radicals" basePath="/radicals" />
    </Suspense>
  );
}
