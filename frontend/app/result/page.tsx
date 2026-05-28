"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  Hand,
  PlayCircle,
  RotateCcw,
  Target,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type BaselineRecord = {
  createdAt?: string;
  durationSeconds?: number;
  status?: string;
  baseline_gaze?: unknown;
  baseline_posture?: unknown;
  baseline_hand?: unknown;
  baseline_motion?: unknown;
};

const scoreRows = [
  {
    icon: Eye,
    label: "시선 안정성",
    score: 88,
    delta: "+6%",
    comment: "압박 질문 직후 짧은 이탈이 있었지만 빠르게 정면 응시로 회복했습니다.",
  },
  {
    icon: UserRoundCheck,
    label: "자세 유지",
    score: 81,
    delta: "-9%",
    comment: "답변 후반부에 상체가 앞으로 기울어지는 패턴이 반복되었습니다.",
  },
  {
    icon: Hand,
    label: "손 움직임",
    score: 74,
    delta: "-14%",
    comment: "성과 설명 구간에서 손 움직임 빈도가 베이스라인보다 높아졌습니다.",
  },
];

const weakPatterns = [
  "압박 질문 이후 filler 증가와 답변 속도 상승",
  "성과 수치 설명 직전 gaze break burst 발생",
  "긴 답변 후반 posture collapse 반복",
];

const correctionActions = [
  "성과 → 본인 역할 → 결과 순서로 첫 문장을 재정렬",
  "꼬리질문을 받으면 1초 멈춘 뒤 핵심 단어부터 답변",
  "답변 후반에는 손을 책상 위에 고정하고 문장 길이를 줄이기",
];

export default function ResultPage() {
  const [baseline, setBaseline] = useState<BaselineRecord | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("interviewiq-baseline");
    if (!raw) {
      return;
    }

    try {
      setBaseline(JSON.parse(raw) as BaselineRecord);
    } catch {
      setBaseline(null);
    }
  }, []);

  const totalScore = Math.round(
    scoreRows.reduce((sum, item) => sum + item.score, 0) / scoreRows.length
  );

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <nav className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              홈
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/baseline">
              <RotateCcw className="h-4 w-4" />
              다시 측정
            </Link>
          </Button>
        </nav>

        <header className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <BarChart3 className="h-4 w-4" />
                분석 결과
              </div>
              <h1 className="mt-2 text-2xl font-semibold">
                평가가 아니라, 전달 상태 리뷰입니다.
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                언제 안정적이었는지, 어디서 흔들렸는지, 어떻게 회복하면 되는지
                베이스라인 기준으로 정리했습니다.
              </p>
            </div>
            <div className="rounded-lg bg-slate-950 px-6 py-5 text-white">
              <p className="text-xs font-medium text-slate-300">종합 안정도</p>
              <p className="mt-1 font-mono text-4xl font-semibold">
                {totalScore}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {scoreRows.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.label}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">{item.label}</h2>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            baseline 대비 {item.delta}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {item.comment}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xl font-semibold">
                      {item.score}
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </article>
              );
            })}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <h2 className="font-semibold">행동 패턴 분석</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {weakPatterns.map((pattern) => (
                  <p key={pattern} className="rounded-lg bg-slate-50 p-3">
                    {pattern}
                  </p>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">베이스라인 연결</h2>
              <div className="mt-4 flex gap-3 rounded-lg bg-slate-50 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-sm leading-6 text-slate-700">
                  {baseline?.status === "completed" ? (
                    <>
                      <p>초기 측정 완료</p>
                      <p className="text-slate-500">
                        {baseline.createdAt
                          ? new Date(baseline.createdAt).toLocaleString()
                          : "측정 시간이 저장되지 않았습니다."}
                      </p>
                    </>
                  ) : (
                    <p>
                      저장된 베이스라인이 없습니다. 정확한 비교를 위해 먼저
                      초기 측정을 진행하세요.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold">안정 구간 replay</h2>
              </div>
              <div className="mt-4 rounded-lg bg-slate-950 p-4 text-white">
                <p className="text-sm font-medium">Q3 경험 설명 00:42-01:08</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">
                  시선 유지와 말속도가 가장 안정적이었던 구간입니다. 이 구간의
                  문장 길이와 호흡을 다음 답변의 기준으로 사용하세요.
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">교정 액션</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {correctionActions.map((action) => (
                  <p key={action}>{action}</p>
                ))}
              </div>
            </section>

            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
              <Link href="/baseline">drill 다시 시작</Link>
            </Button>
          </aside>
        </section>
      </div>
    </main>
  );
}
