"use client";

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { InterviewBehaviorAnalysis } from "@/lib/analytics";
import type {
  DrillTarget,
  InterviewQuestion,
  QuestionSetId,
  RuntimeQuestionMeta,
  RealtimeAudioSignal,
  SessionType,
} from "@/lib/runtime-types";
import { authHeaders } from "@/lib/session-api";

export type SessionCreatePayload = {
  sessionType?: SessionType;
  courseId?: string;
  questionSetId?: QuestionSetId;
  company: string;
  role: string;
  interviewType: string;
  chunkMs: number;
  cluster?: string | null;
  industry?: string | null;
  totalQuestions: number;
  baselineId?: string;
  sourceSessionId?: string;
  drillIndex?: number;
  drillId?: string;
  drillTarget?: DrillTarget;
  maxAnswerSec?: number;
  initialQuestion?: string;
};

export type InterviewSessionState = {
  sessionId: string;
  sessionType?: SessionType;
  answerTurnId: string;
  chunkMs: number;
  currentQuestion: string;
  currentQuestionMeta?: RuntimeQuestionMeta;
  questionIndex: number;
  totalQuestions: number;
  phase: string;
  phaseGoal: string;
  questionHistory: string[];
  turnStartedAtMs: number;
  currentChunkIndex: number;
  status?: "active" | "finished";
  reportId?: string | null;
  courseId?: string;
  questionSetId?: QuestionSetId;
  baselineId?: string;
  sourceSessionId?: string;
  drillId?: string;
  drillTarget?: DrillTarget;
};

export type AnswerFinishMetadata = {
  browserTranscript?: string;
  language?: string;
  speechMetrics?: unknown;
};

type SessionCreateResponse = {
  sessionId: string;
  sessionType?: SessionType;
  courseId?: string;
  questionSetId?: QuestionSetId;
  baselineId?: string;
  sourceSessionId?: string;
  drillId?: string;
  drillTarget?: DrillTarget;
  maxAnswerSec?: number;
  answerTurnId: string;
  firstQuestion: string;
  currentQuestionMeta?: RuntimeQuestionMeta;
  currentQuestion?: InterviewQuestion;
  firstQuestionMeta?: InterviewQuestion;
  firstQuestionSource?: string | null;
  questionIndex: number;
  totalQuestions: number;
  phase: string;
  phaseGoal: string;
};

type AnswerFinishResponse = {
  answerTurnId: string;
  status: "analysis_ready";
  nextQuestionPending: boolean;
  nextAnswerTurnId: string | null;
  nextQuestion: string | null;
  currentQuestion?: InterviewQuestion | null;
  nextQuestionMeta?: RuntimeQuestionMeta | null;
  nextQuestionSource?: string | null;
  questionIndex: number;
  totalQuestions: number;
  phase: string;
  phaseGoal: string;
  sessionFinished: boolean;
  reportId?: string | null;
};

type SessionFinishResponse = {
  sessionId: string;
  status: "finished";
  reportId: string;
};

type InterviewSessionContextValue = {
  backendBaseUrl: string;
  session: InterviewSessionState | null;
  latestVision: InterviewBehaviorAnalysis | null;
  latestAudioSignal: RealtimeAudioSignal | null;
  isAnswerRecording: boolean;
  isCreatingSession: boolean;
  isFinishingAnswer: boolean;
  isFinishingSession: boolean;
  error: string | null;
  startSession: (payload?: Partial<SessionCreatePayload>) => Promise<void>;
  finishAnswer: (
    endedBy?: "voice_command" | "silence" | "button" | "keyboard" | "manual",
    endPhrase?: string | null,
    metadata?: AnswerFinishMetadata
  ) => Promise<AnswerFinishResponse | null>;
  finishSession: () => Promise<SessionFinishResponse | null>;
  setAnswerRecording: (recording: boolean) => void;
  setLatestVision: (analysis: InterviewBehaviorAnalysis | null) => void;
  setLatestAudioSignal: (signal: RealtimeAudioSignal | null) => void;
};

const DEFAULT_SESSION_PAYLOAD: SessionCreatePayload = {
  company: "sk_hynix",
  role: "backend",
  interviewType: "project_experience",
  chunkMs: 5000,
  cluster: "large_manufacturing",
  industry: "semiconductor",
  totalQuestions: 12,
};
const DOCUMENT_STORAGE_KEY = "interviewiq-documents";
const COURSE_STORAGE_KEY = "interviewiq-course";

type StoredDocuments = {
  resumeText?: string;
  jobPostingText?: string;
  company?: string;
  role?: string;
};

type StoredCourse = {
  courseId?: string;
  company?: string;
  role?: string;
  interviewType?: string;
};

type SessionDocumentsResponse = {
  personalizedQuestion?: string;
  personalizedQuestionSource?: string | null;
};

type CourseSessionStartResponse = {
  session: {
    id: string;
    courseId: string;
    sessionType: SessionType;
    totalQuestions: number;
  };
  runtime: SessionCreateResponse;
};

const InterviewSessionContext =
  createContext<InterviewSessionContextValue | null>(null);

const getBackendBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return "http://127.0.0.1:8000";
  }
  return "";
};

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
};

export const InterviewSessionProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const backendBaseUrl = useMemo(getBackendBaseUrl, []);
  const [session, setSession] = useState<InterviewSessionState | null>(null);
  const [latestVision, setLatestVision] =
    useState<InterviewBehaviorAnalysis | null>(null);
  const [latestAudioSignal, setLatestAudioSignal] =
    useState<RealtimeAudioSignal | null>(null);
  const [isAnswerRecording, setIsAnswerRecording] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isFinishingAnswer, setIsFinishingAnswer] = useState(false);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (payload?: Partial<SessionCreatePayload>) => {
      setIsCreatingSession(true);
      setError(null);

      try {
        const storedCourse = readStoredCourse();
        const requestPayload = {
          ...DEFAULT_SESSION_PAYLOAD,
          company: storedCourse?.company ?? DEFAULT_SESSION_PAYLOAD.company,
          role: storedCourse?.role ?? DEFAULT_SESSION_PAYLOAD.role,
          interviewType:
            storedCourse?.interviewType ?? DEFAULT_SESSION_PAYLOAD.interviewType,
          ...payload,
          courseId: payload?.courseId ?? storedCourse?.courseId,
        };
        let usedCourseSessionStart = Boolean(requestPayload.courseId);
        let response = requestPayload.courseId
          ? await fetch(
              `${backendBaseUrl}/api/courses/${requestPayload.courseId}/sessions/start`,
              {
                method: "POST",
                headers: authHeaders({
                  "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                  sessionType: requestPayload.sessionType ?? "full",
                  cycleIndex: 1,
                  chunkMs: requestPayload.chunkMs,
                  cluster: requestPayload.cluster,
                  industry: requestPayload.industry,
                  totalQuestions: requestPayload.totalQuestions,
                  sourceSessionId: requestPayload.sourceSessionId,
                  drillIndex: requestPayload.drillIndex,
                  drillId: requestPayload.drillId,
                  drillTarget: requestPayload.drillTarget,
                  initialQuestion: requestPayload.initialQuestion,
                }),
              }
            )
          : await fetch(`${backendBaseUrl}/api/sessions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestPayload),
            });

        if (
          requestPayload.sessionType === "drill" &&
          requestPayload.courseId &&
          [401, 404].includes(response.status)
        ) {
          console.warn("[drill-course-session-start-fallback]", response.status);
          usedCourseSessionStart = false;
          response = await fetch(`${backendBaseUrl}/api/sessions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
          });
        }

        if (!response.ok) {
          throw new Error(`Failed to create session: ${response.status}`);
        }

        const rawData = await response.json();
        const data = usedCourseSessionStart
          ? ((rawData as CourseSessionStartResponse).runtime as SessionCreateResponse)
          : (rawData as SessionCreateResponse);
        const dbSession = usedCourseSessionStart
          ? (rawData as CourseSessionStartResponse).session
          : null;

        const storedDocuments = readStoredDocuments();
        if (storedDocuments?.resumeText && storedDocuments.jobPostingText) {
          const documentResponse = await fetch(
            `${backendBaseUrl}/api/sessions/${data.sessionId}/documents`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                resumeText: storedDocuments.resumeText,
                jobPostingText: storedDocuments.jobPostingText,
                company: storedDocuments.company ?? requestPayload.company,
                role: storedDocuments.role ?? requestPayload.role,
              }),
            }
          );
          if (!documentResponse.ok) {
            console.warn("[session-documents-sync-failed]", documentResponse.status);
          }
        }

        setSession({
          sessionId: data.sessionId,
          sessionType:
            data.sessionType ?? dbSession?.sessionType ?? requestPayload.sessionType ?? "full",
          answerTurnId: data.answerTurnId,
          chunkMs: requestPayload.chunkMs,
          currentQuestion: data.firstQuestion,
          currentQuestionMeta:
            data.currentQuestionMeta ?? data.currentQuestion ?? data.firstQuestionMeta,
          questionIndex: data.questionIndex,
          totalQuestions: data.totalQuestions,
          phase: data.phase,
          phaseGoal: data.phaseGoal,
          questionHistory: [data.firstQuestion],
          turnStartedAtMs: performance.now(),
          currentChunkIndex: 0,
          status: "active",
          reportId: null,
          courseId: data.courseId ?? dbSession?.courseId ?? requestPayload.courseId,
          questionSetId: data.questionSetId ?? requestPayload.questionSetId,
          baselineId: data.baselineId ?? requestPayload.baselineId,
          sourceSessionId: data.sourceSessionId ?? requestPayload.sourceSessionId,
          drillId: data.drillId ?? requestPayload.drillId,
          drillTarget: data.drillTarget ?? requestPayload.drillTarget,
        });
        setLatestVision(null);
        setLatestAudioSignal(null);
        setIsAnswerRecording(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create session";
        setError(message);
        throw err;
      } finally {
        setIsCreatingSession(false);
      }
    },
    [backendBaseUrl]
  );

  const finishAnswer = useCallback(
    async (
      endedBy: "voice_command" | "silence" | "button" | "keyboard" | "manual" =
        "button",
      endPhrase: string | null = null,
      metadata: AnswerFinishMetadata = {}
    ) => {
      if (!session) {
        return null;
      }

      setIsFinishingAnswer(true);
      setError(null);

      try {
        const endedAt = Math.max(
          Math.round(performance.now() - session.turnStartedAtMs),
          0
        );
        const response = await fetch(
          `${backendBaseUrl}/api/sessions/${session.sessionId}/answers/${session.answerTurnId}/finish`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              endedBy,
              endedAt,
              endPhrase,
              ...metadata,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to finish answer: ${response.status}`);
        }

        const data = (await response.json()) as AnswerFinishResponse;

        setSession((current) =>
          current && data.sessionFinished
            ? {
                ...current,
                status: "finished",
                reportId: data.reportId ?? null,
                questionIndex: data.questionIndex,
                totalQuestions: data.totalQuestions,
                phase: data.phase,
                phaseGoal: data.phaseGoal,
              }
            : current && data.nextAnswerTurnId && data.nextQuestion
            ? {
                ...current,
                answerTurnId: data.nextAnswerTurnId,
                currentQuestion: data.nextQuestion,
                currentQuestionMeta:
                  data.currentQuestion ?? data.nextQuestionMeta ?? current.currentQuestionMeta,
                questionIndex: data.questionIndex,
                totalQuestions: data.totalQuestions,
                phase: data.phase,
                phaseGoal: data.phaseGoal,
                questionHistory: [...current.questionHistory, data.nextQuestion],
                turnStartedAtMs: performance.now(),
                currentChunkIndex: 0,
              }
            : current
        );
        setLatestVision(null);
        setLatestAudioSignal(null);
        setIsAnswerRecording(false);
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to finish answer";
        setError(message);
        throw err;
      } finally {
        setIsFinishingAnswer(false);
      }
    },
    [backendBaseUrl, session]
  );

  const finishSession = useCallback(async () => {
    if (!session) {
      return null;
    }

    setIsFinishingSession(true);
    setError(null);

    const timeout = createTimeoutSignal(15000);

    try {
      const response = await fetch(
        `${backendBaseUrl}/api/sessions/${session.sessionId}/finish`,
        {
          method: "POST",
          signal: timeout.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to finish session: ${response.status}`);
      }

      const data = (await response.json()) as SessionFinishResponse;

      setSession((current) =>
        current
          ? {
              ...current,
              status: "finished",
              reportId: data.reportId,
            }
          : current
      );
      setLatestVision(null);
      setLatestAudioSignal(null);
      setIsAnswerRecording(false);
      return data;
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Session finish timed out. Please try again."
          : err instanceof Error
          ? err.message
          : "Failed to finish session";
      setError(message);
      throw err;
    } finally {
      timeout.clear();
      setIsFinishingSession(false);
    }
  }, [backendBaseUrl, session]);

  return (
    <InterviewSessionContext.Provider
      value={{
        backendBaseUrl,
        session,
        latestVision,
        latestAudioSignal,
        isAnswerRecording,
        isCreatingSession,
        isFinishingAnswer,
        isFinishingSession,
        error,
        startSession,
        finishAnswer,
        finishSession,
        setAnswerRecording: (recording) => {
          setIsAnswerRecording(recording);
          if (recording) {
            setSession((current) =>
              current
                ? {
                    ...current,
                    turnStartedAtMs: performance.now(),
                    currentChunkIndex: 0,
                  }
                : current
            );
          }
        },
        setLatestVision,
        setLatestAudioSignal,
      }}
    >
      {children}
    </InterviewSessionContext.Provider>
  );
};

const readStoredDocuments = (): StoredDocuments | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(DOCUMENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredDocuments;
  } catch {
    return null;
  }
};

const readStoredCourse = (): StoredCourse | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(COURSE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredCourse;
  } catch {
    return null;
  }
};

export const useInterviewSession = () => {
  const context = useContext(InterviewSessionContext);

  if (!context) {
    throw new Error(
      "useInterviewSession must be used within InterviewSessionProvider"
    );
  }

  return context;
};
