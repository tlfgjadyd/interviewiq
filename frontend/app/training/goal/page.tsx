"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { drillPlan, recommendedGoal } from "@/lib/training";

const STORAGE_KEY = "interviewiq-training-plan";

type StoredTrainingPlan = {
  goalId: string;
  acceptedAt: string;
  completedDrills: number[];
};

export default function TrainingGoalPage() {
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      setIsSaved(true);
    }
  }, []);

  const acceptGoal = () => {
    const plan: StoredTrainingPlan = {
      goalId: recommendedGoal.id,
      acceptedAt: new Date().toISOString(),
      completedDrills: [],
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    setIsSaved(true);
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <nav className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/result">
              <ArrowLeft className="h-4 w-4" />
              결과로 돌아가기
            </Link>
          </Button>
          <div className="text-sm font-medium text-slate-500">Loop 1</div>
        </nav>

        <header className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Target className="h-4 w-4" />
            목표 설정
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
            <div>
              <h1 className="text-2xl font-semibold leading-tight lg:text-3xl">
                이번 루프에서는 하나의 약점만 끝까지 잡습니다.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                드릴 3회는 모두 같은 목표를 다른 난이도로 반복합니다. 목표가
                좁을수록 중간 풀세션에서 개선 여부를 명확히 확인할 수 있습니다.
              </p>
            </div>
            <div className="rounded-lg bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">목표 점수</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-3xl">
                  {recommendedGoal.baselineScore}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <span className="font-mono text-3xl text-blue-300">
                  {recommendedGoal.targetScore}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-5">
              <p className="text-sm font-semibold text-blue-700">
                추천 목표
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {recommendedGoal.title}
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-white p-4">
                  <h3 className="font-semibold">왜 이 목표인가</h3>
                  <div className="mt-3 space-y-2">
                    {recommendedGoal.evidence.map((item) => (
                      <p key={item} className="text-sm leading-6 text-slate-600">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4">
                  <h3 className="font-semibold">통과 기준</h3>
                  <div className="mt-3 space-y-2">
                    {recommendedGoal.successCriteria.map((item) => (
                      <p
                        key={item}
                        className="flex gap-2 text-sm leading-6 text-slate-600"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">생성될 드릴</h2>
              </div>
              <div className="mt-4 space-y-3">
                {drillPlan.map((drill) => (
                  <article
                    key={drill.id}
                    className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[120px_1fr_90px]"
                  >
                    <div>
                      <p className="text-xs font-semibold text-blue-700">
                        Drill {drill.drillIndex}
                      </p>
                      <p className="mt-1 text-sm font-medium">{drill.title}</p>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">
                      {drill.question}
                    </p>
                    <p className="text-sm font-medium text-slate-500 md:text-right">
                      {drill.durationMinutes}분
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold">목표 확정</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                확정하면 로컬에 드릴 진행 상태가 저장됩니다. 백엔드의
                training plan API가 붙으면 같은 위치를 서버 저장으로 교체하면
                됩니다.
              </p>

              <Button
                type="button"
                onClick={acceptGoal}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700"
              >
                {isSaved ? "목표 확정됨" : "추천 목표 확정"}
              </Button>

              <Button
                asChild
                variant={isSaved ? "default" : "outline"}
                className={
                  isSaved
                    ? "mt-3 w-full bg-slate-950 hover:bg-slate-800"
                    : "mt-3 w-full"
                }
              >
                <Link href="/training/drill/1">
                  Drill 1 시작
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
