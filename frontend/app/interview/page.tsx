"use client";

import Image from "next/image";
import Link from "next/link";
import { SettingsProvider } from "@/lib/settings-provider";
import Camera from "@/components/Camera/Camera";
import { MetricsProvider } from "@/context/MetricsContext";
import {
  InterviewSessionProvider,
  useInterviewSession,
} from "@/context/InterviewSessionContext";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Square } from "lucide-react";

const fallbackQuestion = "자기소개를 부탁드립니다.";
const totalQuestions = 5;

function InterviewStage() {
  const {
    session,
    isCreatingSession,
    isFinishingAnswer,
    startSession,
    finishAnswer,
  } = useInterviewSession();

  const questionIndex = session?.questionIndex ?? 1;
  const questionTitle = session?.currentQuestion ?? fallbackQuestion;
  const progress = Math.min((questionIndex / totalQuestions) * 100, 100);
  const isSessionActive = session?.status === "active";

  const start = async () => {
    if (!session) {
      await startSession({ totalQuestions });
    }
  };

  const endAnswer = async () => {
    if (!session || isFinishingAnswer) {
      return;
    }

    await finishAnswer("button");
  };

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-[#f7f8fb] px-0 text-slate-950 flex flex-col">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link href="/" className="flex items-center gap-3 justify-self-start">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <MessageSquareText className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold">
            실전 면접 화면 (AI Interviewer)
          </span>
        </Link>

        <div className="min-w-[280px] text-center">
          <p className="text-base font-semibold text-slate-700">
            질문 {questionIndex}/{totalQuestions} · 자기소개
          </p>
          <div className="mx-auto mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="justify-self-end">
          <Button
            type="button"
            size="sm"
            onClick={start}
            disabled={isCreatingSession || Boolean(session)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {session ? "진행 중" : "세션 시작"}
          </Button>
        </div>
      </header>

      <section className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950 shadow-sm">
        <div className="relative h-full min-h-0 overflow-hidden">
          <Image
            src="/images/ai-interviewer-room.png"
            alt="AI interviewer seated in an interview room"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_top]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/58 via-black/16 to-black/8" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />

          <div className="absolute left-8 top-8 flex items-center gap-2 text-xl font-medium text-white">
            <span
              className={`h-3 w-3 rounded-full ${
                isSessionActive ? "bg-emerald-400" : "bg-slate-300"
              }`}
            />
            LIVE
          </div>

          <div className="absolute bottom-[18%] left-14 z-10 max-w-[clamp(360px,38vw,680px)] text-white">
            <p className="text-2xl font-semibold text-blue-300">질문</p>
            <h1 className="mt-4 break-keep text-[clamp(44px,5vw,82px)] font-bold leading-[1.08] tracking-[-0.03em] drop-shadow-md">
              {questionTitle}
            </h1>
          </div>

          <div className="absolute bottom-32 left-1/2 z-10 flex w-[min(520px,70vw)] -translate-x-1/2 items-end justify-center gap-1 md:w-[min(520px,40vw)]">
            {Array.from({ length: 56 }).map((_, index) => {
              const height =
                8 + Math.abs(Math.sin(index * 0.72)) * 28 + (index % 7) * 2;

              return (
                <span
                  key={index}
                  className="w-1 rounded-full bg-blue-400/90"
                  style={{
                    height: `${height}px`,
                    opacity: index % 4 === 0 ? 0.55 : 1,
                  }}
                />
              );
            })}
          </div>

          <div className="absolute bottom-6 left-1/2 z-20 flex w-[min(520px,86vw)] -translate-x-1/2 flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/90 px-5 py-4 shadow-lg backdrop-blur md:w-[min(520px,42vw)]">
            <p className="text-lg font-semibold text-slate-950">
              {isSessionActive ? "답변 중..." : "답변 대기"}
              <span className="ml-2 text-sm font-normal text-slate-500">
                (최대 90초)
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={endAnswer}
              disabled={!session || isFinishingAnswer}
              className="h-12 w-full rounded-lg border-slate-300 bg-white text-base font-semibold text-blue-700 hover:bg-slate-50"
            >
              <Square className="h-4 w-4 fill-slate-900 text-slate-900" />
              {isFinishingAnswer ? "답변 종료 중" : "답변 종료"}
            </Button>
          </div>

          <Camera />
        </div>
      </section>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <SettingsProvider>
      <MetricsProvider>
        <InterviewSessionProvider>
          <InterviewStage />
        </InterviewSessionProvider>
      </MetricsProvider>
    </SettingsProvider>
  );
}
