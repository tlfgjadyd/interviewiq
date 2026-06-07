"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SettingsProvider } from "@/lib/settings-provider";
import { MetricsProvider } from "@/context/MetricsContext";
import {
  InterviewSessionProvider,
  useInterviewSession,
} from "@/context/InterviewSessionContext";
import { getReport } from "@/lib/session-api";
import type {
  AnswerMetrics,
  AnswerState,
  DrillSessionResult,
  DrillTarget,
  InterviewReport,
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
  drillResults: DrillSessionResult[];
  currentRunNo: number;
  startSessionPayload: StartSessionRequest;
  startSession: () => Promise<void>;
  startAnswer: () => void;
  endAnswer: (
    endedBy?: "voice_command" | "silence" | "button" | "keyboard" | "manual"
  ) => Promise<DrillSessionResult | null>;
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

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0?: {
    transcript?: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex?: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const getBrowserSpeechRecognition = ():
  | BrowserSpeechRecognitionConstructor
  | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
};

const analysisFocusList = (
  meta?: RuntimeQuestionMeta
): DrillSessionResult["analysisFocus"] | undefined =>
  Array.isArray(meta?.analysisFocus) ? meta.analysisFocus : undefined;

const reportMetricsForTarget = (
  report: InterviewReport,
  target?: DrillTarget
): AnswerMetrics => {
  const averageScore = report.metrics.length
    ? Math.round(
        report.metrics.reduce((sum, metric) => sum + metric.score, 0) /
          report.metrics.length
      )
    : undefined;

  if (target === "specificity") {
    return { audio: {}, vision: {}, content: { specificityScore: averageScore } };
  }

  if (target === "filler_words" || target === "pause") {
    return {
      audio: {
        fillerCount:
          averageScore === undefined ? undefined : Math.max(0, 100 - averageScore),
      },
      vision: {},
      content: {},
    };
  }

  return { audio: {}, vision: {}, content: { structureScore: averageScore } };
};

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
    latestAudioSignal,
    isAnswerRecording,
    startSession: startBaseSession,
    finishAnswer,
    finishSession: finishBaseSession,
    setAnswerRecording,
  } = useInterviewSession();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [drillResults, setDrillResults] = useState<DrillSessionResult[]>([]);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const latestTranscriptRef = useRef("");

  const stopBrowserSpeechRecognition = useCallback(() => {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;

    if (!recognition) {
      return;
    }

    try {
      recognition.stop();
    } catch (error) {
      console.warn("[interview-transcript-stop-failed]", error);
    }
  }, []);

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
      config.sessionType === "drill" ? 1 : config.totalQuestions ?? 12;

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
      drillIndex: config.sessionType === "drill" ? config.drillIndex : undefined,
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
    finalTranscriptRef.current = "";
    latestTranscriptRef.current = "";
    stopBrowserSpeechRecognition();

    const SpeechRecognition = getBrowserSpeechRecognition();
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "ko-KR";
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (
          let index = event.resultIndex ?? 0;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript ?? "";

          if (result?.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (finalText.trim()) {
          finalTranscriptRef.current =
            `${finalTranscriptRef.current} ${finalText}`.trim();
        }

        latestTranscriptRef.current =
          `${finalTranscriptRef.current} ${interimText}`.trim();
      };
      recognition.onerror = (event) => {
        console.warn("[interview-transcript-error]", event);
      };

      try {
        recognition.start();
        speechRecognitionRef.current = recognition;
        console.info("[interview-transcript-started]");
      } catch (error) {
        console.warn("[interview-transcript-start-failed]", error);
      }
    } else {
      console.warn("[interview-transcript-unavailable]");
    }

    setAnswerRecording(true);
  }, [setAnswerRecording, stopBrowserSpeechRecognition]);

  const endAnswer = useCallback(async (
    endedBy: "voice_command" | "silence" | "button" | "keyboard" | "manual" =
      "button"
  ) => {
    const finishedAnswerTurnId = session?.answerTurnId;
    const finishedQuestion = session?.currentQuestionMeta;
    const browserTranscript = latestTranscriptRef.current.trim();
    stopBrowserSpeechRecognition();
    console.info("[interview-finish-answer]", {
      sessionId: session?.sessionId,
      answerTurnId: session?.answerTurnId,
      browserTranscriptLength: browserTranscript.length,
    });
    const finishResult = await finishAnswer(endedBy, null, {
      browserTranscript,
      language: "ko-KR",
    });
    setElapsedSec(0);

    if (
      config.sessionType !== "drill" ||
      !session ||
      !finishedAnswerTurnId ||
      !config.drillId ||
      !finishResult?.sessionFinished
    ) {
      return null;
    }

    const report = await getReport(session.sessionId);
    const runNo = drillResults.length + 1;
    const result: DrillSessionResult = {
      drillId: config.drillId,
      sessionId: session.sessionId,
      reportId: report.reportId,
      answerTurnId: finishedAnswerTurnId,
      questionId: finishedQuestion?.questionId,
      questionOrder: finishedQuestion?.order,
      flow: finishedQuestion?.flow as DrillSessionResult["flow"],
      topic: finishedQuestion?.topic as DrillSessionResult["topic"],
      analysisFocus: analysisFocusList(finishedQuestion),
      runNo,
      metrics: reportMetricsForTarget(report, config.drillTarget),
      passed: report.totalScore >= 75,
      createdAt: new Date().toISOString(),
    };
    setDrillResults((current) => [...current, result]);
    return result;
  }, [
    drillResults.length,
    config,
    finishAnswer,
    session,
    stopBrowserSpeechRecognition,
  ]);

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
      answerTurnId: session.answerTurnId,
      questionIndex: session.questionIndex,
      totalQuestions: session.totalQuestions,
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
        isSpeakingRatio: latestAudioSignal?.isSpeakingRatio,
        silenceDurationMs: latestAudioSignal?.silenceDurationMs,
        rmsVolume: latestAudioSignal?.rmsVolume,
      },
      metrics,
      drillResults,
      currentRunNo: drillResults.length + 1,
      startSessionPayload,
      startSession,
      startAnswer,
      endAnswer,
      finishSession,
    }),
    [
      drillResults,
      config,
      currentQuestion,
      currentQuestionMeta,
      elapsedSec,
      endAnswer,
      finishSession,
      isAnswerRecording,
      latestAudioSignal,
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
