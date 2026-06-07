"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Camera from "@/components/Camera/Camera";
import {
  InterviewRuntimeProvider,
  useInterviewRuntime,
} from "@/components/runtime/InterviewRuntimeProvider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Maximize2, Square } from "lucide-react";

const totalQuestions = 13;
const PREP_SECONDS = 30;
const ANSWER_SECONDS = 90;
const RESULT_DELAY_MS = 1800;
const SILENCE_TRIGGER_MS = 5000;
const SILENCE_COUNTDOWN_SECONDS = 10;

type FlowState =
  | "starting"
  | "preparing"
  | "answering"
  | "submitting"
  | "completed";

const formatTime = (seconds: number) => {
  const minute = String(Math.floor(seconds / 60)).padStart(2, "0");
  const second = String(seconds % 60).padStart(2, "0");
  return `${minute}:${second}`;
};

function InterviewStage() {
  const router = useRouter();
  const didStartRef = useRef(false);
  const didNavigateToResultRef = useRef(false);
  const activeTurnRef = useRef<string | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const [flowState, setFlowState] = useState<FlowState>("starting");
  const [prepRemaining, setPrepRemaining] = useState(PREP_SECONDS);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [submitMessage, setSubmitMessage] = useState("답변을 정리하고 있습니다.");

  const {
    session,
    isSessionActive,
    currentQuestion,
    answerState,
    startSession,
    startAnswer,
    endAnswer,
  } = useInterviewRuntime();

  const waveformBars = useMemo(
    () =>
      Array.from({ length: 34 }).map(
        (_, index) =>
          7 + Math.abs(Math.sin(index * 0.72)) * 22 + (index % 6) * 1.2
      ),
    []
  );

  useEffect(() => {
    if (didStartRef.current) {
      return;
    }

    didStartRef.current = true;
    startSession().catch((error) => {
      console.warn("[interview-auto-start-failed]", error);
    });
  }, [startSession]);

  useEffect(() => {
    if (!session || session.status !== "active") {
      return;
    }

    const answerTurnId = session.answerTurnId ?? null;
    if (activeTurnRef.current === answerTurnId) {
      return;
    }

    activeTurnRef.current = answerTurnId;
    silenceStartedAtRef.current = null;
    setSilenceCountdown(null);
    setPrepRemaining(PREP_SECONDS);
    setSubmitMessage("답변을 정리하고 있습니다.");
    setFlowState("preparing");
  }, [session]);

  useEffect(() => {
    if (flowState !== "preparing" || !session || session.status !== "active") {
      return;
    }

    if (prepRemaining <= 0) {
      startAnswer();
      setFlowState("answering");
      return;
    }

    const timer = window.setTimeout(() => {
      setPrepRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [flowState, prepRemaining, session, startAnswer]);

  const submitCurrentAnswer = useCallback(
    (reason: "time_limit" | "manual" | "silence") => {
      if (!session || flowState === "submitting" || flowState === "completed") {
        return;
      }

      setFlowState("submitting");
      setSilenceCountdown(null);
      setSubmitMessage(
        reason === "silence"
          ? "침묵 시간이 길어 답변을 종료했습니다. 다음 질문을 준비하고 있습니다."
          : reason === "time_limit"
          ? "답변 시간이 종료되었습니다. 다음 질문을 준비하고 있습니다."
          : "답변을 종료했습니다. 다음 질문을 준비하고 있습니다."
      );

      void endAnswer(reason === "silence" ? "silence" : "button")
        .then(() => {
          const questionIndex = session.questionIndex ?? 1;
          const totalQuestionCount = session.totalQuestions ?? totalQuestions;

          if (questionIndex >= totalQuestionCount) {
            setSubmitMessage("면접 결과를 정리하고 있습니다.");
            setFlowState("completed");
            window.setTimeout(() => {
              if (didNavigateToResultRef.current) return;
              didNavigateToResultRef.current = true;
              router.replace(
                `/result?sessionId=${encodeURIComponent(session.sessionId)}`
              );
            }, RESULT_DELAY_MS);
          }
        })
        .catch((error) => {
          console.warn("[interview-submit-answer-failed]", error);
          setFlowState("answering");
        });
    },
    [endAnswer, flowState, router, session]
  );

  useEffect(() => {
    if (flowState !== "answering" || !answerState.isRecording) {
      return;
    }

    if ((answerState.elapsedSec ?? 0) >= ANSWER_SECONDS) {
      submitCurrentAnswer("time_limit");
    }
  }, [
    answerState.elapsedSec,
    answerState.isRecording,
    flowState,
    submitCurrentAnswer,
  ]);

  useEffect(() => {
    if (flowState !== "answering" || !answerState.isRecording) {
      silenceStartedAtRef.current = null;
      setSilenceCountdown(null);
      return;
    }

    const isSpeaking =
      (answerState.isSpeakingRatio ?? 1) >= 0.2 ||
      (answerState.rmsVolume ?? 0.02) >= 0.018;

    if (isSpeaking) {
      silenceStartedAtRef.current = null;
      setSilenceCountdown(null);
      return;
    }

    const now = performance.now();
    if (silenceStartedAtRef.current === null) {
      silenceStartedAtRef.current = now;
      setSilenceCountdown(null);
      return;
    }

    const silentMs = now - silenceStartedAtRef.current;
    if (silentMs < SILENCE_TRIGGER_MS) {
      setSilenceCountdown(null);
      return;
    }

    const elapsedCountdownSec = Math.floor(
      (silentMs - SILENCE_TRIGGER_MS) / 1000
    );
    const remaining = Math.max(
      0,
      SILENCE_COUNTDOWN_SECONDS - elapsedCountdownSec
    );
    setSilenceCountdown(remaining);

    if (remaining <= 0) {
      submitCurrentAnswer("silence");
    }
  }, [
    answerState.isRecording,
    answerState.isSpeakingRatio,
    answerState.rmsVolume,
    flowState,
    submitCurrentAnswer,
  ]);

  useEffect(() => {
    if (
      didNavigateToResultRef.current ||
      !session ||
      session.status !== "finished"
    ) {
      return;
    }

    setFlowState("completed");
    didNavigateToResultRef.current = true;
    window.setTimeout(() => {
      router.replace(`/result?sessionId=${encodeURIComponent(session.sessionId)}`);
    }, RESULT_DELAY_MS);
  }, [router, session]);

  const handleManualEnd = () => {
    if (flowState !== "answering" || !answerState.isRecording) {
      return;
    }

    submitCurrentAnswer("manual");
  };

  const questionIndex = session?.questionIndex ?? 1;
  const totalQuestionCount = session?.totalQuestions ?? totalQuestions;
  const remainingAnswerSec = Math.max(
    0,
    ANSWER_SECONDS - (answerState.elapsedSec ?? 0)
  );
  const statusText =
    flowState === "preparing"
      ? "준비 시간"
      : flowState === "answering"
      ? "남은 답변 시간"
      : flowState === "submitting"
      ? "분석 중"
      : flowState === "completed"
      ? "면접 종료"
      : "세션 준비";
  const timerText =
    flowState === "preparing"
      ? formatTime(prepRemaining)
      : flowState === "answering"
      ? formatTime(remainingAnswerSec)
      : statusText;

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-[#f7f8fb] p-0 text-slate-950">
      <section className="min-h-0 flex-1 overflow-hidden rounded-[26px] bg-slate-950">
        <div className="relative h-full min-h-0 overflow-hidden">
          <Image
            src="/images/ai-interviewer-room.png"
            alt="AI interviewer seated in an interview room"
            fill
            sizes="100vw"
            className="scale-105 object-cover object-center opacity-70 blur-xl"
          />
          <div className="absolute inset-0 bg-slate-950/22" />

          <div
            className="absolute left-1/2 top-1/2 overflow-hidden -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "min(100%, calc((100dvh - 40px) * 1.777))",
              height: "min(100%, calc((100dvw - 40px) / 1.777))",
            }}
          >
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
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isSessionActive ? "bg-blue-500" : "bg-slate-300"
                }`}
              />
              LIVE
            </div>

            <button
              type="button"
              aria-label="fullscreen"
              className="absolute right-[3.2%] top-[3.4%] z-20 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950/30 text-white shadow-lg backdrop-blur transition hover:bg-slate-950/45"
            >
              <Maximize2 className="h-5 w-5" />
            </button>

            <div className="absolute left-[4.8%] top-[40%] z-10 max-w-[37%] -translate-y-1/2 text-white">
              <p className="text-[clamp(18px,1.5vw,28px)] font-bold text-blue-300">
                질문 {questionIndex}/{totalQuestionCount}
              </p>
              <h1 className="mt-5 break-keep text-[clamp(42px,4.8vw,88px)] font-bold leading-[1.08] tracking-normal drop-shadow-md">
                {currentQuestion}
              </h1>
            </div>

            {(flowState === "submitting" || flowState === "completed") && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/54 text-white backdrop-blur-sm">
                <div className="max-w-lg rounded-2xl border border-white/15 bg-slate-950/72 px-8 py-7 text-center shadow-2xl">
                  {flowState === "completed" ? (
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
                  ) : (
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-300" />
                  )}
                  <h2 className="mt-4 text-2xl font-bold">
                    {flowState === "completed"
                      ? "면접이 종료되었습니다"
                      : "답변이 종료되었습니다"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-white/75">
                    {flowState === "completed"
                      ? "고생하셨습니다. 결과 리포트로 이동합니다."
                      : submitMessage}
                  </p>
                </div>
              </div>
            )}

            {flowState === "answering" && silenceCountdown !== null && (
              <div className="absolute left-1/2 top-[10%] z-30 w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-slate-950 shadow-2xl">
                <p className="text-sm font-semibold text-amber-700">
                  침묵 시간이 길어지고 있습니다
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {silenceCountdown}초 안에 답변이 이어지지 않으면 자동으로 종료됩니다.
                </p>
              </div>
            )}

            <div className="absolute bottom-[5.8%] left-1/2 z-20 flex w-[clamp(500px,46%,660px)] max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-4 rounded-[18px] border border-white/14 bg-[#111827]/88 px-4 py-3 text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)] backdrop-blur-sm">
              <div className="min-w-[126px]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/52">
                  {statusText}
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums leading-none text-white">
                  {timerText}
                </p>
              </div>

              <div className="flex h-9 flex-1 items-end justify-center gap-1 overflow-hidden rounded-full bg-white/[0.06] px-3 pb-1.5">
                {waveformBars.map((height, index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-sky-300"
                    style={{
                      height: `${Math.min(height, 24)}px`,
                      opacity:
                        flowState === "answering" && index % 4 !== 0
                          ? 0.92
                          : 0.32,
                    }}
                  />
                ))}
              </div>

              <Button
                type="button"
                onClick={handleManualEnd}
                disabled={flowState !== "answering" || !answerState.isRecording}
                className="h-10 min-w-[104px] rounded-xl bg-white px-4 text-sm font-bold text-slate-950 shadow-sm hover:bg-slate-100 disabled:bg-white/45 disabled:text-slate-500"
              >
                <Square className="h-3 w-3 fill-current text-current" />
                종료
              </Button>
            </div>

            <Camera />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <InterviewRuntimeProvider
      config={{
        sessionType: "full",
        questionSetId: "full_13",
        maxAnswerSec: ANSWER_SECONDS,
        totalQuestions,
      }}
    >
      <InterviewStage />
    </InterviewRuntimeProvider>
  );
}
