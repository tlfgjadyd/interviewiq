import React, { useRef, useState } from "react";
import { Activity, Eye, Hand } from "lucide-react";
import { useInterviewSession } from "@/context/InterviewSessionContext";
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
  const panelRef = useRef<HTMLElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [panelPosition, setPanelPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { backendBaseUrl, session, isAnswerRecording, setLatestVision } =
    useInterviewSession();

  useCamera(videoRef);

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
