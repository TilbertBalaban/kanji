import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getLessonSettings } from "@/lib/progression";
import { getStoredApiKey, maskApiKey } from "@/lib/wanikani-key";
import { LessonPacingForm } from "@/components/LessonPacingForm";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const [storedKey, lessonSettings] = await Promise.all([
    getStoredApiKey(user.id),
    getLessonSettings(user.id),
  ]);
  const name =
    user.firstName ?? user.username ?? user.emailAddresses[0]?.emailAddress ?? "there";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{name}</span>
          {user.emailAddresses[0] && (
            <> · {user.emailAddresses[0].emailAddress}</>
          )}
        </p>
      </div>
      <ProfileForm initialKeyHint={storedKey ? maskApiKey(storedKey) : null} />
      <LessonPacingForm
        initialDailyLessonLimit={lessonSettings.dailyLessonLimit}
        initialGrammarDailyLessonLimit={lessonSettings.grammarDailyLessonLimit}
        initialInterleaveLessons={lessonSettings.interleaveLessons}
      />
    </div>
  );
}
