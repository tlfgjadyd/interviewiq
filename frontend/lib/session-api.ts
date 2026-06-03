"use client";

import type {
  DrillPlan,
  InterviewReport,
  InterviewReportQuestion,
  InterviewWeakPattern,
} from "@/lib/runtime-types";
import { fallbackDrillPlan, fallbackReport } from "@/lib/training";

const PLAN_STORAGE_PREFIX = "interviewiq-drill-plan:";

export const getBackendBaseUrl = () =>
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "";

export const getReport = async (
  sessionId: string | null
): Promise<InterviewReport> => {
  if (!sessionId) {
    return fallbackReport;
  }

  const backendBaseUrl = getBackendBaseUrl();
  const url = backendBaseUrl
    ? `${backendBaseUrl}/api/sessions/${sessionId}/report`
    : `/api/reports/${sessionId}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load report: ${response.status}`);
    }

    const data = await response.json();
    const report = data.report ?? data;
    return normalizeReport(report, sessionId);
  } catch {
    return {
      ...fallbackReport,
      sessionId,
      recommendedPlan: {
        ...fallbackReport.recommendedPlan,
        sourceSessionId: sessionId,
      },
    };
  }
};

export const normalizeReport = (
  report: Partial<InterviewReport> & {
    overallSummary?: string[];
    overallFeedback?: {
      improvementPoints?: string[];
      content?: string;
      nonverbal?: string;
    };
    questions?: InterviewReportQuestion[];
    nextPractice?: {
      targetPhase?: string;
      recommendedQuestion?: string;
    };
  },
  sessionId: string
): InterviewReport => {
  const questions = Array.isArray(report.questions) ? report.questions : [];
  const summary =
    report.summary ??
    report.overallSummary?.filter(Boolean).join(" ") ??
    fallbackReport.summary;
  const metrics = Array.isArray(report.metrics)
    ? report.metrics
    : fallbackReport.metrics;
  const weakPatterns =
    report.weakPatterns ?? buildWeakPatternsFromQuestions(questions, report);
  const recommendedPlan = report.recommendedPlan ?? {
    ...fallbackDrillPlan,
    sourceSessionId: sessionId,
    drills: fallbackDrillPlan.drills.map((drill) => ({
      ...drill,
      sourceQuestionIds:
        weakPatterns[0]?.sourceQuestionIds ?? drill.sourceQuestionIds,
      sourceFlow: weakPatterns[0]?.flow ?? drill.sourceFlow,
      sourceTopic: weakPatterns[0]?.topic ?? drill.sourceTopic,
      analysisFocus: weakPatterns[0]?.analysisFocus ?? drill.analysisFocus,
    })),
  };

  return {
    sessionId: report.sessionId ?? sessionId,
    reportId: report.reportId ?? `report_${sessionId}`,
    status: report.status ?? "ready",
    summary,
    totalScore: report.totalScore ?? fallbackReport.totalScore,
    metrics,
    weakPatterns,
    recommendedPlan,
    questions,
  };
};

const buildWeakPatternsFromQuestions = (
  questions: InterviewReportQuestion[],
  report: {
    overallFeedback?: {
      improvementPoints?: string[];
      content?: string;
      nonverbal?: string;
    };
    nextPractice?: {
      targetPhase?: string;
      recommendedQuestion?: string;
    };
  }
): InterviewWeakPattern[] => {
  if (!questions.length) {
    return fallbackReport.weakPatterns;
  }

  const sourceQuestionIds = questions
    .map((question) => question.questionId)
    .filter((questionId): questionId is string => Boolean(questionId));
  const firstQuestion = questions.find((question) => question.questionId);
  const evidence = [
    ...(report.overallFeedback?.improvementPoints ?? []),
    ...questions
      .map((question) => question.answerText?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 2)
      .map((text) => `답변 근거: ${text.slice(0, 100)}`),
  ].slice(0, 4);
  const firstFocus = firstQuestion?.analysisFocus;
  const analysisFocus = Array.isArray(firstFocus)
    ? firstFocus
    : fallbackReport.weakPatterns[0]?.analysisFocus;

  return [
    {
      id: "backend_question_pattern",
      title: report.nextPractice?.targetPhase
        ? `${report.nextPractice.targetPhase} 보완 패턴`
        : "질문별 답변 보완 패턴",
      target: analysisFocus?.[0] ?? "answer_structure",
      flow: firstQuestion?.phase as InterviewWeakPattern["flow"],
      topic: firstQuestion?.topic as InterviewWeakPattern["topic"],
      sourceQuestionIds,
      analysisFocus,
      evidence: evidence.length ? evidence : fallbackReport.weakPatterns[0].evidence,
      recommendedInstruction:
        report.nextPractice?.recommendedQuestion ??
        fallbackReport.weakPatterns[0].recommendedInstruction,
    },
  ];
};

export const persistDrillPlan = (plan: DrillPlan) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(`${PLAN_STORAGE_PREFIX}${plan.planId}`, JSON.stringify(plan));
};

export const loadDrillPlan = (planId?: string | null): DrillPlan => {
  if (!planId || typeof window === "undefined") {
    return fallbackDrillPlan;
  }

  const raw = localStorage.getItem(`${PLAN_STORAGE_PREFIX}${planId}`);
  if (!raw) {
    return fallbackDrillPlan.planId === planId
      ? fallbackDrillPlan
      : { ...fallbackDrillPlan, planId };
  }

  try {
    return JSON.parse(raw) as DrillPlan;
  } catch {
    return fallbackDrillPlan;
  }
};
