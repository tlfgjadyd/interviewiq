"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, LineChart, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseStageBanner } from "@/components/course/CourseStageBanner";
import {
  createFinalReport,
  getFinalReport,
  type CourseReportResponse,
} from "@/lib/session-api";

type MetricDelta = {
  current?: number;
  reference?: number;
  delta?: number;
  deltaPercent?: number | null;
  improved?: boolean | null;
  lowerIsBetter?: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

function FinalReportContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId");
  const [report, setReport] = useState<CourseReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setError("courseId가 없습니다.");
      return;
    }

    let ignore = false;
    getFinalReport(courseId)
      .then((existing) => existing ?? createFinalReport(courseId))
      .then((loaded) => {
        if (ignore) return;
        if (!loaded) {
          setError("최종 리포트를 생성할 수 없습니다.");
          return;
        }
        setReport(loaded);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Final report load failed");
      });

    return () => {
      ignore = true;
    };
  }, [courseId]);

  const metrics = useMemo(() => {
    const latestReport = asRecord(report?.metrics.latestReport);
    return asRecord(latestReport.metrics);
  }, [report]);

  const trend = useMemo(() => {
    const baselineToLatest = asRecord(report?.comparison.baselineToLatest);
    return asRecord(baselineToLatest.metrics) as Record<string, MetricDelta>;
  }, [report]);

  const recommendations = asRecord(report?.recommendations);
  const focus = Array.isArray(recommendations.focus) ? recommendations.focus : [];
  const nextTargetPhase =
    typeof recommendations.nextTargetPhase === "string"
      ? recommendations.nextTargetPhase
      : null;

  if (!report) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] p-6 text-slate-950">
        <p className="text-sm text-slate-600">
          {error ?? "최종 리포트를 불러오는 중입니다."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <nav>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              홈
            </Link>
          </Button>
        </nav>

        <div className="mt-4">
          <CourseStageBanner
            current="최종 리포트"
            next="개인 연습 계획"
            progressLabel="코스 완료"
          />
        </div>

        <header className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <FileText className="h-4 w-4" />
            최종 리포트
          </div>
          <h1 className="mt-3 text-2xl font-semibold lg:text-3xl">
            코스 전체 세션을 종합한 최종 분석입니다.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {report.summary}
          </p>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <LineChart className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">최신 세션 핵심 지표</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(metrics).map(([metric, value]) => (
                  <div
                    key={metric}
                    className="rounded-lg border border-slate-200 p-4 text-sm"
                  >
                    <p className="font-medium text-slate-700">{metric}</p>
                    <p className="mt-2 font-mono text-2xl font-semibold">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">baseline 대비 변화</h2>
              <div className="mt-4 space-y-3">
                {Object.entries(trend).length ? (
                  Object.entries(trend).map(([metric, value]) => (
                    <div
                      key={metric}
                      className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm md:grid-cols-[1fr_110px_110px_110px]"
                    >
                      <span className="font-medium">{metric}</span>
                      <span>현재 {value.current}</span>
                      <span>기준 {value.reference}</span>
                      <span
                        className={
                          value.improved === true
                            ? "text-emerald-700"
                            : value.improved === false
                            ? "text-rose-700"
                            : "text-slate-600"
                        }
                      >
                        {typeof value.delta === "number" && value.delta > 0 ? "+" : ""}
                        {value.delta}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    baseline 비교 데이터가 아직 없습니다.
                  </p>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold">다음 교정 목표</h2>
              </div>
              <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                {nextTargetPhase ?? "아직 산정되지 않음"}
              </p>
              <div className="mt-4 space-y-2">
                {focus.map((item) => (
                  <p
                    key={String(item)}
                    className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm leading-6 text-slate-700"
                  >
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    {String(item)}
                  </p>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function FinalReportPage() {
  return (
    <Suspense fallback={null}>
      <FinalReportContent />
    </Suspense>
  );
}
