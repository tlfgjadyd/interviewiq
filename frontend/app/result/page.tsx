"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  LineChart,
  PlayCircle,
  RotateCcw,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loopSteps, recommendedGoal } from "@/lib/training";
import { getReport, persistDrillPlan } from "@/lib/session-api";
import type { InterviewReport } from "@/lib/runtime-types";

type BaselineRecord = {
  createdAt?: string;
  durationSeconds?: number;
  status?: string;
};

const scoreTone = (score: number) => {
  if (score >= 75) {
    return "bg-emerald-500";
  }
  if (score >= 60) {
    return "bg-amber-500";
  }
  return "bg-rose-500";
};

function ResultContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [baseline, setBaseline] = useState<BaselineRecord | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("interviewiq-baseline");
    if (!raw) {
      return;
    }

    try {
      setBaseline(JSON.parse(raw) as BaselineRecord);
    } catch {
      setBaseline(null);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    getReport(sessionId).then((loadedReport) => {
      if (ignore) {
        return;
      }

      setReport(loadedReport);
      persistDrillPlan(loadedReport.recommendedPlan);
    });

    return () => {
      ignore = true;
    };
  }, [sessionId]);

  const activeReport = report;
  const totalScore = activeReport?.totalScore ?? 0;
  const drillHref = useMemo(() => {
    const planId = activeReport?.recommendedPlan.planId;
    return planId
      ? `/training/drill?planId=${encodeURIComponent(planId)}&step=0`
      : "/training/drill/1";
  }, [activeReport]);

  if (!activeReport) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] p-6 text-slate-950">
        <p className="text-sm text-slate-600">결과를 불러오는 중입니다.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <nav className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />홈
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/baseline">
              <RotateCcw className="h-4 w-4" />
              풀세션 다시 보기
            </Link>
          </Button>
        </nav>

        <header className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
            <section className="p-6 lg:p-8">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <ClipboardList className="h-4 w-4" />
                초기 풀세션 결과
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight text-slate-950 lg:text-3xl">
                답변 구조와 근거 제시를 우선 교정합니다.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {activeReport.summary}
              </p>
            </section>
            <aside className="border-t border-slate-200 bg-slate-950 p-6 text-white lg:border-l lg:border-t-0">
              <p className="text-sm font-medium text-slate-300">종합 준비도</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-5xl font-semibold">
                  {totalScore}
                </span>
                <span className="pb-2 text-sm text-slate-400">/ 100</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                {baseline?.status === "completed"
                  ? "베이스라인 측정값을 기준으로 비교했습니다."
                  : "저장된 베이스라인이 없어 기본 기준으로 산출했습니다."}
              </p>
            </aside>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">항목별 진단</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    report.metrics를 기준으로 드릴 계획을 생성합니다.
                  </p>
                </div>
                <LineChart className="h-5 w-5 text-blue-600" />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {activeReport.metrics.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{item.label}</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {item.status}
                        </p>
                      </div>
                      <span className="font-mono text-2xl font-semibold">
                        {item.score}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${scoreTone(
                          item.score
                        )}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {item.summary}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">추천 교정 목표</h2>
              </div>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
                <p className="text-sm font-semibold text-blue-700">
                  {recommendedGoal.metricLabel} 집중 개선
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {recommendedGoal.title}
                </h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold">근거</p>
                    <div className="mt-2 space-y-2">
                      {activeReport.weakPatterns[0]?.evidence.map((item) => (
                        <p
                          key={item}
                          className="rounded-lg bg-white px-3 py-2 text-sm leading-6 text-slate-700"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">성공 기준</p>
                    <div className="mt-2 space-y-2">
                      {recommendedGoal.successCriteria.map((item) => (
                        <p
                          key={item}
                          className="flex gap-2 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-slate-700"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">추천 드릴 계획</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {activeReport.recommendedPlan.drills.map((drill, index) => (
                  <article
                    key={drill.drillId}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-xs font-semibold text-blue-700">
                      Drill {index + 1}
                    </p>
                    <h3 className="mt-2 font-semibold">{drill.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {drill.target}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">교정 루프 진행</h2>
              <div className="mt-4 space-y-3">
                {loopSteps.map((step) => {
                  const Icon = step.icon;
                  const active = step.state === "current";
                  const done = step.state === "done";

                  return (
                    <div
                      key={step.label}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${
                        active
                          ? "border-blue-200 bg-blue-50"
                          : done
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          active
                            ? "bg-blue-600 text-white"
                            : done
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold">다음 액션</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                추천 plan을 저장하고 planId 기반 드릴 플레이어로 이동합니다.
              </p>
              <Button asChild className="mt-5 w-full bg-blue-600 hover:bg-blue-700">
                <Link href={drillHref}>
                  추천 드릴 시작
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultContent />
    </Suspense>
  );
}
