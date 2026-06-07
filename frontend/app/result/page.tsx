"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  LineChart,
  PlayCircle,
  RotateCcw,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAssetReadUrl,
  getCourseReports,
  getReport,
  getSessionAssets,
  persistDrillPlan,
} from "@/lib/session-api";
import { CourseStageBanner } from "@/components/course/CourseStageBanner";
import type {
  AnalysisTimelineSegment,
  InterviewReport,
  InterviewReportQuestion,
} from "@/lib/runtime-types";

const scoreTone = (score: number) => {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
};

const severityTone = (severity?: string) => {
  if (severity === "high") return "bg-rose-500";
  if (severity === "medium") return "bg-amber-500";
  return "bg-blue-500";
};

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const eventMetricType = (type: string): AnalysisTimelineSegment["metricType"] => {
  if (type === "bad_posture") return "bad_posture";
  if (type === "fidget") return "fidget";
  if (type === "leg_shaking" || type === "leg_movement") return "leg_shaking";
  return "gaze_away";
};

const buildTimeline = (
  report: InterviewReport,
  sessionId: string
): AnalysisTimelineSegment[] => {
  const segments: AnalysisTimelineSegment[] = [];

  (report.questions ?? []).forEach((question, questionOffset) => {
    const questionBase = questionOffset * 90_000;
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
        label:
          eventType === "bad_posture"
            ? "자세 흔들림"
            : eventType === "fidget"
            ? "반복 움직임"
            : eventType === "leg_shaking" || eventType === "leg_movement"
            ? "다리 움직임"
            : "시선 이탈",
        severity: String(event.severity ?? "low") as AnalysisTimelineSegment["severity"],
        score: numberValue(event.confidence),
        metricType: eventMetricType(eventType),
        source: "vision_chunk",
      });
    });

    const content = question.contentAnalysis as
      | {
          star?: { score?: number };
          specificityScore?: number;
          evidenceScore?: number;
        }
      | undefined;
    const contentScore =
      numberValue(content?.star?.score) ??
      numberValue(content?.specificityScore) ??
      numberValue(content?.evidenceScore);

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
        t1: questionBase + 90_000,
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

function TimelineGraph({
  segments,
  questions,
  onSeek,
}: {
  segments: AnalysisTimelineSegment[];
  questions: InterviewReportQuestion[];
  onSeek: (timeMs: number) => void;
}) {
  const durationMs = Math.max(
    90_000,
    ...segments.map((segment) => segment.t1),
    questions.length * 90_000
  );

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="relative h-20 overflow-hidden rounded-md bg-white">
        {questions.map((question, index) => {
          const left = ((index * 90_000) / durationMs) * 100;
          const width = (90_000 / durationMs) * 100;
          return (
            <button
              key={`${question.answerTurnId ?? question.questionId ?? index}-question`}
              type="button"
              onClick={() => onSeek(index * 90_000)}
              className="absolute top-0 h-full border-r border-slate-200 bg-slate-100/70 px-2 text-left text-[11px] font-semibold text-slate-500 hover:bg-blue-50"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              Q{question.questionIndex ?? index + 1}
            </button>
          );
        })}
        {segments.map((segment) => {
          const left = Math.min(100, Math.max(0, (segment.t0 / durationMs) * 100));
          const width = Math.max(1.5, ((segment.t1 - segment.t0) / durationMs) * 100);
          return (
            <button
              key={segment.id}
              type="button"
              onClick={() => onSeek(segment.t0)}
              title={segment.label}
              className={`absolute bottom-3 h-4 rounded-full ${severityTone(
                segment.severity
              )} transition hover:scale-y-125`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-blue-100 px-2 py-1">낮은 리스크</span>
        <span className="rounded-full bg-amber-100 px-2 py-1">주의</span>
        <span className="rounded-full bg-rose-100 px-2 py-1">높은 리스크</span>
      </div>
    </div>
  );
}

function ResultContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("영상 저장 상태를 확인하고 있습니다.");
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
        setVideoStatus("영상 저장이 지연되고 있습니다. 잠시 후 다시 확인해주세요.");
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

  const seekVideo = (timeMs: number) => {
    const video = videoRef.current;
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

  const primaryWeakPattern = report.weakPatterns[0];
  const trendMetrics = Object.entries(report.comparison?.baseline?.metrics ?? {});

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <nav className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              홈
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/guideline">
              <RotateCcw className="h-4 w-4" />
              가이드 다시 보기
            </Link>
          </Button>
        </nav>

        <div className="mt-4">
          <CourseStageBanner
            current="풀세션 결과 분석"
            next="교정 드릴 3개 진행"
            progressLabel="리포트 확인"
          />
        </div>

        <header className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
            <section className="p-6 lg:p-8">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <ClipboardList className="h-4 w-4" />
                면접 분석 결과
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight lg:text-3xl">
                이번 면접에서 드러난 강점과 보완 목표입니다.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {report.summary}
              </p>
            </section>
            <aside className="border-t border-slate-200 bg-slate-950 p-6 text-white lg:border-l lg:border-t-0">
              <p className="text-sm font-medium text-slate-300">종합 점수</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-mono text-5xl font-semibold">
                  {report.totalScore}
                </span>
                <span className="pb-2 text-sm text-slate-400">/ 100</span>
              </div>
            </aside>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">풀세션 영상과 분석 타임라인</h2>
              {videoUrl ? (
                <video
                  ref={videoRef}
                  controls
                  src={videoUrl}
                  className="mt-4 aspect-video w-full rounded-lg bg-slate-950"
                />
              ) : (
                <div className="mt-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                  {videoStatus}
                </div>
              )}
              <TimelineGraph
                segments={timeline}
                questions={report.questions ?? []}
                onSeek={seekVideo}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">지표 진단</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    답변 내용, 직무 적합성, 전달 안정성, 비언어 리스크를 종합했습니다.
                  </p>
                </div>
                <LineChart className="h-5 w-5 text-blue-600" />
              </div>

              <div className="mt-5 space-y-3">
                {report.metrics.map((item) => (
                  <div key={`graph-${item.label}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="font-mono">{item.score}</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${scoreTone(item.score)}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {report.metrics.map((item) => (
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
                        className={`h-full rounded-full ${scoreTone(item.score)}`}
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

            {primaryWeakPattern ? (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold">추천 교정 목표</h2>
                </div>
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
                  <p className="text-sm font-semibold text-blue-700">
                    {primaryWeakPattern.target}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {primaryWeakPattern.title}
                  </h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold">판단 근거</p>
                      <div className="mt-2 space-y-2">
                        {primaryWeakPattern.evidence.map((item) => (
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
                      <p className="text-sm font-semibold">드릴 지시</p>
                      <div className="mt-2 space-y-2">
                        {report.recommendedPlan.drills.map((item) => (
                          <p
                            key={item.drillId}
                            className="rounded-lg bg-white px-3 py-2 text-sm leading-6 text-slate-700"
                          >
                            {item.instruction}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">추이 분석</h2>
              <div className="mt-4 space-y-3">
                {trendMetrics.length ? (
                  trendMetrics.map(([metric, value]) => (
                    <div
                      key={metric}
                      className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm md:grid-cols-[1fr_120px_120px_120px]"
                    >
                      <span className="font-medium">{metric}</span>
                      <span>현재 {value.current}</span>
                      <span>기준 {value.reference}</span>
                      <span
                        className={
                          value.delta <= 0 ? "text-emerald-700" : "text-rose-700"
                        }
                      >
                        {value.delta > 0 ? "+" : ""}
                        {value.delta}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    비교할 baseline 또는 이전 리포트가 아직 없습니다.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">추천 드릴 계획</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {report.recommendedPlan.drills.map((drill, index) => (
                  <article
                    key={drill.drillId}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-xs font-semibold text-blue-700">
                      Drill {index + 1}
                    </p>
                    <h3 className="mt-2 font-semibold">{drill.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {drill.question}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold">다음 단계</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                이번 리포트에서 나온 교정 목표를 기준으로 드릴을 시작합니다.
              </p>
              {drillHref ? (
                <Button asChild className="mt-5 w-full bg-blue-600 hover:bg-blue-700">
                  <Link href={drillHref}>
                    추천 드릴 시작
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              {report.recommendedPlan.courseId ? (
                <Button asChild variant="outline" className="mt-3 w-full">
                  <Link
                    href={`/final-report?courseId=${encodeURIComponent(
                      report.recommendedPlan.courseId
                    )}`}
                  >
                    최종 리포트 보기
                  </Link>
                </Button>
              ) : null}
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
