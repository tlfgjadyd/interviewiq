import { NextResponse } from "next/server";
import { fallbackReport } from "@/lib/training";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;

  return NextResponse.json({
    report: {
      ...fallbackReport,
      sessionId,
      reportId: `report_${sessionId}`,
      recommendedPlan: {
        ...fallbackReport.recommendedPlan,
        sourceSessionId: sessionId,
      },
    },
  });
}
