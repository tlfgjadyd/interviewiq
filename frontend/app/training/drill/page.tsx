"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { InterviewRuntimeProvider } from "@/components/runtime/InterviewRuntimeProvider";
import { DrillPlayer } from "@/components/training/DrillPlayer";
import { getDrillFromPlan } from "@/lib/training";
import { loadDrillPlan } from "@/lib/session-api";

function DrillPlanContent() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const step = Number(searchParams.get("step") ?? "0");
  const plan = loadDrillPlan(planId);
  const safeStep = Number.isInteger(step) ? step : 0;
  const drill = getDrillFromPlan(plan, safeStep);

  return (
    <InterviewRuntimeProvider
      config={{
        sessionType: "drill",
        sourceSessionId: plan.sourceSessionId,
        drillId: drill.drillId,
        drillTarget: drill.target,
        maxAnswerSec: 90,
        totalQuestions: 1,
        initialQuestion: drill.question,
      }}
    >
      <DrillPlayer drill={drill} planId={plan.planId} step={safeStep} />
    </InterviewRuntimeProvider>
  );
}

export default function DrillPlanPage() {
  return (
    <Suspense fallback={null}>
      <DrillPlanContent />
    </Suspense>
  );
}
