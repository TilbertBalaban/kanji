"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LegendInfoButton } from "@/components/GrammarLegendModal";
import { ResetProgressButton } from "@/components/ResetProgressButton";
import {
  AboutExamples,
  AboutIntroBlocks,
  GRAMMAR_RELATION_SECTIONS,
  GrammarResources,
  SentenceCard,
  StructureSection,
  ViewOnBunproButton,
} from "@/components/GrammarPointInfo";
import type {
  GrammarAboutBlockDTO,
  GrammarAboutCautionDTO,
  GrammarOfflineResourceDTO,
  GrammarOnlineResourceDTO,
  GrammarRelationDTO,
} from "@/lib/grammar";
import { STAGE_NAMES } from "@/lib/srs";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS } from "@/lib/ui";

interface GrammarSentence {
  id: number;
  bunproId: number | null;
  japanese: string;
  english: string;
  acceptedAnswers: string[];
  audioUrl: string | null;
}

interface GrammarPoint {
  title: string;
  jlptLevel: number;
  meaning: string;
  structure: string;
  structureStandard: string;
  structurePolite: string;
  explanation: string;
  partOfSpeech: string | null;
  register: string | null;
  wordType: string;
  caution: string;
  aboutIntroBlocks: GrammarAboutBlockDTO[];
  aboutCautions: GrammarAboutCautionDTO[];
  onlineResources: GrammarOnlineResourceDTO[];
  offlineResources: GrammarOfflineResourceDTO[];
  slug: string;
}

interface GrammarDetail {
  point: GrammarPoint;
  sentences: GrammarSentence[];
  relations: GrammarRelationDTO[];
  srsStage: number | null;
  availableAt: string | null;
}

const STAGES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function GrammarDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<GrammarDetail | null | "not-found">(null);
  // Bumped by ResetProgressButton to refetch the (changed) SRS state.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // The route param may reach a client component already URL-encoded (see
    // components/SubjectDetail.tsx), so decode first and encode exactly once —
    // Bunpro slugs aren't guaranteed ASCII-safe.
    let key = slug;
    try {
      key = decodeURIComponent(slug);
    } catch {
      // slug wasn't valid percent-encoding; use it as-is.
    }
    fetch(`/api/grammar/${encodeURIComponent(key)}`).then(async (r) => {
      if (cancelled) return;
      if (r.status === 404) {
        setData("not-found");
        return;
      }
      setData(await r.json());
    });
    return () => {
      cancelled = true;
    };
  }, [slug, refresh]);

  if (data === null) return <p className="text-slate-500">Loading…</p>;
  if (data === "not-found") return <p className="text-slate-500">Grammar point not found.</p>;

  const { point, sentences, relations, srsStage } = data;
  const currentStageIdx = srsStage ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 1. Header */}
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <div
          className="subject-tile flex flex-col items-center justify-center gap-2 p-8"
          style={{ backgroundColor: TYPE_COLORS.grammar }}
        >
          <p className="text-4xl font-medium" lang="ja">
            {point.title}
          </p>
          <p className="text-lg text-white opacity-90">{point.meaning}</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
              N{point.jlptLevel}
            </span>
            {point.partOfSpeech && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {point.partOfSpeech}
              </span>
            )}
            {point.register && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {point.register}
              </span>
            )}
            <span
              className="rounded-full px-3 py-1 font-medium text-white"
              style={{ backgroundColor: STAGE_GROUP_COLORS[stageGroup(srsStage)] }}
            >
              {srsStage === null ? "Not started" : STAGE_NAMES[srsStage]}
            </span>
            {srsStage !== null && srsStage > 0 && (
              <ResetProgressButton
                resetUrl={`/api/grammar/${encodeURIComponent(slug)}/reset`}
                onReset={() => setRefresh((n) => n + 1)}
              />
            )}
          </div>

          {point.caution && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span aria-hidden="true">⚠️</span>
              <p>{point.caution}</p>
            </div>
          )}
        </div>
      </div>

      <ViewOnBunproButton slug={point.slug} />

      {/* 2. Structure */}
      <section className="rounded-xl bg-white p-6 shadow">
        <StructureSection
          standard={point.structureStandard}
          polite={point.structurePolite}
          variant="detail"
        />
      </section>

      {/* 3. Details */}
      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Details
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {point.partOfSpeech && (
            <div>
              <dt className="flex items-center gap-1.5 text-slate-400">
                Part of Speech
                <LegendInfoButton
                  legend="part-of-speech"
                  target={point.partOfSpeech}
                  label="Parts of Speech Legend"
                  size="sm"
                />
              </dt>
              <dd className="text-slate-700">{point.partOfSpeech}</dd>
            </div>
          )}
          {point.wordType && (
            <div>
              <dt className="flex items-center gap-1.5 text-slate-400">
                Word Type
                <LegendInfoButton
                  legend="word-type"
                  target={point.wordType}
                  label="Word Type Legend"
                  size="sm"
                />
              </dt>
              <dd className="text-slate-700">{point.wordType}</dd>
            </div>
          )}
          {point.register && (
            <div>
              <dt className="flex items-center gap-1.5 text-slate-400">
                Register
                <LegendInfoButton
                  legend="register"
                  target={point.register}
                  label="Register"
                  size="sm"
                />
              </dt>
              <dd className="text-slate-700">{point.register}</dd>
            </div>
          )}
        </dl>
        {point.explanation && (
          <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">
            {point.explanation}
          </p>
        )}
      </section>

      {/* 4. About */}
      {(point.aboutIntroBlocks.length > 0 || point.aboutCautions.length > 0) && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">About</h2>
          <AboutIntroBlocks blocks={point.aboutIntroBlocks} />

          {point.aboutCautions.map((c, i) => (
            <div key={i} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <span aria-hidden="true">⚠️</span> Caution
              </h3>
              <p className="text-sm text-amber-900">{c.text}</p>
              <AboutExamples examples={c.examples} />
            </div>
          ))}
        </section>
      )}

      {/* 5-7. Synonyms / Antonyms / Related */}
      {GRAMMAR_RELATION_SECTIONS.map(({ type, heading }) => {
        const items = relations.filter((r) => r.relationshipType === type);
        if (items.length === 0) return null;
        return (
          <section key={type} className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-3 text-lg font-semibold">{heading}</h2>
            <ul className="space-y-4">
              {items.map((r, i) => (
                <li key={i} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <Link
                    href={`/grammar/${encodeURIComponent(r.otherSlug)}`}
                    className="text-base font-medium text-emerald-700 hover:underline"
                    lang="ja"
                  >
                    {r.otherTitle}
                  </Link>
                  <span className="ml-2 text-sm text-slate-400">{r.otherMeaning}</span>
                  <p className="mt-1 text-sm text-slate-600">{r.body}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* 8. Examples */}
      {sentences.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Example sentences</h2>
          <div className="space-y-3">
            {sentences.map((s) => (
              <SentenceCard
                key={s.id}
                japanese={s.japanese}
                english={s.english}
                audioUrl={s.audioUrl}
                answer={s.acceptedAnswers[0] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* 9. Resources (Online/Offline readings + Bunpro link) */}
      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">Resources</h2>
        <GrammarResources
          online={point.onlineResources}
          offline={point.offlineResources}
          slug={point.slug}
        />
      </section>

      {/* 10. Progress chart */}
      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-semibold">Progress</h2>
        <div className="flex gap-1">
          {STAGES.map((stage) => (
            <div
              key={stage}
              title={STAGE_NAMES[stage]}
              className="h-2 flex-1 rounded-full"
              style={{
                backgroundColor:
                  stage <= currentStageIdx
                    ? STAGE_GROUP_COLORS[stageGroup(stage === 0 ? null : stage)]
                    : "#e5e7eb",
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {srsStage === null ? "Not started" : STAGE_NAMES[srsStage]}
        </p>
      </section>
    </div>
  );
}
