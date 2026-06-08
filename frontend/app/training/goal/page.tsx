"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadDrillPlan } from "@/lib/session-api";
import type { DrillItem, DrillPlan } from "@/lib/runtime-types";
import {
  metricValueText,
  targetDescription,
  targetLabel,
} from "@/lib/product-language";

const STORAGE_KEY = "interviewiq-training-plan";

type StoredTrainingPlan = {
  planId: string;
  acceptedAt: string;
  completedDrills: number[];
};

function GoalSummary({ plan }: { plan: DrillPlan }) {
  const primary = plan.drills[0];
  const secondary = plan.drills[1];
  const primaryTarget = primary?.target ?? "answer_structure";

  return (
    <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
      <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
        <Target className="h-4 w-4" />
        교정 목표 설정
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h1 className="text-2xl font-bold leading-tight text-slate-950 lg:text-3xl">
            이번 루프는 {targetLabel(primaryTarget)}을 먼저 잡습니다.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            직전 세션의 약점 패턴을 기준으로 3개의 짧은 드릴을 진행한 뒤,
            다음 풀세션에서 같은 지표가 얼마나 줄었는지 다시 비교합니다.
          </p>
        </div>
        <div className="rounded-lg border border-violet-100 bg-violet-50 p-5">
          <p className="text-sm font-semibold text-violet-700">핵심 목표</p>
          <p className="mt-3 text-2xl font-bold text-violet-700">
            {targetLabel(primaryTarget)}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {targetDescription(primaryTarget) || primary?.instruction}
          </p>
          {secondary ? (
            <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              다음 보조 목표: {targetLabel(secondary.target)}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function DrillCard({ drill, index }: { drill: DrillItem; index: number }) {
  const metric = drill.passCriteria;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-violet-600">드릴 {index + 1}</p>
          <h3 className="mt-1 text-base font-bold text-slate-950">
            {drill.title || targetLabel(drill.target)}
          </h3>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {targetLabel(drill.target)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {drill.instruction}
      </p>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-800">{drill.question}</p>
        <p className="mt-2 text-xs font-medium text-slate-500">
          통과 기준: {metricValueText(metric?.metric, metric?.operator, metric?.threshold)}
        </p>
      </div>
    </article>
  );
}

function TrainingGoalContent() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const plan = useMemo(() => loadDrillPlan(planId), [planId]);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredTrainingPlan;
      setIsSaved(stored.planId === plan.planId);
    } catch {
      setIsSaved(false);
    }
  }, [plan.planId]);

  const acceptGoal = () => {
    const stored: StoredTrainingPlan = {
      planId: plan.planId,
      acceptedAt: new Date().toISOString(),
      completedDrills: [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setIsSaved(true);
  };

  const drillHref = `/training/drill?planId=${encodeURIComponent(
    plan.planId
  )}&step=0`;
  const resultHref = plan.sourceSessionId
    ? `/result?sessionId=${encodeURIComponent(plan.sourceSessionId)}`
    : "/result";

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto max-w-[1320px] px-5 py-4 lg:px-6">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href={resultHref}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="rounded-lg bg-white px-5 py-3 text-sm font-bold shadow-sm">
              교정 목표 설정
            </div>
          </div>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href={drillHref}>
              드릴 시작
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </nav>

        <section className="mt-4">
          <GoalSummary plan={plan} />
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-bold">추천 드릴 3개</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {plan.drills.map((drill, index) => (
                <DrillCard key={drill.drillId} drill={drill} index={index} />
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-violet-600" />
                <h2 className="text-base font-bold">진행 방식</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "드릴 1개는 독립 드릴 세션으로 저장됩니다.",
                  "각 드릴 결과는 다음 목표 재산정에 사용됩니다.",
                  "드릴 3개 후 풀세션을 다시 진행해 개선률을 확인합니다.",
                ].map((item) => (
                  <p key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </p>
                ))}
              </div>

              <Button
                type="button"
                onClick={acceptGoal}
                variant="outline"
                className="mt-5 h-11 w-full border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                {isSaved ? "목표 저장됨" : "이 목표로 진행"}
              </Button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-violet-600" />
                <h2 className="text-base font-bold">비교 기준</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                결과 리포트의 질문별 이벤트와 지표를 기준으로 같은 교정 목표의
                변화량을 비교합니다. 영상이 pending이어도 그래프와 드릴 목표는
                저장된 분석값으로 확인할 수 있습니다.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function TrainingGoalPage() {
  return (
    <Suspense fallback={null}>
      <TrainingGoalContent />
    </Suspense>
  );
}
