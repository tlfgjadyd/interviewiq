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
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { BaselineFrameGuide } from "@/components/baseline/BaselineFrameGuide";
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
  { title: "프레임 적합", key: "distance" as const },
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
  const [isRunning, setIsRunning] = useState(true);
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
    setIsRunning(true);
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

              <BaselineFrameGuide />
              <div className="hidden">
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

                <div className="absolute left-1/2 top-[7%] h-[90%] w-[min(36%,404px)] -translate-x-1/2">
                  <svg
                    className="h-full w-full"
                    viewBox="0 0 404 553"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path
                      d="M31.5001 379.088C32.9819 381.986 32.7836 384.993 33.0001 388.088C33.0361 391.378 32.894 392.832 32.5001 395.088C31.5222 396.888 30.9752 397.721 30.0001 399.088C22.7934 403.889 19.2344 407.002 13.5001 413.088C9.47021 421.089 7.53265 425.577 5.00012 433.588C2.95916 443.77 2.17525 449.046 1.50012 457.588C0.915495 466.579 0.68835 471.615 0.500122 480.588C0.709591 490.514 0.944018 495.471 1.50012 503.588C2.2407 513.401 2.70099 522.818 4.00018 531.588C4.89445 541.802 6.43708 543.203 7.50018 552.088"
                      fill="none"
                      stroke="rgba(59,130,246,0.98)"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d="M396.5 552.588L400.5 518.588C402.773 489.419 403.571 473.439 401 448.088C399.411 439.407 397.457 431.138 390 412.588C378.351 402.198 373.889 398.757 373.5 394.088C372.9 386.658 374.801 380.902 379.5 373.088C381.985 366.938 381.965 363.271 382.5 355.588C382.5 346.588 382.5 341.088 381.5 331.588C370.107 293.462 363.181 272.272 350.5 234.588C348.713 229.154 349 227.088 335.5 200.588C322 174.088 288.4 169.148 276.5 165.526C264.6 161.904 269.715 163.588 257 160.026C244.285 156.464 252 141.588 252 141.588C252 141.588 259.079 134.732 266 124.588C275.252 106.992 276.524 99.8927 278 81.5882C278.07 68.863 277.374 61.5458 268.5 40.0881C254.001 20.1289 239.655 6.30942 216 1.08814C190.508 -1.20615 177.279 2.92391 157.5 18.5882C138.577 39.8929 130.056 56.4989 130.5 85.0881C134.138 112.079 138.612 122.01 155.5 141.588C161.451 141.987 159.367 156.001 157.5 157.588C155.634 159.175 111.5 171.588 111.5 171.588C101.149 176.036 96.0002 179.088 89.5002 183.088C83.0002 187.088 76.8903 195.153 67.0002 213.088C58.6791 233.325 41.9798 275.105 28.0002 331.088C26.4 341.162 25.7981 346.94 25.5002 357.588C25.4807 361.664 27.8352 369.476 31.5002 379.088"
                      fill="none"
                      stroke="rgba(59,130,246,0.98)"
                      strokeWidth="3"
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
            disabled
            className="h-14 min-w-[250px] rounded-xl bg-blue-600 text-lg font-bold text-white disabled:bg-blue-600 disabled:text-white disabled:opacity-100"
          >
            {isFrameReady ? (
              <>
                <Check className="h-5 w-5" />
                {secondsLeft}초 후 자동 시작
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                프레임 맞추는 중
              </>
            )}
          </Button>
        </div>
      </footer>
    </main>
  );
}
