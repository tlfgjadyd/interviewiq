"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useMetrics } from "@/context/MetricsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInterviewSession } from "@/context/InterviewSessionContext";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    SpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

type SimpleTranscriptionChunk = {
  transcription: string;
  timestamp: string;
  device: string;
  is_input: boolean;
  is_final: boolean;
};

type SpeechMetrics = {
  answerStartedAtMs: number;
  answerEndedAtMs: number;
  answerStartedAtIso: string;
  answerEndedAtIso: string;
  durationSec: number;
  firstSpeechDelaySec: number | null;
  longPauseCount: number;
  averagePauseSec: number;
  longestPauseSec: number;
  averageVolume: number;
  volumeVariance: number;
  speakingRateWpm: number;
  fillerCount: number;
  pauses: {
    startMs: number;
    endMs: number;
    startSec: number;
    endSec: number;
    durationSec: number;
  }[];
};

type SpeechMetricsSession = {
  startedAt: number;
  startedAtEpochMs: number;
  firstSpeechAt: number | null;
  silenceStartedAt: number | null;
  pauses: {
    startMs: number;
    endMs: number;
  }[];
  volumeSamples: number[];
  wasSpeaking: boolean;
};

type CoachingAnalysis = {
  overallStatus: string;
  deliveryScore: number;
  confidenceSignal: string;
  wordChoiceStatus: string;
  toneFeedback: string;
  wordChoiceFeedback: string;
  nextTip: string;
};

const SILENCE_RMS_THRESHOLD = 0.025;
const LONG_PAUSE_MS = 700;
const ANSWER_END_PHRASES = {
  "ko-KR": ["답변 끝", "답변 마치겠습니다", "이상입니다", "여기까지입니다"],
  "en-US": ["end answer", "answer complete", "that's my answer", "i am done"],
} as const;
const getNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const createSpeechMetricsSession = (): SpeechMetricsSession => ({
  startedAt: getNow(),
  startedAtEpochMs: Date.now(),
  firstSpeechAt: null,
  silenceStartedAt: null,
  pauses: [],
  volumeSamples: [],
  wasSpeaking: false,
});

const countFillers = (text: string, language: "ko-KR" | "en-US") => {
  const normalized = text.toLowerCase();
  const fillers =
    language === "ko-KR"
      ? ["음", "어", "그", "그러니까", "약간", "뭐랄까", "저기"]
      : ["um", "uh", "like", "you know", "i mean", "sort of", "kind of"];

  return fillers.reduce((count, filler) => {
    const matches = normalized.match(new RegExp(filler, "g"));
    return count + (matches?.length ?? 0);
  }, 0);
};

const calculateSpeechMetrics = (
  session: SpeechMetricsSession,
  transcript: string,
  language: "ko-KR" | "en-US"
): SpeechMetrics => {
  const endedAt = getNow();
  const endedAtEpochMs =
    session.startedAtEpochMs + Math.max(endedAt - session.startedAt, 0);
  const durationMs = Math.max(endedAt - session.startedAt, 1);
  const durationSec = durationMs / 1000;
  const volumeCount = Math.max(session.volumeSamples.length, 1);
  const averageVolume =
    session.volumeSamples.reduce((sum, volume) => sum + volume, 0) /
    volumeCount;
  const volumeVariance =
    session.volumeSamples.reduce(
      (sum, volume) => sum + Math.pow(volume - averageVolume, 2),
      0
    ) / volumeCount;
  const words =
    language === "ko-KR"
      ? transcript.replace(/\s/g, "").length / 2
      : transcript.trim().split(/\s+/).filter(Boolean).length;

  const pauses = session.pauses.map((pause) => ({
    startMs: Number((pause.startMs - session.startedAt).toFixed(0)),
    endMs: Number((pause.endMs - session.startedAt).toFixed(0)),
    startSec: Number(((pause.startMs - session.startedAt) / 1000).toFixed(1)),
    endSec: Number(((pause.endMs - session.startedAt) / 1000).toFixed(1)),
    durationSec: Number(((pause.endMs - pause.startMs) / 1000).toFixed(1)),
  }));

  return {
    answerStartedAtMs: Number(session.startedAt.toFixed(0)),
    answerEndedAtMs: Number(endedAt.toFixed(0)),
    answerStartedAtIso: new Date(session.startedAtEpochMs).toISOString(),
    answerEndedAtIso: new Date(endedAtEpochMs).toISOString(),
    durationSec: Number(durationSec.toFixed(1)),
    firstSpeechDelaySec: session.firstSpeechAt
      ? Number(((session.firstSpeechAt - session.startedAt) / 1000).toFixed(1))
      : null,
    longPauseCount: pauses.filter((pause) => pause.durationSec * 1000 >= LONG_PAUSE_MS)
      .length,
    averagePauseSec: pauses.length
      ? Number(
          (
            pauses.reduce((sum, pause) => sum + pause.durationSec, 0) /
            pauses.length
          ).toFixed(1)
        )
      : 0,
    longestPauseSec: pauses.length
      ? Number(Math.max(...pauses.map((pause) => pause.durationSec)).toFixed(1))
      : 0,
    averageVolume: Number(averageVolume.toFixed(4)),
    volumeVariance: Number(volumeVariance.toFixed(6)),
    speakingRateWpm: Number(((words / durationSec) * 60).toFixed(0)),
    fillerCount: countFillers(transcript, language),
    pauses,
  };
};

export function RealtimeAudio({
  onDataChange,
}: {
  onDataChange?: (data: any, error: string | null) => void;
}) {
  const {
    backendBaseUrl,
    session,
    latestVision,
    finishAnswer,
    isFinishingAnswer,
    setAnswerRecording,
  } = useInterviewSession();
  const [transcription, setTranscription] =
    useState<SimpleTranscriptionChunk | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState("");
  const historyRef = useRef(history);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const answerAudioChunksRef = useRef<Blob[]>([]);
  const answerAudioMimeTypeRef = useRef("audio/webm");
  const answerTranscriptRef = useRef("");
  const latestBrowserTranscriptRef = useRef("");
  const isEndingAnswerRef = useRef(false);
  const isGeneratingFeedbackRef = useRef(false);
  const sessionRef = useRef({
    backendBaseUrl,
    session,
    latestVision,
  });
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const speechMetricsSessionRef = useRef<SpeechMetricsSession>(
    createSpeechMetricsSession()
  );
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [interviewerText, setInterviewerText] = useState("");
  const [language, setLanguage] = useState<"ko-KR" | "en-US">("ko-KR");
  const [coachingAnalysis, setCoachingAnalysis] =
    useState<CoachingAnalysis | null>(null);

  const { metrics } = useMetrics();

  useEffect(() => {
    sessionRef.current = {
      backendBaseUrl,
      session,
      latestVision,
    };
  }, [backendBaseUrl, session, latestVision]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    answerAudioChunksRef.current = [];
    answerAudioMimeTypeRef.current = "audio/webm";
    answerTranscriptRef.current = "";
    latestBrowserTranscriptRef.current = "";
    speechMetricsSessionRef.current = createSpeechMetricsSession();
    isEndingAnswerRef.current = false;
  }, [session?.answerTurnId]);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  };

  const createRecognition = () => {
    if (typeof window === "undefined") return null;

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return null;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    return recognition;
  };

  const startSpeechMetrics = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 2048;
    const samples = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    speechMetricsSessionRef.current = createSpeechMetricsSession();
    startAnswerAudioRecorder(stream);

    const sampleAudio = () => {
      analyser.getFloatTimeDomainData(samples);

      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
      }

      const rms = Math.sqrt(sumSquares / samples.length);
      const now = getNow();
      const session = speechMetricsSessionRef.current;
      const isSpeaking = rms >= SILENCE_RMS_THRESHOLD;

      session.volumeSamples.push(rms);

      if (isSpeaking) {
        if (!session.firstSpeechAt) {
          session.firstSpeechAt = now;
        }

        if (session.silenceStartedAt && session.wasSpeaking) {
          session.pauses.push({
            startMs: session.silenceStartedAt,
            endMs: now,
          });
        }

        session.silenceStartedAt = null;
        session.wasSpeaking = true;
      } else if (session.wasSpeaking && !session.silenceStartedAt) {
        session.silenceStartedAt = now;
      }

      analyserFrameRef.current = requestAnimationFrame(sampleAudio);
    };

    sampleAudio();
  };

  const uploadAnswerAudio = async (
    audioBlob: Blob,
    mimeType: string,
    browserTranscript: string
  ) => {
    const currentSession = sessionRef.current.session;

    if (!currentSession) {
      return;
    }

    const metrics = calculateSpeechMetrics(
      speechMetricsSessionRef.current,
      browserTranscript,
      language
    );
    const durationMs = Math.max(Math.round(metrics.durationSec * 1000), 1);
    const metadata = {
      answerTurnId: currentSession.answerTurnId,
      startedAt: 0,
      endedAt: durationMs,
      durationMs,
      mimeType,
      language,
      browserTranscript,
      browserLatestText: latestBrowserTranscriptRef.current,
    };
    const formData = new FormData();

    formData.append("audio", audioBlob, `${currentSession.answerTurnId}.webm`);
    formData.append("metadata", JSON.stringify(metadata));

    const response = await fetch(
      `${sessionRef.current.backendBaseUrl}/api/sessions/${currentSession.sessionId}/answers/${currentSession.answerTurnId}/audio`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`answer audio upload failed: ${response.status}`);
    }
  };

  const startAnswerAudioRecorder = (stream: MediaStream) => {
    const currentSession = sessionRef.current.session;

    if (!currentSession || typeof MediaRecorder === "undefined") {
      return;
    }

    const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);

    answerAudioChunksRef.current = [];
    answerAudioMimeTypeRef.current =
      recorder.mimeType || preferredMimeType || "audio/webm";
    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }

      answerAudioChunksRef.current.push(event.data);
    };
    recorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
  };

  const stopRecorderAndBuildAnswerAudio = async () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return new Blob(answerAudioChunksRef.current, {
        type: answerAudioMimeTypeRef.current,
      });
    }

    await new Promise<void>((resolve) => {
      const handleStop = () => {
        recorder.removeEventListener("stop", handleStop);
        resolve();
      };

      recorder.addEventListener("stop", handleStop);
      recorder.stop();
    });

    mediaRecorderRef.current = null;
    return new Blob(answerAudioChunksRef.current, {
      type: answerAudioMimeTypeRef.current,
    });
  };

  const findAnswerEndPhrase = (text: string) => {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return ANSWER_END_PHRASES[language].find((phrase) =>
      normalized.includes(phrase.toLowerCase())
    );
  };

  const stripAnswerEndPhrase = (text: string, phrase: string | undefined) => {
    if (!phrase) return text.trim();
    return text.replace(new RegExp(phrase, "gi"), "").trim();
  };

  const stopSpeechMetrics = () => {
    if (analyserFrameRef.current) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const generateRealtimeCoachingFeedback = async (
    candidateText: string,
    speechMetrics: SpeechMetrics
  ) => {
    if (!candidateText.trim()) return;
    if (!isStreamingRef.current) return;
    if (isGeneratingFeedbackRef.current) return;

    isGeneratingFeedbackRef.current = true;

    try {
      const res = await fetch("/api/whisper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "coaching_only",
          sessionId: session?.sessionId,
          answerTurnId: session?.answerTurnId,
          transcription: candidateText,
          history: historyRef.current,
          language,
          speechMetrics,
          latestVision: latestVision
            ? {
                behaviorRiskScore: latestVision.behaviorRiskScore,
                events: latestVision.events,
                states: latestVision.states,
              }
            : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Failed to generate realtime coaching feedback"
        );
      }

      setCoachingAnalysis(data.coachingAnalysis ?? null);
    } catch (err) {
      console.error("Error generating realtime coaching feedback:", err);
    } finally {
      isGeneratingFeedbackRef.current = false;
    }
  };

  const finishCurrentAnswerByVoice = async (endPhrase: string) => {
    if (!sessionRef.current.session || isEndingAnswerRef.current) {
      return;
    }

    isEndingAnswerRef.current = true;

    try {
      const browserTranscript =
        answerTranscriptRef.current || latestBrowserTranscriptRef.current;
      const answerAudioBlob = await stopRecorderAndBuildAnswerAudio();
      if (answerAudioBlob.size > 0) {
        await uploadAnswerAudio(
          answerAudioBlob,
          answerAudioMimeTypeRef.current,
          browserTranscript
        );
      }
      const speechMetrics = calculateSpeechMetrics(
        speechMetricsSessionRef.current,
        browserTranscript,
        language
      );

      await finishAnswer("voice_command", endPhrase, {
        browserTranscript,
        language,
        speechMetrics,
      });
      stopStreaming();
    } catch (err) {
      console.error("Failed to finish answer by voice command:", err);
      setError(
        language === "ko-KR"
          ? "답변 종료 처리 중 오류가 발생했습니다."
          : "Failed to finish the answer."
      );
      isEndingAnswerRef.current = false;
    }
  };

  const finishCurrentAnswerByButton = async () => {
    if (!sessionRef.current.session || isEndingAnswerRef.current) {
      return;
    }

    isEndingAnswerRef.current = true;

    try {
      const browserTranscript =
        answerTranscriptRef.current || latestBrowserTranscriptRef.current;
      const answerAudioBlob = await stopRecorderAndBuildAnswerAudio();
      if (answerAudioBlob.size > 0) {
        await uploadAnswerAudio(
          answerAudioBlob,
          answerAudioMimeTypeRef.current,
          browserTranscript
        );
      }
      const speechMetrics = calculateSpeechMetrics(
        speechMetricsSessionRef.current,
        browserTranscript,
        language
      );

      await finishAnswer("button", null, {
        browserTranscript,
        language,
        speechMetrics,
      });
      stopStreaming();
    } catch (err) {
      console.error("Failed to finish answer by button:", err);
      setError(
        language === "ko-KR"
          ? "답변 종료 처리 중 오류가 발생했습니다."
          : "Failed to finish the answer."
      );
      isEndingAnswerRef.current = false;
    }
  };

  const startStreaming = async () => {
    try {
      setError(null);

      if (!session) {
        const errorMessage =
          language === "ko-KR"
            ? "먼저 면접 세션을 시작해 주세요."
            : "Start an interview session first.";

        setError(errorMessage);
        onDataChange?.(null, errorMessage);
        return;
      }

      const recognition = createRecognition();

      if (!recognition) {
        const errorMessage =
          language === "ko-KR"
            ? "이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해 주세요."
            : "This browser does not support speech recognition. Please use Chrome.";

        setError(errorMessage);
        onDataChange?.(null, errorMessage);
        return;
      }

      recognition.onresult = async (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        const latestText = (finalTranscript || interimTranscript).trim();
        if (!latestText) return;
        latestBrowserTranscriptRef.current = latestText;

        const chunk: SimpleTranscriptionChunk = {
          transcription: latestText,
          timestamp: new Date().toISOString(),
          device: "browser-microphone",
          is_input: true,
          is_final: Boolean(finalTranscript.trim()),
        };

        setTranscription(chunk);
        onDataChange?.(chunk, null);

        if (finalTranscript.trim()) {
          const speakerName = language === "ko-KR" ? "나" : "You";
          const endPhrase = findAnswerEndPhrase(finalTranscript);
          const cleanedTranscript = stripAnswerEndPhrase(
            finalTranscript,
            endPhrase
          );
          const transcriptForHistory = cleanedTranscript || finalTranscript.trim();
          const newHistory =
            historyRef.current + `${speakerName}: ${transcriptForHistory}\n`;

          setHistory(newHistory);
          historyRef.current = newHistory;
          answerTranscriptRef.current = [
            answerTranscriptRef.current,
            cleanedTranscript,
          ]
            .filter(Boolean)
            .join(" ");

          if (answerTranscriptRef.current) {
            const speechMetrics = calculateSpeechMetrics(
              speechMetricsSessionRef.current,
              answerTranscriptRef.current,
              language
            );

            await generateRealtimeCoachingFeedback(
              answerTranscriptRef.current,
              speechMetrics
            );
          }

          if (endPhrase) {
            await finishCurrentAnswerByVoice(endPhrase);
          }
        }
      };

      recognition.onerror = () => {
        setError(
          language === "ko-KR"
            ? "음성 인식 중 오류가 발생했습니다. 마이크 권한과 Chrome 브라우저를 확인해 주세요."
            : "Speech recognition failed. Please check microphone permission and use Chrome."
        );
        setIsStreaming(false);
        isStreamingRef.current = false;
        stopSpeechMetrics();
      };

      recognition.onend = () => {
        if (isStreamingRef.current) {
          try {
            recognition.start();
          } catch {
            setIsStreaming(false);
            isStreamingRef.current = false;
            stopSpeechMetrics();
          }
        }
      };

      recognitionRef.current = recognition;
      await startSpeechMetrics();
      recognition.start();

      setIsStreaming(true);
      isStreamingRef.current = true;
      setAnswerRecording(true);
    } catch (err) {
      console.error("audio stream failed:", err);
      const errorMessage =
        err instanceof Error
          ? `Failed to start audio stream: ${err.message}`
          : "Failed to start audio stream";

      setError(errorMessage);
      onDataChange?.(null, errorMessage);
      setIsStreaming(false);
      isStreamingRef.current = false;
      stopSpeechMetrics();
    }
  };

  const stopStreaming = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopSpeechMetrics();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsStreaming(false);
    isStreamingRef.current = false;
    setAnswerRecording(false);
  };

  useEffect(() => {
    if (session?.status === "finished" && isStreamingRef.current) {
      stopStreaming();
    }
    // stopStreaming uses refs and should run only on session status changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
    // stopStreaming uses refs for unmount cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateSummary = async () => {
    const reportHistory =
      historyRef.current ||
      answerTranscriptRef.current ||
      latestBrowserTranscriptRef.current;
    const reportWindow =
      typeof window !== "undefined" ? window.open("", "_blank") : null;

    if (reportWindow) {
      reportWindow.document.write(
        "<!doctype html><title>Interview Summary</title><body style=\"font-family: system-ui, sans-serif; padding: 32px; color: #0f172a;\"><h1>Interview Summary</h1><p>보고서를 생성하는 중입니다...</p></body>"
      );
      reportWindow.document.close();
    }

    setLoading(true);
    setError(null);

    try {
      if (session?.status === "finished") {
        const response = await fetch(
          `${backendBaseUrl}/api/sessions/${session.sessionId}/report`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load backend report");
        }

        const report = data.report;
        const message = [
          `총 ${report.answeredQuestions}/${report.totalQuestions}개 질문 답변 완료`,
          "",
          "전체 요약",
          ...(report.overallSummary ?? []),
          "",
          "종합 피드백",
          report.overallFeedback?.content,
          report.overallFeedback?.nonverbal,
          "",
          "개선 포인트",
          ...(report.overallFeedback?.improvementPoints ?? []).map(
            (point: string, index: number) => `${index + 1}. ${point}`
          ),
          "",
          "다음 연습",
          report.nextPractice?.recommendedQuestion,
        ]
          .filter(Boolean)
          .join("\n");

        setSummary(message);

        if (reportWindow) {
          const reportKey = `interviewiq-summary-${Date.now()}`;
          localStorage.setItem(
            reportKey,
            JSON.stringify({
              summary: message,
              history: reportHistory,
              metrics,
              language,
              createdAt: new Date().toISOString(),
            })
          );
          reportWindow.location.href = `/summary?key=${encodeURIComponent(
            reportKey
          )}`;
        }
        return;
      }

      const response = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: JSON.stringify(metrics),
          history: reportHistory,
          language,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate summary");
      }

      const message = data.message ?? "";
      setSummary(message);

      if (reportWindow) {
        const reportKey = `interviewiq-summary-${Date.now()}`;
        localStorage.setItem(
          reportKey,
          JSON.stringify({
            summary: message,
            history: reportHistory,
            metrics,
            language,
            createdAt: new Date().toISOString(),
          })
        );
        reportWindow.location.href = `/summary?key=${encodeURIComponent(
          reportKey
        )}`;
      }
    } catch (err) {
      console.error("Error generating summary:", err);
      const message =
        language === "ko-KR"
          ? "요약 생성 중 오류가 발생했습니다."
          : "An error occurred while generating the summary.";
      setSummary(message);

      if (reportWindow) {
        reportWindow.document.body.innerHTML = `<h1>Interview Summary</h1><p>${message}</p>`;
      }
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusBadgeClass = (status: string) => {
    if (
      status.includes("좋음") ||
      status.includes("적절") ||
      status.includes("안정") ||
      status.includes("Good") ||
      status.includes("Appropriate") ||
      status.includes("Stable")
    ) {
      return "bg-green-500";
    }

    if (
      status.includes("개선") ||
      status.includes("높음") ||
      status.includes("부족") ||
      status.includes("Needs") ||
      status.includes("High") ||
      status.includes("Lacks")
    ) {
      return "bg-red-500";
    }

    return "bg-yellow-500 text-black";
  };

  const renderCoachingAnalysis = () => {
    const score = Math.min(
      Math.max(coachingAnalysis?.deliveryScore ?? 0, 0),
      100
    );

    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            {language === "ko-KR"
              ? "AI 말하기 평가 테스트"
              : "AI Speaking Check"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!coachingAnalysis ? (
            <p className="text-sm text-muted-foreground">
              {language === "ko-KR"
                ? "답변이 인식되면 말투, 긴장 신호, 단어 선택을 간단히 표시합니다."
                : "Once an answer is recognized, tone, tension signals, and word choice will appear here."}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {language === "ko-KR" ? "현재 말하기 상태" : "Current status"}
                </span>
                <Badge
                  className={getStatusBadgeClass(
                    coachingAnalysis.overallStatus
                  )}
                >
                  {coachingAnalysis.overallStatus}
                </Badge>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {language === "ko-KR" ? "전달력 점수" : "Delivery score"}
                  </span>
                  <span className="font-medium">{score}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full ${getScoreColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded bg-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {language === "ko-KR" ? "긴장 신호" : "Tension signal"}
                    </span>
                    <Badge
                      className={getStatusBadgeClass(
                        coachingAnalysis.confidenceSignal
                      )}
                    >
                      {coachingAnalysis.confidenceSignal}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-700">
                    {coachingAnalysis.toneFeedback}
                  </p>
                </div>

                <div className="rounded bg-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {language === "ko-KR" ? "단어 선택" : "Word choice"}
                    </span>
                    <Badge
                      className={getStatusBadgeClass(
                        coachingAnalysis.wordChoiceStatus
                      )}
                    >
                      {coachingAnalysis.wordChoiceStatus}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-700">
                    {coachingAnalysis.wordChoiceFeedback}
                  </p>
                </div>
              </div>

              <div className="rounded border border-slate-200 p-3 text-sm">
                <span className="font-medium">
                  {language === "ko-KR" ? "바로 적용할 팁: " : "Quick tip: "}
                </span>
                <span className="text-slate-700">
                  {coachingAnalysis.nextTip}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">답변 컨트롤</h2>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500">
              i
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            답변 시작과 종료를 이곳에서 제어하고, 실시간 인식 문장을 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <Button
              type="button"
              variant={language === "ko-KR" ? "default" : "ghost"}
              size="sm"
              onClick={() => setLanguage("ko-KR")}
              className={language === "ko-KR" ? "bg-white text-slate-950 shadow-sm hover:bg-white" : ""}
            >
              한국어
            </Button>
            <Button
              type="button"
              variant={language === "en-US" ? "default" : "ghost"}
              size="sm"
              onClick={() => setLanguage("en-US")}
              className={language === "en-US" ? "bg-white text-slate-950 shadow-sm hover:bg-white" : ""}
            >
              English
            </Button>
          </div>
          {history && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(history);
                setHistory("");
                historyRef.current = "";
                answerTranscriptRef.current = "";
                latestBrowserTranscriptRef.current = "";
                setInterviewerText("");
                setCoachingAnalysis(null);
                setSummary(null);
                setTranscription(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Current Question
          </span>
          <Badge className="bg-white text-blue-700 hover:bg-white">
            {session ? `Q${session.questionIndex}/${session.totalQuestions}` : "Ready"}
          </Badge>
        </div>
        <p className="mt-2 text-base font-semibold leading-7 text-slate-950">
          {session?.currentQuestion ??
            (language === "ko-KR"
              ? "세션을 시작하면 현재 질문이 표시됩니다."
              : "The current question appears after the session starts.")}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          onClick={isStreaming ? stopStreaming : startStreaming}
          size="sm"
          className={isStreaming ? "bg-slate-900" : "bg-blue-600 hover:bg-blue-700"}
        >
          {isStreaming ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Stop Streaming
            </>
          ) : (
            "답변 시작"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={finishCurrentAnswerByButton}
          disabled={!session || isFinishingAnswer || !isStreaming}
        >
          {isFinishingAnswer
            ? language === "ko-KR"
              ? "답변 종료 중"
              : "Finishing"
            : language === "ko-KR"
            ? "답변 종료"
            : "Finish Answer"}
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${
              isStreaming ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          {isStreaming ? "streaming" : "stopped"}
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">실시간 답변 인식</h3>
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {transcription?.is_final ? "final" : "live"}
            </Badge>
          </div>
          <div className="min-h-[92px] rounded bg-white p-3 text-sm leading-6 text-slate-700">
            {transcription?.transcription ||
              (language === "ko-KR"
                ? "답변이 인식되면 이곳에 표시됩니다."
                : "Recognized speech will appear here.")}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {language === "ko-KR" ? "면접관 응답" : "Interviewer's Response"}
            </h3>
            <Badge
              className={
                isStreaming
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-200"
              }
            >
              {isStreaming
                ? isFinishingAnswer
                  ? language === "ko-KR"
                    ? "제출 중"
                    : "Submitting"
                  : isResponding
                  ? language === "ko-KR"
                    ? "생성 중"
                    : "Generating"
                  : language === "ko-KR"
                  ? "듣는 중"
                  : "Listening"
                : "Off"}
            </Badge>
          </div>
          <div className="min-h-[92px] rounded bg-white p-3 text-sm leading-6 text-slate-700">
            {interviewerText ||
              (session
                ? session.currentQuestion
                : language === "ko-KR"
                ? "세션 시작 후 첫 질문이 표시됩니다."
                : "The first question appears after the session starts.")}
          </div>
        </div>
      </div>

      {renderCoachingAnalysis()}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {history ? "브라우저 transcript 기반 임시 요약 가능" : "답변 기록 대기 중"}
        </span>
        <Button
          onClick={generateSummary}
          disabled={loading}
          className="fixed bottom-6 right-6 z-40 bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Creating Summary
            </>
          ) : (
            "Interview Summary"
          )}
        </Button>
      </div>

      {summary && (
        <p className="mt-3 text-xs text-slate-500">
          요약 보고서를 새 탭으로 열었습니다.
        </p>
      )}
    </section>
  );
}
