"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronDown,
  Clock,
  HelpCircle,
  Info,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediapipe } from "@/hooks/useMediaPipe";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const TOTAL_SECONDS = 30;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

type CalibrationStatus = {
  face: boolean;
  upperBody: boolean;
  hands: boolean;
  knees: boolean;
  distance: boolean;
};

const checklist = [
  { title: "얼굴 인식", key: "face" as const },
  { title: "상체 인식", key: "upperBody" as const },
  { title: "양손 인식", key: "hands" as const },
  { title: "양무릎 인식", key: "knees" as const },
  { title: "거리 적정", key: "distance" as const },
];

const createBaselinePayload = () => ({
  createdAt: new Date().toISOString(),
  durationSeconds: TOTAL_SECONDS,
  status: "completed",
  baseline_gaze: { calibration: "front-facing" },
  baseline_posture: { calibration: "full-seated-upper-body-with-knees" },
  baseline_hand: { calibration: "hands-visible-on-knees" },
  baseline_motion: { calibration: "stable-seated" },
});

const isVisibleLandmark = (landmark?: NormalizedLandmark) => {
  if (!landmark) return false;

  const visibility = landmark.visibility ?? 1;
  return (
    visibility >= 0.5 &&
    landmark.x >= 0 &&
    landmark.x <= 1 &&
    landmark.y >= 0 &&
    landmark.y <= 1
  );
};

export default function BaselinePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CalibrationStatus>({
    face: false,
    upperBody: false,
    hands: false,
    knees: false,
    distance: false,
  });

  const progress = useMemo(
    () => Math.round(((TOTAL_SECONDS - secondsLeft) / TOTAL_SECONDS) * 100),
    [secondsLeft]
  );
  const isComplete = secondsLeft === 0;
  const isFrameReady = Object.values(calibration).every(Boolean);

  useMediapipe(videoRef, canvasRef, false, {
    onCalibrationFrame: ({ facePresence, handPresence, poseLandmarks }) => {
      const leftShoulder = poseLandmarks?.[LEFT_SHOULDER];
      const rightShoulder = poseLandmarks?.[RIGHT_SHOULDER];
      const leftHip = poseLandmarks?.[LEFT_HIP];
      const rightHip = poseLandmarks?.[RIGHT_HIP];
      const leftKnee = poseLandmarks?.[LEFT_KNEE];
      const rightKnee = poseLandmarks?.[RIGHT_KNEE];
      const hasUpperBody =
        isVisibleLandmark(leftShoulder) &&
        isVisibleLandmark(rightShoulder) &&
        isVisibleLandmark(leftHip) &&
        isVisibleLandmark(rightHip);
      const hasKnees =
        isVisibleLandmark(leftKnee) && isVisibleLandmark(rightKnee);

      setCalibration({
        face: facePresence,
        upperBody: hasUpperBody,
        hands: handPresence,
        knees: hasKnees,
        distance: hasUpperBody && hasKnees,
      });
    },
  });

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setCameraReady(true);
      } catch {
        setCameraError("카메라 권한을 확인해 주세요.");
      }
    };

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!isRunning || secondsLeft === 0) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0) {
      setIsRunning(false);
      localStorage.setItem(
        "interviewiq-baseline",
        JSON.stringify(createBaselinePayload())
      );
      router.replace("/interview?autoStart=1");
    }
  }, [router, secondsLeft]);

  const reset = () => {
    setSecondsLeft(TOTAL_SECONDS);
    setIsRunning(false);
    localStorage.removeItem("interviewiq-baseline");
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] pb-24 text-slate-950">
      <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold">AI 모의면접</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-500">
            <span>홈</span>
            <span>›</span>
            <span>면접 준비</span>
            <span>›</span>
            <span className="text-slate-900">베이스라인 측정</span>
          </nav>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <HelpCircle className="h-5 w-5" />
            도움말
          </div>
          <div className="relative">
            <Bell className="h-5 w-5 text-slate-600" />
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              3
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-slate-300" />
            <span className="font-semibold">김민준</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </div>
        </div>
      </header>

      <div className="px-16 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="border-l-4 border-blue-600 pl-4 text-3xl font-bold">
              베이스라인 측정 준비
            </h1>
            <p className="mt-3 pl-5 text-base text-slate-600">
              정확한 분석을 위해 기본 자세를 맞춰주세요
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-blue-600 shadow-sm">
              <Clock className="h-6 w-6" />
              <span className="text-lg">남은 시간</span>
              <span className="text-2xl font-bold">{secondsLeft}s</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="h-14 rounded-xl bg-white px-8 text-base font-semibold"
            >
              <RefreshCw className="h-5 w-5" />
              카메라 재설정
            </Button>
          </div>
        </div>

        <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_390px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
            <div className="relative aspect-[16/8.5]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ backgroundColor: "transparent" }}
              />
              <div className="absolute inset-0 bg-black/38" />

              <div className="absolute left-5 top-5 rounded-xl bg-black/70 px-4 py-3 text-sm font-bold text-white backdrop-blur">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                카메라 연결됨
              </div>
              <div className="absolute left-1/2 top-7 -translate-x-1/2 text-xl font-bold text-white">
                가이드라인에 맞춰 앉아주세요
              </div>

              <div className="pointer-events-none absolute inset-0">
                {[
                  ["눈높이", "top-[26%]"],
                  ["어깨선", "top-[44%]"],
                  ["무릎선", "top-[82%]"],
                ].map(([label, top]) => (
                  <div key={label} className={`absolute inset-x-[13%] ${top}`}>
                    <span className="absolute -top-3 -translate-x-[115%] text-base font-bold text-blue-300">
                      {label}
                    </span>
                    <span className="block border-t border-dashed border-blue-200/75" />
                  </div>
                ))}

                <div className="absolute left-1/2 top-[8%] h-[92%] w-[min(42%,440px)] -translate-x-1/2">
                  <svg
                    className="h-full w-full"
                    viewBox="0 0 160 220"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path
                      d="M80 6
                         C62 6 50 19 50 39
                         C50 52 57 62 67 66
                         C57 69 48 75 42 85
                         C35 96 31 112 28 132
                         C22 138 19 149 18 164
                         C17 184 22 203 34 214
                         L60 214
                         C55 202 53 188 56 174
                         C58 162 66 154 80 154
                         C94 154 102 162 104 174
                         C107 188 105 202 100 214
                         L126 214
                         C138 203 143 184 142 164
                         C141 149 138 138 132 132
                         C129 112 125 96 118 85
                         C112 75 103 69 93 66
                         C103 62 110 52 110 39
                         C110 19 98 6 80 6 Z"
                      fill="none"
                      stroke="rgba(59,130,246,0.98)"
                      strokeWidth="2.1"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>

              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-sm text-white">
                  {cameraError ?? "카메라를 준비하는 중입니다."}
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold">측정 체크리스트</h2>
            <div className="mt-7 space-y-8">
              {checklist.map((item) => {
                const active = calibration[item.key];

                return (
                  <div key={item.title} className="flex items-center gap-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-xl font-bold">
                      {item.title}
                    </span>
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-bold ${
                        active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {active ? "완료" : "확인 중"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex gap-3">
                <Info className="h-5 w-5 shrink-0 text-blue-600" />
                <p className="text-base leading-7 text-slate-700">
                  얼굴, 어깨, 손, 무릎이 화면에 보이면 측정이 시작됩니다.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-24 items-center justify-between border-t border-slate-200 bg-white px-16">
        <div className="flex items-center gap-4 text-lg text-slate-700">
          <Lightbulb className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-blue-600">TIP</span>
          <span>정면을 바라보고, 등을 곧게 펴고 앉아주세요.</span>
        </div>

        <div className="flex items-center gap-5">
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            className="h-14 min-w-[220px] rounded-xl bg-white text-lg font-semibold"
          >
            <RefreshCw className="h-5 w-5" />
            다시 맞추기
          </Button>
          <Button
            type="button"
            onClick={() => setIsRunning(true)}
            disabled={!cameraReady || !isFrameReady || isRunning || isComplete}
            className="h-14 min-w-[250px] rounded-xl bg-blue-600 text-lg font-bold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                측정 중
              </>
            ) : (
              <>
                <Play className="h-5 w-5 fill-white" />
                측정 시작
              </>
            )}
          </Button>
        </div>
      </footer>
    </main>
  );
}
