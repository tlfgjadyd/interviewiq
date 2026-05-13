"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useMetrics } from "@/context/MetricsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInterviewSession } from "@/context/InterviewSessionContext";
import { getChunkTimingByIndex } from "@/lib/chunking";

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
  const { backendBaseUrl, session, latestVision, finishAnswer, isFinishingAnswer } =
    useInterviewSession();
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
  const audioChunkIndexRef = useRef(0);
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
    audioChunkIndexRef.current = 0;
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
    startAudioChunkRecorder(stream);

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

  const sendAudioChunk = async (
    audioBlob: Blob,
    chunkIndex: number,
    mimeType: string
  ) => {
    const currentSession = sessionRef.current.session;

    if (!currentSession) {
      return;
    }

    const timing = getChunkTimingByIndex(chunkIndex, currentSession.chunkMs);
    const metadata = {
      chunkId: timing.chunkId,
      answerTurnId: currentSession.answerTurnId,
      t0: timing.t0,
      t1: timing.t1,
      mimeType,
      language,
      browserTranscript:
        answerTranscriptRef.current || latestBrowserTranscriptRef.current,
      browserLatestText: latestBrowserTranscriptRef.current,
    };
    const formData = new FormData();

    formData.append("audio", audioBlob, `${timing.chunkId}.webm`);
    formData.append("metadata", JSON.stringify(metadata));

    try {
      const response = await fetch(
        `${sessionRef.current.backendBaseUrl}/api/sessions/${currentSession.sessionId}/audio-chunks`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`audio chunk failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send audio chunk:", error);
    }
  };

  const startAudioChunkRecorder = (stream: MediaStream) => {
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

    audioChunkIndexRef.current = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }

      const chunkIndex = audioChunkIndexRef.current;
      audioChunkIndexRef.current += 1;

      void sendAudioChunk(
        event.data,
        chunkIndex,
        recorder.mimeType || preferredMimeType || "audio/webm"
      );
    };
    recorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
    };
    recorder.start(currentSession.chunkMs);
    mediaRecorderRef.current = recorder;
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
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.requestData();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const browserTranscript =
        answerTranscriptRef.current || latestBrowserTranscriptRef.current;
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
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.requestData();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const browserTranscript =
        answerTranscriptRef.current || latestBrowserTranscriptRef.current;
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
  };

  useEffect(() => {
    return () => {
      stopStreaming();
    };
    // stopStreaming uses refs for unmount cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: JSON.stringify(metrics),
          history,
          language,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate summary");
      }

      setSummary(data.message ?? "");
    } catch (err) {
      console.error("Error generating summary:", err);
      setSummary(
        language === "ko-KR"
          ? "요약 생성 중 오류가 발생했습니다."
          : "An error occurred while generating the summary."
      );
    } finally {
      setLoading(false);
    }
  };

  const renderTranscriptionContent = (
    transcription: SimpleTranscriptionChunk | null
  ) => {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-col text-slate-600">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">timestamp: </span>
              <span>
                {transcription
                  ? new Date(transcription.timestamp).toLocaleString()
                  : ""}
              </span>
            </div>
            <div>
              <span className="font-semibold">device: </span>
              <span>{transcription ? transcription.device : ""}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">type: </span>
              <span>
                {transcription
                  ? transcription.is_input
                    ? "Input"
                    : "Output"
                  : ""}
              </span>
            </div>
            <div>
              <span className="font-semibold">final: </span>
              <span>
                {transcription ? (transcription.is_final ? "Yes" : "No") : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-100 rounded p-2 overflow-auto max-h-[100px] whitespace-pre-wrap font-mono text-xs">
          {transcription ? transcription.transcription : ""}
        </div>

        <div className="mt-2">
          <div className="text-slate-600 font-semibold mb-1">History:</div>
          <div className="bg-slate-100 rounded p-2 overflow-auto h-[130px] whitespace-pre-wrap font-mono text-xs">
            {history}
          </div>
        </div>
      </div>
    );
  };

  const renderSummaryContent = () => {
    return (
      <div className="mt-2">
        <div className="text-slate-600 font-semibold mb-1">Summary:</div>
        <div className="bg-slate-100 rounded p-2 overflow-auto h-[130px] whitespace-pre-wrap font-mono text-xs">
          {summary}
        </div>
      </div>
    );
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
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={language === "ko-KR" ? "default" : "outline"}
            size="sm"
            onClick={() => setLanguage("ko-KR")}
          >
            한국어
          </Button>
          <Button
            type="button"
            variant={language === "en-US" ? "default" : "outline"}
            size="sm"
            onClick={() => setLanguage("en-US")}
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
            Clear History
          </Button>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button onClick={isStreaming ? stopStreaming : startStreaming} size="sm">
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
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {renderTranscriptionContent(transcription)}

      {renderCoachingAnalysis()}

      <div className="flex items-center gap-1.5 text-right justify-end">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isStreaming ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <span className="text-xs text-gray-500 font-mono">
          {isStreaming ? "streaming" : "stopped"}
        </span>
      </div>

      <Button onClick={generateSummary}>
        {loading ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Creating Summary
          </>
        ) : (
          "Interview Summary"
        )}
      </Button>

      {summary && renderSummaryContent()}

      <Card className="mt-10">
        <CardHeader className="pb-2 bottom-0">
          <CardTitle className="text-lg flex items-center gap-2">
            {language === "ko-KR"
              ? "면접관 응답"
              : "Interviewer's Response"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status:</span>
              <Badge
                variant={
                  isStreaming && (isResponding || isFinishingAnswer)
                    ? "destructive"
                    : "default"
                }
                className={
                  isStreaming
                    ? isResponding || isFinishingAnswer
                      ? "bg-red-500"
                      : "bg-green-500"
                    : "bg-red-500"
                }
              >
                {isStreaming
                  ? isFinishingAnswer
                    ? language === "ko-KR"
                      ? "답변 분석 요청 중입니다"
                      : "Submitting answer"
                    : isResponding
                    ? language === "ko-KR"
                      ? "응답 생성 중입니다. 잠시만 기다려 주세요"
                      : "Generating a response, please wait"
                    : language === "ko-KR"
                    ? "듣는 중"
                    : "Listening"
                  : "Off"}
              </Badge>
            </div>
          </div>

          {error && <p>{error}</p>}

          {interviewerText && (
            <div className="bg-slate-100 rounded p-3 whitespace-pre-wrap text-sm">
              {interviewerText}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
