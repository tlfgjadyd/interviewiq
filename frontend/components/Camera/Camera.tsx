import React, { useEffect, useRef, useState } from "react";
import { Activity, Eye, Hand } from "lucide-react";
import { useInterviewSession } from "@/context/InterviewSessionContext";
import { authHeaders } from "@/lib/session-api";
import { useCamera } from "../../hooks/useCamera";
import { useMediapipe } from "../../hooks/useMediaPipe";

type CameraProps = {
  mode?: "floating" | "stage";
  showHeader?: boolean;
  showStatus?: boolean;
  pipSize?: "default" | "large";
};

const Camera: React.FC<CameraProps> = ({
  mode = "floating",
  showHeader = true,
  showStatus = true,
  pipSize = "default",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioSampleTimerRef = useRef<number | null>(null);
  const audioSamplesRef = useRef<Array<{ rms: number; peak: number; speaking: boolean }>>([]);
  const audioChunkIndexRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const uploadedSessionRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [panelPosition, setPanelPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { backendBaseUrl, session, isAnswerRecording, setLatestVision, setLatestAudioSignal } =
    useInterviewSession();

  useCamera(videoRef);

  useEffect(() => {
    if (!session || session.status !== "active" || recorderRef.current) {
      return;
    }

    let attempts = 0;
    const startRecorder = () => {
      attempts += 1;
      const stream = videoRef.current?.srcObject;
      if (!(stream instanceof MediaStream)) {
        if (attempts < 20) {
          window.setTimeout(startRecorder, 250);
        }
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        console.warn("[session-video-recorder-unavailable]");
        return;
      }

      try {
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        recordingStartedAtRef.current = performance.now();
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.start(1000);
        recorderRef.current = recorder;
        console.info("[session-video-recording-started]", session.sessionId);
      } catch (error) {
        console.warn("[session-video-recording-start-failed]", error);
      }
    };

    startRecorder();
  }, [session]);

  useEffect(() => {
    if (!session || session.status !== "finished") {
      return;
    }
    if (uploadedSessionRef.current === session.sessionId) {
      return;
    }

    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    uploadedSessionRef.current = session.sessionId;
    recorderRef.current = null;
    const stoppedAt = performance.now();
    const startedAt = recordingStartedAtRef.current ?? stoppedAt;

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      chunksRef.current = [];
      if (!blob.size) {
        console.warn("[session-video-empty]");
        return;
      }

      try {
        const durationMs = Math.max(0, Math.round(stoppedAt - startedAt));
        const uploadResponse = await fetch(
          `${backendBaseUrl}/api/sessions/${session.sessionId}/assets/upload-url`,
          {
            method: "POST",
            headers: authHeaders({
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({
              assetType: "session_video",
              mimeType: blob.type || "video/webm",
              fileSizeBytes: blob.size,
              durationMs,
              extension: "webm",
            }),
          }
        );
        if (!uploadResponse.ok) {
          throw new Error(`upload-url failed: ${uploadResponse.status}`);
        }

        const upload = (await uploadResponse.json()) as {
          assetId: string;
          objectKey: string;
          uploadUrl: string;
        };
        const putResponse = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": blob.type || "video/webm",
          },
          body: blob,
        });
        if (!putResponse.ok) {
          throw new Error(`R2 upload failed: ${putResponse.status}`);
        }

        const completeResponse = await fetch(
          `${backendBaseUrl}/api/sessions/${session.sessionId}/assets/complete`,
          {
            method: "POST",
            headers: authHeaders({
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({
              assetId: upload.assetId,
              objectKey: upload.objectKey,
              mimeType: blob.type || "video/webm",
              fileSizeBytes: blob.size,
              durationMs,
              status: "uploaded",
            }),
          }
        );
        if (!completeResponse.ok) {
          throw new Error(`asset complete failed: ${completeResponse.status}`);
        }
        console.info("[session-video-uploaded]", session.sessionId);
      } catch (error) {
        console.warn("[session-video-upload-failed]", error);
      }
    };

    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch (error) {
      console.warn("[session-video-recording-stop-failed]", error);
    }
  }, [backendBaseUrl, session]);

  const {
    handPresence,
    facePresence,
    posePresence,
    isHandOnScreenRef,
    notFacingRef,
    hasBadPostureRef,
  } = useMediapipe(videoRef, canvasRef, true, {
    enabled: session?.status === "active" && isAnswerRecording,
    sessionId: session?.sessionId,
    answerTurnId: session?.answerTurnId,
    chunkMs: session?.chunkMs,
    turnStartedAtMs: session?.turnStartedAtMs,
    backendBaseUrl,
    questionContext: {
      questionType: "unknown",
      answerPhase: "middle",
    },
    onVisionAnalysis: setLatestVision,
  });

  useEffect(() => {
    if (!session || session.status !== "active" || !isAnswerRecording) {
      if (audioTimerRef.current) window.clearInterval(audioTimerRef.current);
      if (audioSampleTimerRef.current) window.clearInterval(audioSampleTimerRef.current);
      audioTimerRef.current = null;
      audioSampleTimerRef.current = null;
      audioSamplesRef.current = [];
      setLatestAudioSignal(null);
      return;
    }

    let attempts = 0;
    const startAudioAnalysis = () => {
      attempts += 1;
      const stream = videoRef.current?.srcObject;
      if (!(stream instanceof MediaStream) || !stream.getAudioTracks().length) {
        if (attempts < 20) window.setTimeout(startAudioAnalysis, 250);
        return;
      }
      if (audioContextRef.current) return;

      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      audioSamplesRef.current = [];
      audioChunkIndexRef.current = 0;
      const data = new Uint8Array(analyser.fftSize);
      const answerStartedAt = session.turnStartedAtMs;

      audioSampleTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        let peak = 0;
        for (const value of data) {
          const normalized = (value - 128) / 128;
          sumSquares += normalized * normalized;
          peak = Math.max(peak, Math.abs(normalized));
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const speaking = rms >= 0.018;
        audioSamplesRef.current.push({
          rms,
          peak,
          speaking,
        });
        setLatestAudioSignal({
          rmsVolume: rms,
          peakVolume: peak,
          isSpeakingRatio: speaking ? 1 : 0,
          silenceDurationMs: speaking ? 0 : 100,
          volumeWarning: rms < 0.01 ? "too_low" : rms > 0.28 ? "too_high" : "normal",
          paceHint: "normal",
          measuredAtMs: performance.now(),
        });
      }, 100);

      audioTimerRef.current = window.setInterval(() => {
        const samples = audioSamplesRef.current;
        audioSamplesRef.current = [];
        if (!samples.length) return;

        const speakingCount = samples.filter((sample) => sample.speaking).length;
        const isSpeakingRatio = speakingCount / samples.length;
        const rmsVolume =
          samples.reduce((sum, sample) => sum + sample.rms, 0) / samples.length;
        const peakVolume = Math.max(...samples.map((sample) => sample.peak));
        const silenceDurationMs = Math.round((1 - isSpeakingRatio) * (session.chunkMs || 5000));
        const chunkIndex = audioChunkIndexRef.current + 1;
        audioChunkIndexRef.current = chunkIndex;
        const elapsed = Math.max(0, Math.round(performance.now() - answerStartedAt));
        const t1 = elapsed;
        const t0 = Math.max(0, t1 - (session.chunkMs || 5000));
        const paceHint =
          isSpeakingRatio < 0.25 ? "slow" : isSpeakingRatio > 0.9 ? "fast" : "normal";
        const volumeWarning =
          rmsVolume < 0.01 ? "too_low" : rmsVolume > 0.28 ? "too_high" : "normal";
        const formData = new FormData();
        const silentBlob = new Blob([new Uint8Array(1)], { type: "audio/webm" });
        formData.append("audio", silentBlob, `audio_${chunkIndex}.webm`);
        formData.append(
          "metadata",
          JSON.stringify({
            chunkId: `audio_${String(chunkIndex).padStart(3, "0")}`,
            answerTurnId: session.answerTurnId,
            t0,
            t1,
            mimeType: "audio/webm",
            language: "ko-KR",
            realtimeAudioSignals: {
              rmsVolume,
              peakVolume,
              isSpeakingRatio,
              silenceDurationMs,
              volumeWarning,
              paceHint,
            },
          })
        );

        fetch(`${backendBaseUrl}/api/sessions/${session.sessionId}/audio-chunks`, {
          method: "POST",
          body: formData,
        }).catch((error) => console.warn("[audio-chunk-send-failed]", error));
      }, session.chunkMs || 5000);
    };

    startAudioAnalysis();

    return () => {
      if (audioTimerRef.current) window.clearInterval(audioTimerRef.current);
      if (audioSampleTimerRef.current) window.clearInterval(audioSampleTimerRef.current);
      audioTimerRef.current = null;
      audioSampleTimerRef.current = null;
      audioSamplesRef.current = [];
      setLatestAudioSignal(null);
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, [backendBaseUrl, isAnswerRecording, session, setLatestAudioSignal]);

  const states = [
    ["손", isHandOnScreenRef.current ? "주의" : "정상", isHandOnScreenRef.current],
    ["시선", notFacingRef.current ? "주의" : "정상", notFacingRef.current],
    ["자세", hasBadPostureRef.current ? "주의" : "정상", hasBadPostureRef.current],
  ] as const;

  const movePanel = (clientX: number, clientY: number) => {
    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const margin = 16;
    const nextX = Math.min(
      Math.max(clientX - dragOffsetRef.current.x, margin),
      window.innerWidth - rect.width - margin
    );
    const nextY = Math.min(
      Math.max(clientY - dragOffsetRef.current.y, margin),
      window.innerHeight - rect.height - margin
    );

    setPanelPosition({ x: nextX, y: nextY });
  };

  const startDraggingPanel = (event: React.PointerEvent<HTMLElement>) => {
    if (mode === "stage" || window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setPanelPosition({ x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dragPanel = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      movePanel(event.clientX, event.clientY);
    }
  };

  const stopDraggingPanel = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const panelClassName =
    mode === "stage"
      ? "relative z-10 h-full min-h-[420px] w-full overflow-hidden rounded-lg border border-white/15 bg-slate-950 text-white shadow-2xl shadow-black/20"
      : pipSize === "large"
      ? "absolute bottom-[18%] right-[3.2%] z-30 w-[min(760px,46vw)] min-w-[560px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950/82 text-white shadow-2xl shadow-black/30 backdrop-blur-md max-xl:w-[520px] max-xl:min-w-[440px] max-lg:static max-lg:w-full max-lg:min-w-0"
      : "absolute bottom-12 right-8 z-30 w-[320px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950/82 text-white shadow-2xl shadow-black/30 backdrop-blur-md max-xl:w-[280px] max-lg:static max-lg:w-full";
  const videoShellClassName =
    mode === "stage"
      ? "h-full min-h-[360px] overflow-hidden bg-slate-900"
      : "mx-4 overflow-hidden rounded-lg bg-slate-900";
  const videoFrameClassName =
    mode === "stage"
      ? "relative h-full min-h-[360px] w-full"
      : "relative aspect-video w-full";

  return (
    <section
      ref={panelRef}
      className={panelClassName}
      style={
        mode === "floating" && panelPosition
          ? {
              left: panelPosition.x,
              top: panelPosition.y,
              bottom: "auto",
              right: "auto",
            }
          : undefined
      }
    >
      {showHeader ? (
        <div
          className={`flex touch-none select-none items-center gap-2 px-4 py-3 text-sm font-semibold ${
            mode === "floating" ? "cursor-move" : ""
          }`}
          onPointerDown={startDraggingPanel}
          onPointerMove={dragPanel}
          onPointerUp={stopDraggingPanel}
          onPointerCancel={stopDraggingPanel}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          사용자 화면
        </div>
      ) : null}

      <div className={videoShellClassName}>
        <div className={videoFrameClassName}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            className="absolute inset-0 h-full w-full"
            style={{ backgroundColor: "transparent" }}
          />
        </div>
      </div>

      {showStatus ? (
        <div className="grid grid-cols-3 border-t border-white/10">
          {states.map(([label, status, active]) => {
            const Icon =
              label === "손" ? Hand : label === "시선" ? Eye : Activity;

            return (
              <div
                key={label}
                className="border-r border-white/10 px-3 py-3 text-center last:border-r-0"
              >
                <div className="flex items-center justify-center gap-1 text-xs font-semibold text-white/80">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <span
                  className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                    active
                      ? "bg-amber-500/18 text-amber-300"
                      : "bg-emerald-500/18 text-emerald-300"
                  }`}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="sr-only">
        <span>{handPresence ? "hand detected" : "hand not detected"}</span>
        <span>{facePresence ? "face detected" : "face not detected"}</span>
        <span>{posePresence ? "pose detected" : "pose not detected"}</span>
      </div>
    </section>
  );
};

export default Camera;
