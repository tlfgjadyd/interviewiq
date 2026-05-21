import React, { useRef, useState } from "react";
import { useCamera } from "../../hooks/useCamera";
import { useMediapipe } from "../../hooks/useMediaPipe";
import { Switch } from "@/components/ui/switch";
import { Label } from "@radix-ui/react-label";
import { Badge } from "@/components/ui/badge";
import { Activity, Eye, Hand, Maximize2 } from "lucide-react";
import { useInterviewSession } from "@/context/InterviewSessionContext";

const Camera: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [overlayEnabled, setOverlayEnabled] = useState(true);
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
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
    isHandOnScreenRef,
    notFacingRef,
    hasBadPostureRef
  } = useMediapipe(videoRef, canvasRef, overlayEnabled, {
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

  const monitorItems = [
    {
      icon: Hand,
      title: "손동작",
      status: isHandOnScreenRef.current ? "주의" : "안정",
      active: isHandOnScreenRef.current,
      count: handDetectionCounter,
      detail: `${handDetectionDuration.toFixed(1)}s`,
    },
    {
      icon: Eye,
      title: "시선",
      status: notFacingRef.current ? "위험" : "안정",
      active: notFacingRef.current,
      count: notFacingCounter,
      detail: `${notFacingDuration.toFixed(1)}s`,
    },
    {
      icon: Activity,
      title: "자세",
      status: hasBadPostureRef.current ? "주의" : "안정",
      active: hasBadPostureRef.current,
      count: badPostureDetectionCounter,
      detail: `${badPostureDuration.toFixed(1)}s`,
    },
  ];

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
    if (window.matchMedia("(max-width: 1023px)").matches) {
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
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    movePanel(event.clientX, event.clientY);
  };

  const stopDraggingPanel = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={panelRef}
      className="fixed bottom-6 left-24 z-30 w-[340px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl shadow-slate-950/10 max-xl:left-6 max-lg:static max-lg:w-full max-lg:shadow-sm"
      style={
        panelPosition
          ? {
              left: panelPosition.x,
              top: panelPosition.y,
              bottom: "auto",
            }
          : undefined
      }
    >
      <div
        className="mb-3 flex cursor-move touch-none select-none items-center justify-between gap-3"
        onPointerDown={startDraggingPanel}
        onPointerMove={dragPanel}
        onPointerUp={stopDraggingPanel}
        onPointerCancel={stopDraggingPanel}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">면접 영상 분석</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            PiP 모니터링 · 드래그로 이동
          </p>
        </div>
        <div
          className="flex cursor-default items-center space-x-2 rounded-lg bg-slate-100 px-2 py-1.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Switch
            id="overlay-toggle"
            checked={overlayEnabled}
            onCheckedChange={() => setOverlayEnabled((prev) => !prev)}
          />
          <Label htmlFor="overlay-toggle" className="text-xs text-slate-600">
            {overlayEnabled ? "Overlay" : "Clean"}
          </Label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
        <div className="relative aspect-video w-full">
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
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            LIVE ANALYSIS
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-black/45 p-1.5 text-white backdrop-blur">
            <Maximize2 className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {monitorItems.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon className="h-3.5 w-3.5 text-slate-600" />
                <span className="truncate">
                  {item.title}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-1">
                <Badge
                  className={`px-1.5 py-0 text-[10px] ${
                    item.active
                      ? "bg-red-100 text-red-700 hover:bg-red-100"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {item.status}
                </Badge>
                <span className="font-mono text-[10px] text-slate-500">
                  {item.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sr-only">
        <span>{handPresence ? "hand detected" : "hand not detected"}</span>
        <span>{facePresence ? "face detected" : "face not detected"}</span>
        <span>{posePresence ? "pose detected" : "pose not detected"}</span>
      </div>
    </section>
  );
};

export default Camera;
