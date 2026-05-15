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

export type SessionCreatePayload = {
  company: string;
  role: string;
  interviewType: string;
  chunkMs: number;
  cluster?: string | null;
  industry?: string | null;
};

export type InterviewSessionState = {
  sessionId: string;
  answerTurnId: string;
  chunkMs: number;
  currentQuestion: string;
  questionIndex: number;
  questionHistory: string[];
  turnStartedAtMs: number;
  currentChunkIndex: number;
  status?: "active" | "finished";
};

export type AnswerFinishMetadata = {
  browserTranscript?: string;
  language?: string;
  speechMetrics?: unknown;
};

type SessionCreateResponse = {
  sessionId: string;
  answerTurnId: string;
  firstQuestion: string;
};

type AnswerFinishResponse = {
  answerTurnId: string;
  status: "analysis_ready";
  nextQuestionPending: boolean;
  nextAnswerTurnId: string;
  nextQuestion: string;
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
  isCreatingSession: boolean;
  isFinishingAnswer: boolean;
  isFinishingSession: boolean;
  error: string | null;
  startSession: (payload?: Partial<SessionCreatePayload>) => Promise<void>;
  finishAnswer: (
    endedBy?: "voice_command" | "silence" | "button" | "keyboard" | "manual",
    endPhrase?: string | null,
    metadata?: AnswerFinishMetadata
  ) => Promise<void>;
  finishSession: () => Promise<SessionFinishResponse | null>;
  setLatestVision: (analysis: InterviewBehaviorAnalysis | null) => void;
};

const DEFAULT_SESSION_PAYLOAD: SessionCreatePayload = {
  company: "sk_hynix",
  role: "backend",
  interviewType: "project_experience",
  chunkMs: 5000,
  cluster: "large_manufacturing",
  industry: "semiconductor",
};

const InterviewSessionContext =
  createContext<InterviewSessionContextValue | null>(null);

const getBackendBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
    ""
  );
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
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isFinishingAnswer, setIsFinishingAnswer] = useState(false);
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (payload?: Partial<SessionCreatePayload>) => {
      setIsCreatingSession(true);
      setError(null);

      try {
        const requestPayload = {
          ...DEFAULT_SESSION_PAYLOAD,
          ...payload,
        };
        const response = await fetch(`${backendBaseUrl}/api/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          throw new Error(`Failed to create session: ${response.status}`);
        }

        const data = (await response.json()) as SessionCreateResponse;

        setSession({
          sessionId: data.sessionId,
          answerTurnId: data.answerTurnId,
          chunkMs: requestPayload.chunkMs,
          currentQuestion: data.firstQuestion,
          questionIndex: 0,
          questionHistory: [data.firstQuestion],
          turnStartedAtMs: performance.now(),
          currentChunkIndex: 0,
          status: "active",
        });
        setLatestVision(null);
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
        return;
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
          current
            ? {
                ...current,
                answerTurnId: data.nextAnswerTurnId,
                currentQuestion: data.nextQuestion,
                questionIndex: current.questionIndex + 1,
                questionHistory: [...current.questionHistory, data.nextQuestion],
                turnStartedAtMs: performance.now(),
                currentChunkIndex: 0,
              }
            : current
        );
        setLatestVision(null);
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
            }
          : current
      );
      setLatestVision(null);
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
        isCreatingSession,
        isFinishingAnswer,
        isFinishingSession,
        error,
        startSession,
        finishAnswer,
        finishSession,
        setLatestVision,
      }}
    >
      {children}
    </InterviewSessionContext.Provider>
  );
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
