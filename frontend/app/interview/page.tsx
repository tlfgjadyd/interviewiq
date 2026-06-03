"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import Camera from "@/components/Camera/Camera";
import {
  InterviewRuntimeProvider,
  useInterviewRuntime,
} from "@/components/runtime/InterviewRuntimeProvider";
import { Button } from "@/components/ui/button";
import { Maximize2, Square } from "lucide-react";

const totalQuestions = 13;

function InterviewStage() {
  const router = useRouter();
  const didAutoStartRef = useRef(false);
  const didNavigateToResultRef = useRef(false);
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
      Array.from({ length: 44 }).map(
        (_, index) =>
          8 + Math.abs(Math.sin(index * 0.72)) * 24 + (index % 6) * 1.5
      ),
    []
  );

  useEffect(() => {
    if (didAutoStartRef.current || session) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("autoStart") !== "1") {
      return;
    }

    didAutoStartRef.current = true;
    startSession();
  }, [session, startSession]);

  useEffect(() => {
    if (
      didNavigateToResultRef.current ||
      !session ||
      session.status !== "finished"
    ) {
      return;
    }

    didNavigateToResultRef.current = true;
    router.replace(`/result?sessionId=${encodeURIComponent(session.sessionId)}`);
  }, [router, session]);

  const handleAnswerButton = async () => {
    if (!session) {
      return;
    }

    if (answerState.isRecording) {
      await endAnswer();
      return;
    }

    startAnswer();
  };

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
                질문
              </p>
              <h1 className="mt-5 break-keep text-[clamp(42px,4.8vw,88px)] font-bold leading-[1.08] tracking-normal drop-shadow-md">
                {currentQuestion}
              </h1>
            </div>

            <div className="absolute bottom-[5.8%] left-1/2 z-20 flex w-[clamp(520px,50%,700px)] max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-5 rounded-2xl border border-white/18 bg-slate-950/34 px-5 py-3 text-white shadow-2xl shadow-black/20 backdrop-blur-md">
              <div className="min-w-[145px]">
                <p className="text-base font-bold">
                  {answerState.isRecording ? "답변 중" : "답변 대기"}
                  <span className="ml-2 text-sm font-medium text-white/65">
                    최대 {answerState.maxAnswerSec}초
                  </span>
                </p>
              </div>

              <div className="flex h-10 flex-1 items-end justify-center gap-1 overflow-hidden">
                {waveformBars.map((height, index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-blue-400"
                    style={{
                      height: `${Math.min(height, 30)}px`,
                      opacity: index % 4 === 0 ? 0.55 : 1,
                    }}
                  />
                ))}
              </div>

              <Button
                type="button"
                onClick={handleAnswerButton}
                disabled={!session}
                className="h-11 min-w-[124px] rounded-xl bg-blue-600 px-5 text-base font-bold text-white hover:bg-blue-700 disabled:bg-blue-500/70"
              >
                <Square className="h-3.5 w-3.5 fill-white text-white" />
                {answerState.isRecording ? "답변 종료" : "답변 시작"}
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
        maxAnswerSec: 90,
        totalQuestions,
      }}
    >
      <InterviewStage />
    </InterviewRuntimeProvider>
  );
}
