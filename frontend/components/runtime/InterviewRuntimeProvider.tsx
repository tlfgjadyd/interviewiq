"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SettingsProvider } from "@/lib/settings-provider";
import { MetricsProvider } from "@/context/MetricsContext";
import {
  InterviewSessionProvider,
  useInterviewSession,
} from "@/context/InterviewSessionContext";
import { saveDrillAttempt } from "@/lib/session-api";
import type {
  AnswerMetrics,
  AnswerState,
  DrillAttempt,
  InterviewSession,
  RuntimeConfig,
  RuntimeQuestionMeta,
  StartSessionRequest,
} from "@/lib/runtime-types";

type InterviewRuntimeContextValue = {
  config: RuntimeConfig;
  session: InterviewSession | null;
  isSessionActive: boolean;
  currentQuestion: string;
  currentQuestionMeta?: RuntimeQuestionMeta;
  answerState: AnswerState;
  metrics: AnswerMetrics;
  attempts: DrillAttempt[];
  currentAttemptNo: number;
  startSessionPayload: StartSessionRequest;
  startSession: () => Promise<void>;
  startAnswer: () => void;
  endAnswer: () => Promise<DrillAttempt | null>;
  finishSession: () => Promise<void>;
};

const InterviewRuntimeContext =
  createContext<InterviewRuntimeContextValue | null>(null);

const emptyMetrics: AnswerMetrics = {
  audio: {},
  vision: {},
  content: {},
};

const fallbackQuestionText = "자기소개를 부탁드립니다.";

const analysisFocusList = (
  meta?: RuntimeQuestionMeta
): DrillAttempt["analysisFocus"] | undefined =>
  Array.isArray(meta?.analysisFocus) ? meta.analysisFocus : undefined;

const InterviewRuntimeBridge = ({
  children,
  config,
}: {
  children: ReactNode;
  config: RuntimeConfig;
}) => {
  const {
    session,
    latestVision,
    isAnswerRecording,
    startSession: startBaseSession,
    finishAnswer,
    finishSession: finishBaseSession,
    setAnswerRecording,
  } = useInterviewSession();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [attempts, setAttempts] = useState<DrillAttempt[]>([]);

  useEffect(() => {
    if (!isAnswerRecording) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSec((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAnswerRecording]);

  const startSessionPayload = useMemo<StartSessionRequest>(() => {
    const totalQuestions =
      config.sessionType === "drill" ? 1 : config.totalQuestions ?? 13;

    return {
      sessionType: config.sessionType,
      courseId: config.courseId,
      questionSetId:
        config.sessionType === "full"
          ? config.questionSetId ?? "full_13"
          : config.questionSetId,
      baselineId: config.baselineId,
      sourceSessionId:
        config.sessionType === "drill" ? config.sourceSessionId : undefined,
      drillId: config.sessionType === "drill" ? config.drillId : undefined,
      drillTarget:
        config.sessionType === "drill" ? config.drillTarget : undefined,
      maxAnswerSec: config.maxAnswerSec,
      totalQuestions,
    };
  }, [config]);

  const startSession = useCallback(async () => {
    await startBaseSession({
      ...startSessionPayload,
    });
    setElapsedSec(0);
  }, [startBaseSession, startSessionPayload]);

  const startAnswer = useCallback(() => {
    setElapsedSec(0);
    setAnswerRecording(true);
  }, [setAnswerRecording]);

  const endAnswer = useCallback(async () => {
    const finishedAnswerTurnId = session?.answerTurnId;
    const finishedQuestion = session?.currentQuestionMeta;
    await finishAnswer("button");
    setElapsedSec(0);

    if (
      config.sessionType !== "drill" ||
      !session ||
      !finishedAnswerTurnId ||
      !config.drillId
    ) {
      return null;
    }

    const attemptNo = attempts.length + 1;
    const attempt: DrillAttempt = {
      attemptId: `attempt_${crypto.randomUUID().slice(0, 8)}`,
      drillId: config.drillId,
      sessionId: session.sessionId,
      answerTurnId: finishedAnswerTurnId,
      questionId: finishedQuestion?.questionId,
      questionOrder: finishedQuestion?.order,
      flow: finishedQuestion?.flow as DrillAttempt["flow"],
      topic: finishedQuestion?.topic as DrillAttempt["topic"],
      analysisFocus: analysisFocusList(finishedQuestion),
      attemptNo,
      metrics: createMockAttemptMetrics(config.drillTarget, attemptNo),
      passed: attemptNo >= 2,
      createdAt: new Date().toISOString(),
    };
    const savedAttempt = await saveDrillAttempt(session.sessionId, attempt);
    setAttempts((current) => [...current, savedAttempt]);
    return savedAttempt;
  }, [attempts.length, config, finishAnswer, session]);

  const finishSession = useCallback(async () => {
    await finishBaseSession();
  }, [finishBaseSession]);

  const runtimeSession = useMemo<InterviewSession | null>(() => {
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      sessionType: session.sessionType ?? config.sessionType,
      status: session.status ?? "active",
      courseId: session.courseId ?? config.courseId,
      questionSetId: session.questionSetId ?? startSessionPayload.questionSetId,
      baselineId: session.baselineId ?? config.baselineId,
      sourceSessionId: session.sourceSessionId ?? config.sourceSessionId,
      drillId: session.drillId ?? config.drillId,
      drillTarget: session.drillTarget ?? config.drillTarget,
      currentQuestionMeta:
        session.currentQuestionMeta ?? config.initialQuestionMeta,
      createdAt: new Date().toISOString(),
    };
  }, [config, session, startSessionPayload.questionSetId]);

  const metrics = useMemo<AnswerMetrics>(() => {
    if (!latestVision) {
      return emptyMetrics;
    }

    return {
      audio: {},
      vision: {
        gazeAwayRatio:
          typeof latestVision.signals.gazeAwayDuration === "number"
            ? latestVision.signals.gazeAwayDuration
            : undefined,
        fidgetScore:
          typeof latestVision.behaviorRiskScore === "number"
            ? latestVision.behaviorRiskScore
            : undefined,
      },
      content: {},
    };
  }, [latestVision]);

  const currentQuestionMeta =
    session?.currentQuestionMeta ?? config.initialQuestionMeta;
  const currentQuestion =
    config.sessionType === "drill"
      ? config.initialQuestion ??
        currentQuestionMeta?.text ??
        session?.currentQuestion ??
        fallbackQuestionText
      : session?.currentQuestion ??
        currentQuestionMeta?.text ??
        config.initialQuestion ??
        fallbackQuestionText;

  const value = useMemo<InterviewRuntimeContextValue>(
    () => ({
      config,
      session: runtimeSession,
      isSessionActive: session?.status === "active",
      currentQuestion,
      currentQuestionMeta,
      answerState: {
        answerTurnId: session?.answerTurnId ?? null,
        isRecording: isAnswerRecording,
        elapsedSec,
        maxAnswerSec: config.maxAnswerSec,
      },
      metrics,
      attempts,
      currentAttemptNo: attempts.length + 1,
      startSessionPayload,
      startSession,
      startAnswer,
      endAnswer,
      finishSession,
    }),
    [
      attempts,
      config,
      currentQuestion,
      currentQuestionMeta,
      elapsedSec,
      endAnswer,
      finishSession,
      isAnswerRecording,
      metrics,
      runtimeSession,
      session,
      startAnswer,
      startSession,
      startSessionPayload,
    ]
  );

  return (
    <InterviewRuntimeContext.Provider value={value}>
      {children}
    </InterviewRuntimeContext.Provider>
  );
};

const createMockAttemptMetrics = (
  drillTarget: RuntimeConfig["drillTarget"],
  attemptNo: number
): AnswerMetrics => {
  const improvement = Math.min(attemptNo - 1, 2);

  if (drillTarget === "filler_words") {
    return {
      audio: {
        fillerCount: Math.max(1, 5 - improvement * 2),
        pauseRatio: 0.18,
      },
      vision: {},
      content: {
        structureScore: 64 + improvement * 6,
      },
    };
  }

  return {
    audio: {
      fillerCount: Math.max(1, 4 - improvement),
    },
    vision: {},
    content: {
      structureScore: 66 + improvement * 8,
      specificityScore: 61 + improvement * 7,
      relevanceScore: 70 + improvement * 5,
    },
  };
};

export const InterviewRuntimeProvider = ({
  children,
  config,
}: {
  children: ReactNode;
  config: RuntimeConfig;
}) => {
  return (
    <SettingsProvider>
      <MetricsProvider>
        <InterviewSessionProvider>
          <InterviewRuntimeBridge config={config}>
            {children}
          </InterviewRuntimeBridge>
        </InterviewSessionProvider>
      </MetricsProvider>
    </SettingsProvider>
  );
};

export const useInterviewRuntime = () => {
  const context = useContext(InterviewRuntimeContext);

  if (!context) {
    throw new Error(
      "useInterviewRuntime must be used within InterviewRuntimeProvider"
    );
  }

  return context;
};
