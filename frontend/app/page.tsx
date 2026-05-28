"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardList,
  History,
  Mic,
  Play,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const flowItems = [
  {
    icon: ClipboardList,
    title: "1. 기본 정보 확인",
    body: "지원 회사, 직무, 면접 유형을 기준으로 질문 흐름을 준비합니다.",
  },
  {
    icon: Camera,
    title: "2. 초기 베이스라인 측정",
    body: "시선, 자세, 손 움직임의 평소 상태를 잡아 면접 중 변화량을 비교합니다.",
  },
  {
    icon: Mic,
    title: "3. 실전 면접",
    body: "AI 면접관 질문에 답하며 음성 답변과 행동 신호를 함께 수집합니다.",
  },
  {
    icon: BarChart3,
    title: "4. 결과 리포트",
    body: "안정 구간, 약화 패턴, 교정 액션을 self-review 형태로 확인합니다.",
  },
];

const scoreItems = [
  ["시선 안정성", "정면 응시 시간과 이탈 빈도"],
  ["자세 유지", "상체 기울어짐과 무너짐 패턴"],
  ["손 움직임", "불필요한 손동작과 화면 진입 빈도"],
];

export default function HomePage() {
  const [hasBaseline, setHasBaseline] = useState(false);

  useEffect(() => {
    const baseline = localStorage.getItem("interviewiq-baseline");
    setHasBaseline(Boolean(baseline));
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76vh] max-w-7xl flex-col px-6 py-6">
          <nav className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              InterviewIQ
            </Link>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/result">최근 결과</Link>
              </Button>
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Link href={hasBaseline ? "/interview" : "/baseline"}>
                  {hasBaseline ? "면접 시작" : "시작하기"}
                </Link>
              </Button>
            </div>
          </nav>

          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_460px]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                <CheckCircle2 className="h-4 w-4" />
                전달 안정화 훈련
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal text-slate-950 md:text-6xl">
                답변 내용만이 아니라, 실전 전달 상태까지 점검합니다.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                InterviewIQ는 초기 베이스라인을 먼저 측정한 뒤 AI 면접관과의
                실전 흐름에서 시선, 자세, 손 움직임, 음성 답변 변화를 함께
                분석합니다.
              </p>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {hasBaseline ? (
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-emerald-600" />
                    기존 베이스라인이 있습니다. 바로 면접 세션을 시작할 수
                    있습니다.
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-blue-600" />
                    아직 베이스라인이 없습니다. 30초 워밍업 측정부터 시작하세요.
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Link href="/baseline">
                    베이스라인 측정
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/interview">
                    면접 화면 바로가기
                    <Play className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
              <div className="aspect-[4/3] rounded-md bg-[radial-gradient(circle_at_35%_25%,#2563eb_0,#0f172a_36%,#020617_100%)] p-5">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>LIVE ANALYSIS PREVIEW</span>
                  <span className="rounded-full bg-emerald-400/20 px-2 py-1 text-emerald-200">
                    Ready
                  </span>
                </div>
                <div className="mt-20 space-y-3">
                  {scoreItems.map(([title, body], index) => (
                    <div
                      key={title}
                      className="rounded-md border border-white/10 bg-white/10 p-3 backdrop-blur"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{title}</p>
                        <span className="font-mono text-sm text-blue-100">
                          {index === 0 ? "92" : index === 1 ? "85" : "78"}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        {body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-2 lg:grid-cols-4">
        {flowItems.map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.title}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <Icon className="h-5 w-5 text-blue-600" />
              <h2 className="mt-4 text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.body}
              </p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
