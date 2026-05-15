"use client";

import { SettingsProvider } from "@/lib/settings-provider";
import { RealtimeAudio } from "@/components/screenpipe/realtime-audio";
import Camera from "@/components/Camera/Camera";
import { MetricsProvider } from "@/context/MetricsContext";
import {
  InterviewSessionProvider,
  useInterviewSession,
} from "@/context/InterviewSessionContext";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  FileText,
  HelpCircle,
  Home,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";

const navItems = [Home, BarChart3, MessageSquare, FileText];

const statusBadgeClass = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  slate: "bg-slate-100 text-slate-500",
};
type StatusTone = keyof typeof statusBadgeClass;

function InterviewWorkspace() {
  const {
    session,
    latestVision,
    isCreatingSession,
    isFinishingSession,
    error,
    startSession,
    finishSession,
  } = useInterviewSession();
  const questionHistory = session?.questionHistory ?? [];
  const activeQuestionIndex = session?.questionIndex ?? 0;
  const questionItems = questionHistory.map((question, index) => ({
    id: `Q${index + 1}`,
    label: index === 0 ? "첫 질문" : "꼬리 질문",
    question,
    status: index < activeQuestionIndex ? "완료" : "현재",
    tone: (index < activeQuestionIndex ? "green" : "blue") as StatusTone,
  }));

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <div className="grid min-h-screen grid-cols-[76px_minmax(210px,260px)_minmax(520px,1fr)_minmax(320px,430px)] overflow-hidden max-xl:grid-cols-[72px_220px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex flex-col items-center justify-between border-r border-slate-200 bg-white py-6 max-lg:hidden">
          <div className="flex flex-col items-center gap-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <nav className="flex flex-col gap-7 text-slate-500">
              {navItems.map((Icon, index) => (
                <button
                  key={index}
                  type="button"
                  className="rounded-lg p-1.5 transition hover:bg-slate-100 hover:text-blue-600"
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-center gap-7 text-slate-500">
            <Settings className="h-5 w-5" />
            <HelpCircle className="h-5 w-5" />
            <div className="h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-slate-200 to-slate-300 ring-2 ring-white" />
          </div>
        </aside>

        <aside className="border-r border-slate-200 bg-white px-6 py-7 max-lg:hidden">
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">
            질문 목록
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            진행된 질문이 답변 흐름에 맞춰 자동으로 쌓입니다.
          </p>
          <div className="mt-6 divide-y divide-slate-100">
            {questionItems.length === 0 && (
              <div className="-mx-6 px-6 py-5 text-sm leading-6 text-slate-500">
                세션을 시작하면 Q1이 생성됩니다.
              </div>
            )}
            {questionItems.map((item) => (
              <div
                key={item.id}
                className={`relative -mx-6 px-6 py-5 ${
                  item.status === "현재"
                    ? "bg-blue-50/70 text-blue-700"
                    : ""
                }`}
              >
                {item.status === "현재" && (
                  <span className="absolute left-0 top-4 h-[calc(100%-2rem)] w-1 rounded-r bg-blue-600" />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.id}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.label}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      statusBadgeClass[item.tone]
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-800">
                  {item.question}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto px-5 py-5 lg:px-6">
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">InterviewIQ Mock Interview</h1>
              <p className="mt-1 truncate text-xs text-slate-500">
                {session
                  ? `Q${activeQuestionIndex + 1} 진행 중 / sessionId=${session.sessionId}`
                  : "Start Session 이후 음성, 시선, 자세 신호를 수집합니다."}
              </p>
              {latestVision && (
                <p className="mt-1 text-xs text-slate-500">
                  latest vision score={latestVision.behaviorRiskScore} / level=
                  {latestVision.level}
                </p>
              )}
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => startSession()}
                disabled={isCreatingSession}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {session ? "Restart Session" : "Start Session"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => finishSession()}
                disabled={
                  !session ||
                  session.status === "finished" ||
                  isFinishingSession
                }
              >
                {isFinishingSession ? "Ending..." : "End Interview"}
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            <RealtimeAudio />
            <Camera />
          </div>
        </main>

        <aside className="space-y-4 overflow-y-auto border-l border-slate-200 bg-white px-6 py-5 max-xl:col-span-3 max-xl:grid max-xl:grid-cols-3 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1 max-lg:grid-cols-1">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">질문 의도</h2>
            <p className="mt-5 text-sm leading-7 text-slate-700">
              지원자의 핵심 성과를 구체적인 수치와 사례를 통해 검증하고,
              본인의 기여도와 문제 해결 역량을 확인하기 위한 질문입니다.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">약화 패턴 분석</h2>
            <p className="mt-5 font-semibold text-slate-800">
              성과 검증 구간에서 신뢰도가 급감했습니다.
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              {[
                ["추가 질문 이후 성과 수치 설명 급감", "실무 신뢰도 저하"],
                ["본인 역할 설명 지연", "팀 성과 의존 인상"],
                ["말속도 증가 + 시선 회피 동시 발생", "불안 신호 감지"],
              ].map(([title, body], index) => (
                <div key={title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p>
                    {title}
                    <br />
                    <span className="text-slate-500">→ {body}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 border-l-red-500 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">면접관 리스크 판단</h2>
            <p className="mt-5 text-sm leading-7 text-slate-700">
              직접 성과보다 팀 성과에 참여한 경험으로 읽힐 가능성이
              높습니다.
            </p>
            <span className="mt-4 inline-flex rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              신뢰도 저하 가능성: 높음
            </span>
          </section>

          <section className="rounded-lg border border-slate-200 border-l-blue-600 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">교정 전략</h2>
            <p className="mt-5 text-sm leading-7 text-slate-700">
              성과 수치 → 본인 기여 → 실행 기준 → 결과 순서로
              재구성하세요.
            </p>
            <button className="mt-5 text-sm font-semibold text-blue-600">
              교정 예시 보기 →
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsProvider>
      <MetricsProvider>
        <InterviewSessionProvider>
          <InterviewWorkspace />
        </InterviewSessionProvider>
      </MetricsProvider>
    </SettingsProvider>
  );
}
