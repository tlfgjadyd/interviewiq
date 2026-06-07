"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Maximize2,
  Play,
  RotateCcw,
  Square,
  Target,
} from "lucide-react";
import { BaselineFrameGuide } from "@/components/baseline/BaselineFrameGuide";
import Camera from "@/components/Camera/Camera";
import { useInterviewRuntime } from "@/components/runtime/InterviewRuntimeProvider";
import { Button } from "@/components/ui/button";
import type { DrillPlan, DrillSessionResult } from "@/lib/runtime-types";
import { drillPlan, type Drill } from "@/lib/training";

const COMPLETION_STORAGE_KEY = "interviewiq-training-plan";
const COUNTDOWN_SECONDS = 10;

type StoredTrainingPlan = {
  goalId: string;
  acceptedAt: string;
  completedDrills: number[];
};

type DrillMode = "ready" | "countdown" | "answering" | "miniCheck";

const completionStorageKey = (planId?: string) =>
  planId ? `${COMPLETION_STORAGE_KEY}:${planId}` : COMPLETION_STORAGE_KEY;

const readCompletionFallback = (planId?: string): StoredTrainingPlan => {
  const fallback = {
    goalId: "goal_structure_specificity",
    acceptedAt: new Date().toISOString(),
    completedDrills: [],
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = localStorage.getItem(completionStorageKey(planId));
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as StoredTrainingPlan;
  } catch {
    return fallback;
  }
};

export const DrillPlayer = ({
  drill,
  plan,
  planId,
  step,
}: {
  drill: Drill;
  plan?: DrillPlan;
  planId?: string;
  step?: number;
}) => {
  const {
    session,
    currentQuestion,
    answerState,
    drillResults,
    currentRunNo,
    startSession,
    startAnswer,
    endAnswer,
  } = useInterviewRuntime();
  const [mode, setMode] = useState<DrillMode>("ready");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [completedDrills, setCompletedDrills] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<DrillSessionResult | null>(null);

  const currentStep = step ?? drill.drillIndex - 1;
  const planLength = Math.max(1, plan?.drills?.length ?? drillPlan.length);
  const nextStep = currentStep + 1 < planLength ? currentStep + 1 : null;
  const nextLegacyDrill =
    drill.drillIndex < drillPlan.length ? drill.drillIndex + 1 : null;
  const progress = Math.round(((currentStep + 1) / planLength) * 100);
  const latestResult = lastResult ?? drillResults[drillResults.length - 1];
  const previousResult = drillResults[drillResults.length - 2];
  const questionText = currentQuestion || drill.question;
  const remainingSec = Math.max(
    0,
    answerState.maxAnswerSec - answerState.elapsedSec
  );

  const formattedRemainingTime = useMemo(() => {
    const minute = String(Math.floor(remainingSec / 60)).padStart(2, "0");
    const second = String(remainingSec % 60).padStart(2, "0");
    return `${minute}:${second}`;
  }, [remainingSec]);

  useEffect(() => {
    const plan = readCompletionFallback(planId);
    setCompletedDrills(plan.completedDrills);
  }, [planId]);

  const beginCountdown = useCallback(async () => {
    if (!session || session.status === "finished") {
      await startSession();
    }

    setCountdown(COUNTDOWN_SECONDS);
    setMode("countdown");
  }, [session, startSession]);

  const finishAnswering = useCallback(async () => {
    if (!answerState.isRecording) {
      return;
    }

    const result = await endAnswer();
    if (result) {
      setLastResult(result);
    }
    setMode("miniCheck");
  }, [answerState.isRecording, endAnswer]);

  useEffect(() => {
    if (mode !== "countdown") {
      return;
    }

    if (countdown <= 0) {
      startAnswer();
      setMode("answering");
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, mode, startAnswer]);

  useEffect(() => {
    if (mode !== "answering") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();
      void finishAnswering();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishAnswering, mode]);

  useEffect(() => {
    if (mode === "answering" && remainingSec <= 0 && answerState.isRecording) {
      void finishAnswering();
    }
  }, [answerState.isRecording, finishAnswering, mode, remainingSec]);

  const toggleChecklist = (item: string) => {
    setCheckedItems((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  };

  const completeDrill = () => {
    const plan = readCompletionFallback(planId);
    const updated = Array.from(
      new Set([...plan.completedDrills, drill.drillIndex])
    ).sort((a, b) => a - b);
    const nextPlan = {
      ...plan,
      completedDrills: updated,
    };

    localStorage.setItem(completionStorageKey(planId), JSON.stringify(nextPlan));
    setCompletedDrills(updated);
  };

  const nextHref =
    planId && nextStep !== null
      ? `/training/drill?planId=${encodeURIComponent(planId)}&step=${nextStep}`
      : nextLegacyDrill
      ? `/training/drill/${nextLegacyDrill}`
      : "/interview?autoStart=1";

  const isCompleted = completedDrills.includes(drill.drillIndex);

  if (mode === "countdown") {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="relative h-[100dvh] p-5 lg:p-8">
          <div className="relative h-full overflow-hidden rounded-lg border border-white/15 bg-slate-950">
            <Camera mode="stage" showHeader={false} showStatus={false} />
            <div className="absolute inset-0 z-20 bg-black/20">
              <BaselineFrameGuide />
            </div>
          </div>
          <div className="absolute left-8 top-8 z-30 max-w-xl rounded-lg bg-slate-950/70 px-5 py-4 backdrop-blur">
            <p className="text-lg font-semibold text-emerald-200">
              기준선에 맞춰 앉아주세요
            </p>
            <p className="mt-2 text-sm text-white/75">
              얼굴, 상체, 무릎이 baseline 가이드 안에 들어오면 됩니다.
            </p>
          </div>
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <div className="text-center">
              <p className="text-8xl font-semibold tabular-nums lg:text-[11rem]">
                {countdown}
              </p>
              <p className="mt-4 text-2xl font-semibold text-white/85">
                자세를 맞추세요
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (mode === "answering") {
    return (
      <main className="flex h-[100dvh] overflow-hidden bg-[#f7f8fb] p-5 text-slate-950">
        <section className="min-h-0 flex-1 overflow-hidden rounded-[26px] border border-slate-200 bg-slate-950 shadow-xl shadow-slate-200">
          <div className="relative h-full min-h-0 overflow-hidden">
            <Image
              src="/images/ai-interviewer-room.png"
              alt="AI interviewer seated in an interview room"
              fill
              sizes="100vw"
              className="scale-105 object-cover object-center opacity-70 blur-xl"
            />
            <div className="absolute inset-0 bg-slate-950/22" />

            <div className="absolute inset-0 overflow-hidden">
              <Image
                src="/images/ai-interviewer-room.png"
                alt="AI interviewer seated in an interview room"
                fill
                priority
                sizes="100vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/64 via-black/18 to-black/4" />
              <div className="absolute inset-x-0 bottom-0 h-[44%] bg-gradient-to-t from-black/58 via-black/22 to-transparent" />

              <div className="absolute left-[3.2%] top-[3.4%] z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/38 px-4 py-3 text-base font-bold text-white shadow-lg backdrop-blur">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                LIVE
              </div>


              <div className="absolute left-[4.8%] top-[43%] z-10 max-w-[36%] -translate-y-1/2 text-white">
                <p className="text-[clamp(18px,1.5vw,28px)] font-bold text-blue-300">
                  드릴 질문
                </p>
                <h1 className="mt-4 break-keep text-[clamp(30px,3.35vw,60px)] font-bold leading-[1.12] tracking-normal drop-shadow-md">
                  {questionText}
                </h1>
                <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/14 bg-slate-950/36 px-4 py-3 text-[clamp(14px,1vw,18px)] font-bold text-emerald-100 backdrop-blur">
                  <Target className="h-5 w-5 shrink-0" />
                  <span className="truncate">{drill.focus}</span>
                </div>
              </div>

              <div className="absolute bottom-[5.8%] left-[4.8%] z-20 flex w-[clamp(560px,48%,760px)] max-w-[calc(100%-32px)] items-center gap-5 rounded-2xl border border-white/18 bg-slate-950/34 px-5 py-3 text-white shadow-2xl shadow-black/20 backdrop-blur-md">
                <div className="min-w-[164px]">
                  <p className="text-base font-bold">답변 중</p>
                  <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
                    {formattedRemainingTime}
                  </p>
                </div>

                <div className="flex h-10 flex-1 items-end justify-center gap-1 overflow-hidden">
                  {Array.from({ length: 44 }).map((_, index) => (
                    <span
                      key={index}
                      className="w-1 rounded-full bg-blue-400"
                      style={{
                        height: `${Math.min(
                          8 +
                            Math.abs(
                              Math.sin(index * 0.72 + answerState.elapsedSec)
                            ) *
                              24 +
                            (index % 6) * 1.5,
                          30
                        )}px`,
                        opacity: index % 4 === 0 ? 0.55 : 1,
                      }}
                    />
                  ))}
                </div>

                <div className="hidden min-w-[148px] text-sm font-bold text-white/82 md:block">
                  Space 키로 종료
                </div>

                <Button
                  type="button"
                  onClick={finishAnswering}
                  className="h-11 min-w-[124px] rounded-xl bg-blue-600 px-5 text-base font-bold text-white hover:bg-blue-700"
                >
                  <Square className="h-3.5 w-3.5 fill-white text-white" />
                  답변 종료
                </Button>
              </div>

              <div className="absolute bottom-[18%] left-[4.8%] z-20 flex max-w-[36%] flex-wrap gap-2 text-sm font-bold text-white">
                <DetectionPill label="얼굴" state="정상" />
                <DetectionPill label="손" state="정상" />
                <DetectionPill label="무릎" state="정상" />
              </div>

              <Camera pipSize="large" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (mode === "miniCheck") {
    return (
      <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-8">
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Drill session {latestResult?.runNo ?? currentRunNo - 1}
                </div>
                <h1 className="mt-3 text-3xl font-semibold">
                  {latestResult?.passed ? "이번 목표 통과" : "한 번 더 다듬기"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  답변 중에는 큰 수행 화면만 보여주고, 세부 피드백은 이 단계에서
                  확인합니다.
                </p>
              </div>
              <div
                className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                  latestResult?.passed
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {latestResult?.passed ? "PASS" : "RETRY"}
              </div>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <MiniCheckCard
                title="개선된 지표"
                body={describeMetricChange(previousResult, latestResult)}
              />
              <MiniCheckCard
                title="아직 부족한 지점"
                body={drill.feedbackTemplate[0] ?? drill.passCriteria.metric}
              />
              <MiniCheckCard title="다음 시도 목표" body={drill.instruction} />
              <MiniCheckCard
                title="드릴 세션 비교"
                body={`이전 ${formatMetric(previousResult)} -> 이번 ${formatMetric(
                  latestResult
                )}`}
              />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={beginCountdown}
                className="bg-slate-950 hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                새 드릴 세션으로 다시
              </Button>
              <Button asChild className="bg-blue-600 hover:bg-blue-700">
                <Link href={nextHref} onClick={completeDrill}>
                  {nextStep !== null || nextLegacyDrill
                    ? "다음 드릴 세션 시작"
                    : "재검증 풀세션으로"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <nav className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/training/goal">
              <ArrowLeft className="h-4 w-4" />
              목표 설정
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Clock3 className="h-4 w-4" />
            Drill {currentStep + 1} / {planLength}
          </div>
        </nav>

        <header className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Target className="h-4 w-4" />
                Loop {plan?.drillSet?.loopIndex ?? 1} · Drill {currentStep + 1} of {planLength}
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-tight lg:text-3xl">
                {drill.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {drill.focus} · target: {drill.target}
              </p>
            </div>
            <div className="min-w-[260px]">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>진행률</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-blue-700">질문</p>
              <h2 className="mt-3 text-3xl font-semibold leading-snug">
                {questionText}
              </h2>
              <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">
                  답변 목표
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {drill.instruction}
                </p>
              </div>
              <Button
                type="button"
                onClick={beginCountdown}
                className="mt-6 bg-blue-600 hover:bg-blue-700"
              >
                <Play className="h-4 w-4" />
                준비하고 시작
              </Button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">자가 체크리스트</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {drill.checklist.map((item) => {
                  const checked = checkedItems.includes(item);

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleChecklist(item)}
                      className={`min-h-[112px] rounded-lg border p-4 text-left text-sm leading-6 transition ${
                        checked
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mb-3 flex h-7 w-7 items-center justify-center rounded-md ${
                          checked
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                      {item}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">평가 기준</h2>
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm leading-6 text-slate-700">
                {drill.passCriteria.metric} {drill.passCriteria.operator}{" "}
                {drill.passCriteria.threshold}
              </div>
              <div className="mt-4 space-y-3">
                {drill.feedbackTemplate.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3"
                  >
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">진행 상태</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MetricBox label="session" value={session?.status ?? "idle"} />
                <MetricBox label="drill session" value={String(currentRunNo)} />
              </div>
              <Button
                type="button"
                onClick={completeDrill}
                variant="outline"
                className="mt-5 w-full"
              >
                {isCompleted ? "완료됨" : "완료 표시"}
              </Button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
};

const DetectionPill = ({ label, state }: { label: string; state: string }) => (
  <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-emerald-100 backdrop-blur">
    {label} {state}
  </div>
);

const MiniCheckCard = ({ title, body }: { title: string; body: string }) => (
  <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
    <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
    <p className="mt-3 text-base font-semibold leading-7 text-slate-900">
      {body}
    </p>
  </section>
);

const MetricBox = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-slate-500">{label}</p>
    <p className="mt-1 font-mono font-semibold">{value}</p>
  </div>
);

const describeMetricChange = (
  previousResult?: DrillSessionResult,
  latestResult?: DrillSessionResult | null
) => {
  if (!latestResult) {
    return "이번 시도 결과를 불러오는 중입니다.";
  }

  const previous = getPrimaryMetric(previousResult);
  const latest = getPrimaryMetric(latestResult);

  if (previous === undefined || latest === undefined) {
    return `${latestResult.runNo}번째 드릴 세션 리포트가 저장되었습니다.`;
  }

  const delta = latest - previous;
  return `${previous}에서 ${latest}로 ${delta >= 0 ? "+" : ""}${delta} 변화`;
};

const formatMetric = (result?: DrillSessionResult | null) => {
  const value = getPrimaryMetric(result);
  return value === undefined ? "-" : String(value);
};

const getPrimaryMetric = (result?: DrillSessionResult | null) =>
  result?.metrics?.content.structureScore ??
  result?.metrics?.content.specificityScore ??
  result?.metrics?.audio.fillerCount;
