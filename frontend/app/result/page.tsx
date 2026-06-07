"use client";

import Link from "next/link";
import type { Ref } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  GitCompare,
  Info,
  LineChart,
  PlayCircle,
  RotateCcw,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAssetReadUrl,
  getCourseReports,
  getReport,
  getSessionAssets,
  persistDrillPlan,
} from "@/lib/session-api";
import type {
  AnalysisTimelineSegment,
  InterviewReport,
  InterviewReportMetric,
  InterviewReportQuestion,
} from "@/lib/runtime-types";

const QUESTION_DURATION_MS = 90_000;

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const scoreTone = (score: number) => {
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
};

const scoreBadgeTone = (score: number) => {
  if (score >= 75) return "bg-emerald-50 text-emerald-700";
  if (score >= 60) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
};

const eventMetricType = (type: string): AnalysisTimelineSegment["metricType"] => {
  if (type === "bad_posture") return "bad_posture";
  if (type === "fidget") return "fidget";
  if (type === "leg_shaking" || type === "leg_movement") return "leg_shaking";
  if (type === "silence") return "silence";
  if (type === "speaking_ratio") return "speaking_ratio";
  return "gaze_away";
};

const metricLabel = (metricType: AnalysisTimelineSegment["metricType"]) => {
  switch (metricType) {
    case "bad_posture":
      return "자세 흐트러짐";
    case "fidget":
      return "반복 움직임";
    case "leg_shaking":
      return "다리 움직임";
    case "silence":
      return "침묵 구간";
    case "speaking_ratio":
      return "발화 밀도";
    case "answer_quality":
      return "답변 품질";
    case "gaze_away":
    default:
      return "시선 이탈";
  }
};

const buildTimeline = (
  report: InterviewReport,
  sessionId: string
): AnalysisTimelineSegment[] => {
  const segments: AnalysisTimelineSegment[] = [];

  (report.questions ?? []).forEach((question, questionOffset) => {
    const questionBase = questionOffset * QUESTION_DURATION_MS;
    const events = Array.isArray(question.events) ? question.events : [];

    events.forEach((event, eventIndex) => {
      const eventType = String(event.type ?? event.eventType ?? "gaze_away");
      const t0 =
        numberValue(event.t0) ??
        numberValue(event.startMs) ??
        questionBase + eventIndex * 3000;
      const t1 =
        numberValue(event.t1) ??
        numberValue(event.endMs) ??
        Math.max(t0 + 1500, t0);
      const metricType = eventMetricType(eventType);

      segments.push({
        id: `${question.answerTurnId ?? question.questionId ?? questionOffset}-event-${eventIndex}`,
        sessionId,
        answerTurnId: question.answerTurnId ?? "",
        questionId: question.questionId,
        questionIndex: question.questionIndex,
        topic: typeof question.topic === "string" ? question.topic : undefined,
        phase: typeof question.phase === "string" ? question.phase : undefined,
        t0,
        t1,
        label: metricLabel(metricType),
        severity: String(event.severity ?? "low") as AnalysisTimelineSegment["severity"],
        score: numberValue(event.confidence),
        metricType,
        source: metricType === "silence" || metricType === "speaking_ratio" ? "audio_chunk" : "vision_chunk",
      });
    });

    const content = question.contentAnalysis as
      | {
          star?: { score?: number };
          specificityScore?: number;
          evidenceScore?: number;
          jobFitScore?: number;
        }
      | undefined;
    const contentScore =
      numberValue(content?.star?.score) ??
      numberValue(content?.specificityScore) ??
      numberValue(content?.evidenceScore) ??
      numberValue(content?.jobFitScore);

    if (contentScore !== undefined) {
      segments.push({
        id: `${question.answerTurnId ?? question.questionId ?? questionOffset}-content`,
        sessionId,
        answerTurnId: question.answerTurnId ?? "",
        questionId: question.questionId,
        questionIndex: question.questionIndex,
        topic: typeof question.topic === "string" ? question.topic : undefined,
        phase: typeof question.phase === "string" ? question.phase : undefined,
        t0: questionBase,
        t1: questionBase + QUESTION_DURATION_MS,
        label: `답변 품질 ${Math.round(contentScore)}점`,
        score: contentScore,
        severity:
          contentScore >= 75 ? "low" : contentScore >= 60 ? "medium" : "high",
        metricType: "answer_quality",
        source: "content_analysis",
      });
    }
  });

  return segments.sort((a, b) => a.t0 - b.t0);
};

type SeriesKey =
  | "overall"
  | "pace"
  | "filler"
  | "gaze"
  | "structure";

type TimelineSeries = {
  key: SeriesKey;
  label: string;
  color: string;
  values: number[];
};

const metricScore = (
  metrics: InterviewReportMetric[],
  keys: string[],
  fallback: number
) => {
  const found = metrics.find((metric) => {
    const haystack = `${metric.metricKey ?? ""} ${metric.label}`.toLowerCase();
    return keys.some((key) => haystack.includes(key));
  });
  return found?.score ?? fallback;
};

const segmentPenalty = (
  segment: AnalysisTimelineSegment,
  key: SeriesKey
) => {
  const severityWeight =
    segment.severity === "high" ? 18 : segment.severity === "medium" ? 11 : 6;
  if (key === "overall") return severityWeight * 0.55;
  if (key === "pace" && ["silence", "speaking_ratio"].includes(segment.metricType)) {
    return severityWeight;
  }
  if (key === "filler" && segment.metricType === "fidget") return severityWeight;
  if (key === "gaze" && segment.metricType === "gaze_away") return severityWeight;
  if (key === "structure" && segment.metricType === "answer_quality") {
    return Math.max(0, 75 - (segment.score ?? 75)) * 0.35;
  }
  return 0;
};

const buildSeries = (
  report: InterviewReport,
  segments: AnalysisTimelineSegment[],
  durationMs: number
): TimelineSeries[] => {
  const pointCount = 80;
  const bases: Record<SeriesKey, number> = {
    overall: report.totalScore,
    pace: metricScore(report.metrics, ["delivery", "전달", "말속", "audio"], 68),
    filler: metricScore(report.metrics, ["nonverbal", "비언어", "fidget"], 72),
    gaze: metricScore(report.metrics, ["gaze", "시선"], 74),
    structure: metricScore(report.metrics, ["answer", "답변", "quality", "구조"], 66),
  };

  const definitions: Array<Omit<TimelineSeries, "values">> = [
    { key: "overall", label: "종합 안정성", color: "#8b5cf6" },
    { key: "pace", label: "말속도", color: "#60a5fa" },
    { key: "filler", label: "추임새", color: "#f59e0b" },
    { key: "gaze", label: "시선 안정성", color: "#34d399" },
    { key: "structure", label: "답변 구조", color: "#fb7185" },
  ];

  return definitions.map((definition) => ({
    ...definition,
    values: Array.from({ length: pointCount }).map((_, index) => {
      const t = (index / (pointCount - 1)) * durationMs;
      const wave = Math.sin(index * 0.41 + definition.key.length) * 4;
      const penalty = segments.reduce((sum, segment) => {
        if (t < segment.t0 || t > segment.t1) return sum;
        return sum + segmentPenalty(segment, definition.key);
      }, 0);
      return clamp(Math.round(bases[definition.key] + wave - penalty));
    }),
  }));
};

const pathForValues = (values: number[], width: number, height: number) =>
  values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

function TimelineGraph({
  segments,
  questions,
  report,
  currentTimeMs,
  onSeek,
}: {
  segments: AnalysisTimelineSegment[];
  questions: InterviewReportQuestion[];
  report: InterviewReport;
  currentTimeMs: number;
  onSeek: (timeMs: number) => void;
}) {
  const durationMs = Math.max(
    QUESTION_DURATION_MS,
    ...segments.map((segment) => segment.t1),
    questions.length * QUESTION_DURATION_MS
  );
  const series = useMemo(
    () => buildSeries(report, segments, durationMs),
    [durationMs, report, segments]
  );
  const graphWidth = 760;
  const graphHeight = 180;
  const cursorLeft = clamp((currentTimeMs / durationMs) * 100);
  const unstableSegment =
    segments.find((segment) => segment.severity === "high") ??
    segments.find((segment) => segment.severity === "medium");
  const questionMarkers = questions.map((question, index) => {
    const t0 = index * QUESTION_DURATION_MS;
    const t1 = Math.min((index + 1) * QUESTION_DURATION_MS, durationMs);
    const center = (t0 + t1) / 2;
    return {
      question,
      index,
      left: clamp((center / durationMs) * 100),
      startLeft: clamp((t0 / durationMs) * 100),
      width: Math.max(1, ((t1 - t0) / durationMs) * 100),
    };
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">전달 안정성 타임라인 분석</h2>
        <Info className="h-4 w-4 text-slate-400" />
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        <div className="relative h-16 border-b border-slate-100 text-center text-xs font-semibold">
          {questionMarkers.map(({ question, index, startLeft, width }) => (
            <button
              key={`${question.answerTurnId ?? question.questionId ?? index}-question-band`}
              type="button"
              onClick={() => onSeek(index * QUESTION_DURATION_MS)}
              className={`absolute top-0 h-full border-r border-slate-200 px-2 py-2 text-left ${
                index % 3 === 2 ? "bg-rose-50 text-rose-600" : index % 3 === 0 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
              }`}
              style={{ left: `${startLeft}%`, width: `${width}%` }}
            >
              Q{question.questionIndex ?? index + 1}
              <span className="ml-1 hidden xl:inline">
                {question.topic ? String(question.topic) : "질문"}
              </span>
              <span className="block pt-1 font-mono text-[11px] font-medium">
                {formatTime(index * QUESTION_DURATION_MS)} ~ {formatTime((index + 1) * QUESTION_DURATION_MS)}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[130px_1fr]">
          <div className="space-y-3 pt-5 text-xs font-medium text-slate-600">
            {series.map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </div>
            ))}
          </div>

          <div className="relative min-h-[230px]">
            <svg
              viewBox={`0 0 ${graphWidth} ${graphHeight}`}
              className="h-[210px] w-full overflow-visible"
              preserveAspectRatio="none"
            >
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = graphHeight - (tick / 100) * graphHeight;
                return (
                  <g key={tick}>
                    <line x1="0" x2={graphWidth} y1={y} y2={y} stroke="#e2e8f0" />
                    <text x="-18" y={y + 4} fill="#94a3b8" fontSize="11">
                      {tick}
                    </text>
                  </g>
                );
              })}

              {unstableSegment ? (
                <rect
                  x={(unstableSegment.t0 / durationMs) * graphWidth}
                  y="0"
                  width={Math.max(
                    12,
                    ((unstableSegment.t1 - unstableSegment.t0) / durationMs) *
                      graphWidth
                  )}
                  height={graphHeight}
                  fill="#fee2e2"
                  opacity="0.7"
                />
              ) : null}

              {series.map((item) => (
                <path
                  key={item.key}
                  d={pathForValues(item.values, graphWidth, graphHeight)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              <line
                x1={(currentTimeMs / durationMs) * graphWidth}
                x2={(currentTimeMs / durationMs) * graphWidth}
                y1="0"
                y2={graphHeight}
                stroke="#7c3aed"
                strokeWidth="1.5"
              />
            </svg>

            {unstableSegment ? (
              <button
                type="button"
                onClick={() => onSeek(unstableSegment.t0)}
                className="absolute left-1/2 top-9 -translate-x-1/2 rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg"
              >
                가장 불안정한 구간
                <span className="block font-mono">
                  {formatTime(unstableSegment.t0)} ~ {formatTime(unstableSegment.t1)}
                </span>
              </button>
            ) : null}

            <div className="relative mt-2 h-8 rounded-full bg-slate-200">
              <span
                className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-500 shadow"
                style={{ left: `${cursorLeft}%` }}
              />
              {segments.map((segment) => {
                const left = clamp((segment.t0 / durationMs) * 100);
                const color =
                  segment.severity === "high"
                    ? "bg-rose-500"
                    : segment.severity === "medium"
                    ? "bg-amber-500"
                    : "bg-emerald-500";
                return (
                  <button
                    key={`${segment.id}-dot`}
                    type="button"
                    title={segment.label}
                    onClick={() => onSeek(segment.t0)}
                    className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${color}`}
                    style={{ left: `${left}%` }}
                  />
                );
              })}
            </div>
            <div className="relative mt-3 h-6 font-mono text-[11px] font-semibold text-slate-500">
              {questionMarkers.map(({ question, index, left }) => (
                <button
                  key={`${question.answerTurnId ?? question.questionId ?? index}-x-label`}
                  type="button"
                  onClick={() => onSeek(index * QUESTION_DURATION_MS)}
                  className="absolute top-0 -translate-x-1/2 rounded px-1 py-0.5 hover:bg-slate-100 hover:text-violet-700"
                  style={{ left: `${left}%` }}
                >
                  Q{question.questionIndex ?? index + 1}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs text-slate-500">
              <span>00:00</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 border-t border-slate-100 px-4 py-4 text-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
            안정 구간
          </span>
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            불안정 구간
          </span>
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-3 w-3 rounded-full bg-amber-500" />
            주의 구간
          </span>
        </div>
      </div>
    </section>
  );
}

const displayMetricTitle = (metric: InterviewReportMetric) => {
  const key = `${metric.metricKey ?? ""} ${metric.label}`.toLowerCase();
  if (key.includes("delivery") || key.includes("전달")) return "말속도 안정성";
  if (key.includes("nonverbal") || key.includes("비언어")) return "시선 안정성";
  if (key.includes("answer") || key.includes("답변")) return "답변 구조 안정성";
  if (key.includes("job") || key.includes("직무")) return "직무 적합성";
  return metric.label;
};

function ScorePanel({ report }: { report: InterviewReport }) {
  const metrics = report.metrics.slice(0, 4);
  const baselineMetrics = Object.values(report.comparison?.baseline?.metrics ?? {});
  const averageDelta = baselineMetrics.length
    ? Math.round(
        baselineMetrics.reduce((sum, item) => sum + item.delta, 0) /
          baselineMetrics.length
      )
    : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">전달 안정성 점수</h2>
            <Info className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className={`font-mono text-6xl font-bold ${scoreTone(report.totalScore)}`}>
              {report.totalScore}
            </span>
            <span className="pb-2 text-3xl font-semibold text-slate-400">/ 100</span>
          </div>
          <p className="mt-4 text-sm font-medium text-slate-600">
            {averageDelta === null
              ? "이번 세션의 전달 안정성을 종합했습니다."
              : averageDelta >= 0
              ? `기준 세션보다 ${averageDelta}점 향상되었습니다.`
              : `기준 세션보다 ${Math.abs(averageDelta)}점 낮아졌습니다.`}
          </p>
        </div>
        <div className="rounded-lg bg-violet-50 px-5 py-4 text-center">
          <p className="text-xs font-semibold text-slate-500">Baseline 대비</p>
          <p
            className={`mt-2 font-mono text-3xl font-bold ${
              averageDelta === null
                ? "text-slate-500"
                : averageDelta >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }`}
          >
            {averageDelta === null ? "-" : `${averageDelta > 0 ? "+" : ""}${averageDelta}`}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {metrics.map((metric) => (
          <article
            key={`${metric.metricKey ?? metric.label}-score-card`}
            className="rounded-lg border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{displayMetricTitle(metric)}</h3>
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-bold ${scoreBadgeTone(metric.score)}`}
              >
                {metric.status}
              </span>
            </div>
            <p className={`mt-3 font-mono text-3xl font-bold ${scoreTone(metric.score)}`}>
              {metric.score}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function VideoPanel({
  videoRef,
  videoUrl,
  videoStatus,
  currentQuestion,
  currentTimeMs,
  durationMs,
  onTimeUpdate,
}: {
  videoRef: Ref<HTMLVideoElement>;
  videoUrl: string | null;
  videoStatus: string;
  currentQuestion?: InterviewReportQuestion;
  currentTimeMs: number;
  durationMs: number;
  onTimeUpdate: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-sm">
      <div className="absolute left-4 top-4 z-10 max-w-[340px] rounded-lg bg-slate-950/72 px-5 py-4 text-white backdrop-blur">
        <p className="text-sm font-bold">Q{currentQuestion?.questionIndex ?? 1}</p>
        <p className="mt-2 text-sm leading-6 text-white/90">
          {currentQuestion?.phaseGoal ??
            currentQuestion?.topic ??
            "현재 질문 구간을 재생 중입니다."}
        </p>
      </div>
      <div className="absolute right-4 top-4 z-10 rounded-lg bg-slate-950/72 px-3 py-2 font-mono text-sm font-semibold text-white backdrop-blur">
        {formatTime(currentTimeMs)} / {formatTime(durationMs)}
      </div>

      {videoUrl ? (
        <video
          ref={videoRef}
          controls
          src={videoUrl}
          onTimeUpdate={onTimeUpdate}
          className="aspect-video w-full bg-slate-950 object-contain"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">
          {videoStatus}
        </div>
      )}
    </section>
  );
}

const buildInsights = (
  report: InterviewReport,
  segments: AnalysisTimelineSegment[]
) => {
  const weakestMetric = [...report.metrics].sort((a, b) => a.score - b.score)[0];
  const highSegment =
    segments.find((segment) => segment.severity === "high") ??
    segments.find((segment) => segment.severity === "medium");
  const weakPattern = report.weakPatterns[0];

  return [
    {
      icon: TrendingDown,
      title: highSegment
        ? `Q${highSegment.questionIndex ?? ""}에서 ${highSegment.label}이 두드러졌어요`
        : `${weakestMetric?.label ?? "전달 안정성"} 보완이 필요해요`,
      body: highSegment
        ? `${formatTime(highSegment.t0)} ~ ${formatTime(highSegment.t1)} 구간을 다시 확인해 보세요.`
        : weakestMetric?.summary ?? report.summary,
      tone: "bg-rose-50 text-rose-600",
    },
    {
      icon: Clock3,
      title: "질문별 흐름을 시간축으로 확인할 수 있어요",
      body: "타임라인의 점이나 질문 구간을 누르면 해당 영상 시점으로 이동합니다.",
      tone: "bg-amber-50 text-amber-600",
    },
    {
      icon: CheckCircle2,
      title: weakPattern ? `${weakPattern.title}을 다음 교정 목표로 잡았어요` : "다음 드릴 목표가 준비됐어요",
      body: weakPattern?.recommendedInstruction ?? "추천 드릴을 통해 다음 세션 전 보완 목표를 연습하세요.",
      tone: "bg-emerald-50 text-emerald-600",
    },
  ];
};

function InsightPanel({
  report,
  segments,
  drillHref,
}: {
  report: InterviewReport;
  segments: AnalysisTimelineSegment[];
  drillHref: string | null;
}) {
  const insights = buildInsights(report, segments);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">핵심 인사이트</h2>
      <div className="mt-5 space-y-4 rounded-lg bg-slate-50 p-4">
        {insights.map((insight) => {
          const Icon = insight.icon;
          return (
            <article key={insight.title} className="flex gap-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${insight.tone}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold">{insight.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {insight.body}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {drillHref ? (
        <Button asChild className="mt-6 h-12 w-full bg-violet-600 text-base font-bold hover:bg-violet-700">
          <Link href={drillHref}>
            맞춤 교정 가이드 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}

function ResultContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("영상 저장 상태를 확인하고 있습니다.");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    getReport(sessionId)
      .then((loadedReport) => {
        if (ignore) return;
        setReport(loadedReport);
        persistDrillPlan(loadedReport.recommendedPlan);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Report load failed");
      });

    return () => {
      ignore = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!report?.recommendedPlan.courseId || !sessionId || report.comparison) {
      return;
    }
    getCourseReports(report.recommendedPlan.courseId).then((reports) => {
      const current = reports.find((item) => item.sessionId === sessionId);
      if (!current?.comparison) return;
      setReport((existing) =>
        existing ? { ...existing, comparison: current.comparison } : existing
      );
    });
  }, [report?.recommendedPlan.courseId, report?.comparison, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let timer: number | null = null;

    const poll = async () => {
      attempt += 1;
      const assets = await getSessionAssets(sessionId);
      const video = assets.find((asset) => asset.assetType === "session_video");

      if (cancelled) return;

      if (!video) {
        setVideoStatus("면접 영상 저장을 기다리고 있습니다.");
      } else if (video.status === "pending") {
        setVideoStatus("면접 영상을 업로드하는 중입니다.");
      } else {
        const url = await getAssetReadUrl(sessionId, video.id);
        if (!cancelled && url) {
          setVideoUrl(url);
          setVideoStatus("면접 영상이 준비되었습니다.");
          return;
        }
      }

      if (attempt < 45) {
        timer = window.setTimeout(poll, 1500);
      } else {
        setVideoStatus("영상 저장이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.");
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  const drillHref = useMemo(() => {
    const planId = report?.recommendedPlan.planId;
    return planId
      ? `/training/drill?planId=${encodeURIComponent(planId)}&step=0`
      : null;
  }, [report]);

  const timeline = useMemo(
    () => (report && sessionId ? buildTimeline(report, sessionId) : []),
    [report, sessionId]
  );

  const durationMs = useMemo(
    () =>
      Math.max(
        QUESTION_DURATION_MS,
        ...timeline.map((segment) => segment.t1),
        (report?.questions?.length ?? 0) * QUESTION_DURATION_MS
      ),
    [report?.questions?.length, timeline]
  );

  const currentQuestion = useMemo(() => {
    const index = Math.min(
      Math.max(0, Math.floor(currentTimeMs / QUESTION_DURATION_MS)),
      Math.max(0, (report?.questions?.length ?? 1) - 1)
    );
    return report?.questions?.[index];
  }, [currentTimeMs, report?.questions]);

  const seekVideo = (timeMs: number) => {
    const video = videoRef.current;
    setCurrentTimeMs(timeMs);
    if (!video) return;
    video.currentTime = Math.max(0, timeMs / 1000);
    void video.play().catch(() => undefined);
  };

  if (!report) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] p-6 text-slate-950">
        <p className="text-sm text-slate-600">
          {error ?? "결과를 불러오는 중입니다."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto max-w-[1520px] px-5 py-4 lg:px-6">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="rounded-lg bg-white px-5 py-3 text-sm font-bold shadow-sm">
              세션 상세 분석
            </div>
            <div className="hidden text-lg font-bold text-slate-800 md:block">
              면접 세션 리포트
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="hidden gap-2 md:inline-flex">
              <Link href="/guideline">
                <GitCompare className="h-4 w-4" />
                다른 세션과 비교
              </Link>
            </Button>
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link href="/documents">새로운 세션 분석</Link>
            </Button>
          </div>
        </nav>

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_480px]">
          <VideoPanel
            videoRef={videoRef}
            videoUrl={videoUrl}
            videoStatus={videoStatus}
            currentQuestion={currentQuestion}
            currentTimeMs={currentTimeMs}
            durationMs={durationMs}
            onTimeUpdate={() =>
              setCurrentTimeMs((videoRef.current?.currentTime ?? 0) * 1000)
            }
          />
          <ScorePanel report={report} />
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_480px]">
          <TimelineGraph
            report={report}
            segments={timeline}
            questions={report.questions ?? []}
            currentTimeMs={currentTimeMs}
            onSeek={seekVideo}
          />
          <InsightPanel report={report} segments={timeline} drillHref={drillHref} />
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">세부 평가 항목</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {report.metrics.map((metric) => (
                <article key={`${metric.metricKey ?? metric.label}-detail`} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{metric.label}</h3>
                    <span className={`font-mono text-2xl font-bold ${scoreTone(metric.score)}`}>
                      {metric.score}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {metric.summary}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">추천 교정 드릴</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {report.recommendedPlan.drills.map((drill, index) => (
                <article key={drill.drillId} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-bold text-violet-600">Drill {index + 1}</p>
                  <h3 className="mt-1 font-semibold">{drill.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {drill.instruction}
                  </p>
                </article>
              ))}
            </div>
          </section>
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
