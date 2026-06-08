"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Footprints,
  Gauge,
  Mic,
  Network,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createFinalReport,
  getFinalReport,
  type CourseReportResponse,
} from "@/lib/session-api";

type TrendSnapshot = {
  reportId?: string;
  reportType?: string;
  sessionId?: string | null;
  createdAt?: string | null;
  metrics?: Record<string, unknown>;
};

type MetricDelta = {
  current?: number;
  reference?: number;
  delta?: number;
  deltaPercent?: number | null;
  improved?: boolean | null;
};

type MetricCard = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  mode: "score" | "count";
  color: string;
};

const metricCards: MetricCard[] = [
  {
    label: "시선 안정성",
    icon: Gauge,
    path: "nonverbal.gazeAwayRatio",
    mode: "score",
    color: "bg-violet-500",
  },
  {
    label: "답변 구조 안정성",
    icon: Network,
    path: "content.starScore",
    mode: "score",
    color: "bg-orange-500",
  },
  {
    label: "말속도 안정성",
    icon: Mic,
    path: "audio.averageSpeakingRatio",
    mode: "score",
    color: "bg-blue-500",
  },
  {
    label: "직무 적합성",
    icon: Calendar,
    path: "content.jobFitScore",
    mode: "score",
    color: "bg-indigo-500",
  },
  {
    label: "fidget 반복 움직임",
    icon: Footprints,
    path: "nonverbal.fidgetingRatio",
    mode: "count",
    color: "bg-emerald-500",
  },
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const metricValue = (metrics: Record<string, unknown> | undefined, path: string) =>
  asNumber(metrics?.[path]);

const percentScore = (value: number | null, path: string): number | null => {
  if (value === null) return null;
  if (path.includes("Ratio")) return Math.max(0, Math.min(100, Math.round(100 - value * 100)));
  if (path === "audio.averageSpeakingRatio") {
    return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
  }
  return Math.round(value);
};

const countValue = (value: number | null) => {
  if (value === null) return null;
  return Math.round(value <= 1 ? value * 20 : value);
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const sessionLabel = (snapshot: TrendSnapshot, index: number) => {
  if (snapshot.reportType === "baseline_report") return "Baseline";
  return `Recheck ${Math.max(1, index)}`;
};

const stabilityScore = (snapshot?: TrendSnapshot) => {
  const metrics = snapshot?.metrics;
  if (!metrics) return null;
  const values = [
    percentScore(metricValue(metrics, "nonverbal.averageNonverbalRiskScore"), "risk"),
    percentScore(metricValue(metrics, "nonverbal.gazeAwayRatio"), "nonverbal.gazeAwayRatio"),
    percentScore(metricValue(metrics, "nonverbal.badPostureRatio"), "nonverbal.badPostureRatio"),
    percentScore(metricValue(metrics, "nonverbal.fidgetingRatio"), "nonverbal.fidgetingRatio"),
    percentScore(metricValue(metrics, "nonverbal.legShakingRatio"), "nonverbal.legShakingRatio"),
    percentScore(metricValue(metrics, "content.starScore"), "content.starScore"),
    percentScore(metricValue(metrics, "content.jobFitScore"), "content.jobFitScore"),
  ].filter((value): value is number => value !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

function FinalReportContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId");
  const [report, setReport] = useState<CourseReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setError("courseId가 필요합니다.");
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
        setError(err instanceof Error ? err.message : "최종 리포트 로드 실패");
      });

    return () => {
      ignore = true;
    };
  }, [courseId]);

  const trend = useMemo(() => {
    const comparison = asRecord(report?.comparison);
    const raw = comparison.trend;
    return Array.isArray(raw) ? (raw as TrendSnapshot[]) : [];
  }, [report]);

  const baseline = trend[0];
  const latest = trend[trend.length - 1];
  const baselineScore = stabilityScore(baseline);
  const latestScore = stabilityScore(latest);
  const scoreDelta =
    baselineScore !== null && latestScore !== null ? latestScore - baselineScore : null;
  const improvementPercent =
    scoreDelta !== null && baselineScore ? Math.round((scoreDelta / baselineScore) * 1000) / 10 : null;

  const baselineToLatest = asRecord(asRecord(report?.comparison).baselineToLatest);
  const deltaMetrics = asRecord(baselineToLatest.metrics) as Record<string, MetricDelta>;
  const completedLoopCount = Math.max(0, trend.length - 1);
  const latestSessionLabel = latest ? sessionLabel(latest, Math.max(0, trend.length - 1)) : "최신 세션";

  if (!report) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] p-6 text-slate-950">
        <p className="text-sm text-slate-600">
          {error ?? "최종 리포트를 불러오는 중입니다."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto max-w-[1320px] px-5 py-6 lg:px-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button asChild variant="ghost" size="icon" className="mt-1">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold">최종 성장 리포트</h1>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                  {completedLoopCount}회 교정 루프 완료
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Baseline부터 {latestSessionLabel}까지의 전체 여정을 종합한 최종 리포트입니다.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">
              <ArrowDownToLine className="h-4 w-4" />
              리포트 다운로드
            </Button>
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link href="/">
                새로운 연습 시작
              </Link>
            </Button>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr_1fr]">
            <div>
              <p className="text-sm font-bold">전달 안정성 종합 점수</p>
              <div className="mt-5 flex items-end gap-4">
                <span className="text-6xl font-bold text-slate-500">
                  {baselineScore ?? "-"}
                  <span className="text-2xl">점</span>
                </span>
                <span className="pb-3 text-3xl text-slate-400">→</span>
                <span className="text-6xl font-bold text-violet-600">
                  {latestScore ?? "-"}
                  <span className="text-2xl">점</span>
                </span>
              </div>
              {scoreDelta !== null ? (
                <div className="mt-5 flex items-center gap-4">
                  <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                    {scoreDelta > 0 ? "+" : ""}
                    {scoreDelta}점 향상
                  </span>
                  {improvementPercent !== null ? (
                    <span className="text-sm font-semibold text-slate-500">
                      {improvementPercent}% 개선
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center justify-center border-y border-slate-200 py-5 lg:border-x lg:border-y-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <Trophy className="h-8 w-8" />
              </div>
              <p className="mt-4 text-center text-sm leading-6 text-slate-600">
                {completedLoopCount}회의 교정 루프를 통해
                <br />
                전달 안정성이 크게 향상되었습니다.
              </p>
            </div>

            <div className="grid gap-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <Calendar className="h-4 w-4" /> 시작일
                </span>
                <strong>{formatDate(baseline?.createdAt)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <Calendar className="h-4 w-4" /> 최종 완료일
                </span>
                <strong>{formatDate(latest?.createdAt)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <Clock className="h-4 w-4" /> 총 진행 기간
                </span>
                <strong>{trend.length ? `${trend.length}개 리포트 기준` : "-"}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600">
                  <FileText className="h-4 w-4" /> 총 세션 수
                </span>
                <strong>{trend.length}개</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">주요 항목별 개선 결과</h2>
          <p className="mt-2 text-sm text-slate-500">
            각 항목의 첫 기록과 마지막 기록을 비교합니다.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-5">
            {metricCards.map((metric) => {
              const firstRaw = metricValue(baseline?.metrics, metric.path);
              const lastRaw = metricValue(latest?.metrics, metric.path);
              const first =
                metric.mode === "count"
                  ? countValue(firstRaw)
                  : percentScore(firstRaw, metric.path);
              const last =
                metric.mode === "count" ? countValue(lastRaw) : percentScore(lastRaw, metric.path);
              const delta = first !== null && last !== null ? last - first : null;
              const Icon = metric.icon;

              return (
                <article key={metric.path} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-bold">{metric.label}</h3>
                  </div>
                  <div className="mt-5 flex items-center justify-center gap-3 text-2xl font-bold">
                    <span className="text-slate-500">{first ?? "-"}</span>
                    <ArrowRight className="h-5 w-5 text-slate-300" />
                    <span className="text-violet-600">{last ?? "-"}</span>
                  </div>
                  {delta !== null ? (
                    <p className="mt-3 text-center text-xs font-bold text-emerald-700">
                      {metric.mode === "count"
                        ? `${Math.abs(delta)}회 ${delta <= 0 ? "감소" : "증가"}`
                        : `${delta > 0 ? "+" : ""}${delta}점 변화`}
                    </p>
                  ) : null}
                  <div className="mt-5 flex h-24 items-end justify-center gap-8 border-b border-slate-200 px-2">
                    {[first, last].map((value, index) => (
                      <div key={index} className="flex flex-col items-center gap-2">
                        <div
                          className={`w-9 rounded-t ${index === 0 ? "bg-slate-400" : metric.color}`}
                          style={{ height: `${Math.max(8, Math.min(88, value ?? 0))}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-around text-xs text-slate-500">
                    <span>Baseline</span>
                    <span>{latestSessionLabel}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">교정 루프 전체 진행 추이</h2>
          <p className="mt-2 text-sm text-slate-500">
            Baseline 이후 재점검 풀세션들의 전달 안정성 점수 변화입니다.
          </p>
          <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-5">
              <div className="flex h-48 items-end justify-between gap-4 border-b border-slate-200">
                {trend.map((snapshot, index) => {
                  const score = stabilityScore(snapshot);
                  return (
                    <div key={snapshot.reportId ?? index} className="flex flex-1 flex-col items-center gap-3">
                      <span className="text-sm font-bold">{score ?? "-"}</span>
                      <div
                        className="w-full max-w-16 rounded-t bg-violet-500"
                        style={{ height: `${Math.max(8, Math.min(160, score ?? 0) * 1.5)}px` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-between gap-4 text-center text-xs font-semibold text-slate-600">
                {trend.map((snapshot, index) => (
                  <span key={snapshot.reportId ?? index} className="flex-1">
                    {sessionLabel(snapshot, index)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-violet-100 bg-violet-50 p-5">
              <p className="text-sm font-bold">전달 안정성 변화</p>
              <div className="mt-6 flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-500">{baselineScore ?? "-"}</p>
                  <p className="text-xs text-slate-500">Baseline</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400" />
                <div className="text-center">
                  <p className="text-3xl font-bold text-violet-600">{latestScore ?? "-"}</p>
                  <p className="text-xs text-slate-500">{latestSessionLabel}</p>
                </div>
              </div>
              {scoreDelta !== null ? (
                <p className="mt-6 text-center text-sm font-bold text-emerald-700">
                  {scoreDelta > 0 ? "+" : ""}
                  {scoreDelta}점 향상
                  {improvementPercent !== null ? ` (${improvementPercent}%)` : ""}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">AI 종합 평가</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              {report.summary || "최종 평가 문장이 아직 생성되지 않았습니다."}
            </p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">다음 목표 제안</h2>
            <div className="mt-4 rounded-lg bg-violet-50 p-4">
              <p className="text-xs font-bold text-violet-600">현재 수준</p>
              <p className="mt-2 text-3xl font-bold text-violet-600">
                {latestScore !== null ? `${latestScore}점` : "-"}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {Object.entries(deltaMetrics)
                .slice(0, 3)
                .map(([metric, value]) => (
                  <p key={metric} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {metric} {value.improved ? "개선 유지" : "추가 점검"}
                  </p>
                ))}
            </div>
          </article>
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
