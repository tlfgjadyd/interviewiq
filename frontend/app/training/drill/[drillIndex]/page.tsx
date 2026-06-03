"use client";

import { notFound, useParams } from "next/navigation";
import { InterviewRuntimeProvider } from "@/components/runtime/InterviewRuntimeProvider";
import { DrillPlayer } from "@/components/training/DrillPlayer";
import { drillPlan, getDrill } from "@/lib/training";

export default function DrillPage() {
  const params = useParams<{ drillIndex: string }>();
  const drillIndex = Number(params.drillIndex);

  if (!Number.isInteger(drillIndex) || drillIndex < 1 || drillIndex > 3) {
    notFound();
  }

  const drill = getDrill(drillIndex);

  return (
    <InterviewRuntimeProvider
      config={{
        sessionType: "drill",
        drillId: drill.id,
        drillTarget: drill.target,
        maxAnswerSec: 90,
        totalQuestions: 1,
        initialQuestion: drill.question,
      }}
    >
      <DrillPlayer drill={drill} />
    </InterviewRuntimeProvider>
  );
}
