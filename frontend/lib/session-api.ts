"use client";

import type {
  DrillPlan,
  InterviewReport,
  InterviewReportQuestion,
  ReportComparison,
} from "@/lib/runtime-types";
import { fallbackDrillPlan } from "@/lib/training";

const PLAN_STORAGE_PREFIX = "interviewiq-drill-plan:";
const ACCESS_TOKEN_KEY = "interviewiq-access-token";

export const getBackendBaseUrl = () =>
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  (typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "");

export const getAccessToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY);

export const authHeaders = (extra?: HeadersInit): HeadersInit => {
  const token = getAccessToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getReport = async (
  sessionId: string | null
): Promise<InterviewReport> => {
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const backendBaseUrl = getBackendBaseUrl();
  const url = backendBaseUrl
    ? `${backendBaseUrl}/api/sessions/${sessionId}/report`
    : `/api/reports/${sessionId}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load report: ${response.status}`);
  }

  const data = await response.json();
  return normalizeReport(data.report ?? data, sessionId);
};

export type SessionAsset = {
  id: string;
  assetType: string;
  status: string;
  mimeType?: string | null;
  objectKey: string;
};

export const getSessionAssets = async (sessionId: string): Promise<SessionAsset[]> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    return [];
  }

  const response = await fetch(`${backendBaseUrl}/api/sessions/${sessionId}/assets`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data.assets) ? data.assets : [];
};

export const getAssetReadUrl = async (
  sessionId: string,
  assetId: string
): Promise<string | null> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    return null;
  }

  const response = await fetch(
    `${backendBaseUrl}/api/sessions/${sessionId}/assets/${assetId}/read-url`,
    {
      cache: "no-store",
      headers: authHeaders(),
    }
  );
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return typeof data.readUrl === "string" ? data.readUrl : null;
};

export type CourseReportResponse = {
  id: string;
  courseId: string;
  sessionId?: string | null;
  reportType: string;
  summary?: string | null;
  metrics: Record<string, unknown>;
  comparison: ReportComparison & Record<string, unknown>;
  recommendations: Record<string, unknown>;
  status: string;
};

export type CorrectionLoopResponse = {
  id: string;
  courseId: string;
  userId: string;
  sourceSessionId?: string | null;
  sourceReportId?: string | null;
  loopIndex: number;
  status: string;
  goals: Array<Record<string, unknown>>;
  drills: Array<Record<string, unknown>>;
  plan: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export const getCourseReports = async (courseId: string): Promise<CourseReportResponse[]> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return [];
  const response = await fetch(`${backendBaseUrl}/api/courses/${courseId}/reports`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.reports) ? data.reports : [];
};

export const getCourseCorrectionLoops = async (
  courseId: string
): Promise<CorrectionLoopResponse[]> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return [];
  const response = await fetch(`${backendBaseUrl}/api/courses/${courseId}/correction-loops`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.loops) ? data.loops : [];
};

export const createFinalReport = async (
  courseId: string
): Promise<CourseReportResponse | null> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return null;
  const response = await fetch(`${backendBaseUrl}/api/courses/${courseId}/final-report`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) return null;
  return (await response.json()) as CourseReportResponse;
};

export const getFinalReport = async (
  courseId: string
): Promise<CourseReportResponse | null> => {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return null;
  const response = await fetch(`${backendBaseUrl}/api/courses/${courseId}/final-report`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!response.ok) return null;
  return (await response.json()) as CourseReportResponse;
};

export const normalizeReport = (
  report: Partial<InterviewReport> & {
    displayMetrics?: unknown;
    overallSummary?: string[];
    questions?: InterviewReportQuestion[];
  },
  sessionId: string
): InterviewReport => {
  const questions = Array.isArray(report.questions) ? report.questions : [];
  const metrics = Array.isArray(report.metrics)
    ? report.metrics
    : Array.isArray(report.displayMetrics)
    ? (report.displayMetrics as InterviewReport["metrics"])
    : [];
  const weakPatterns = report.weakPatterns ?? [];
  const recommendedPlan = report.recommendedPlan;

  if (!metrics.length || !weakPatterns.length || !recommendedPlan) {
    throw new Error("Report is missing product result fields");
  }

  return {
    sessionId: report.sessionId ?? sessionId,
    reportId: report.reportId ?? `report_${sessionId}`,
    status: report.status ?? "ready",
    summary: report.summary ?? report.overallSummary?.filter(Boolean).join(" ") ?? "",
    totalScore: report.totalScore ?? 0,
    metrics,
    weakPatterns,
    recommendedPlan,
    questions,
    behaviorLinkedMoments: (report as { behaviorLinkedMoments?: Array<Record<string, unknown>> })
      .behaviorLinkedMoments,
    comparison: (report as { comparison?: ReportComparison }).comparison,
  };
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
