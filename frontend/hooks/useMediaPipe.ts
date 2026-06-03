import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { initializeHandDetection } from "../lib/mediapipe/handDetection";
import { initializeFaceDetection } from "../lib/mediapipe/faceDetection";
import { initializePoseDetection } from "../lib/mediapipe/poseDetection";
import {
  analyzeInterviewPosture,
  createAggregatedVisionChunk,
  isFacingForward,
  isBadPosture,
  type AnalyzeInterviewPostureInput,
  type InterviewBehaviorAnalysis,
  type QuestionContext,
  type VisionChunkSample,
} from "../lib/analytics";
import {
  drawHandLandmarks,
  drawFaceMeshLandmarks,
  drawPoseLandmarkers,
} from "../lib/drawing";
import { useMetrics } from "@/context/MetricsContext";
import { getCompletedChunkTiming } from "@/lib/chunking";

export type UseMediaPipeOptions = {
  sessionId?: string;
  answerTurnId?: string;
  chunkMs?: number;
  turnStartedAtMs?: number;
  backendBaseUrl?: string;
  enabled?: boolean;
  questionContext?: QuestionContext;
  onVisionAnalysis?: (analysis: InterviewBehaviorAnalysis) => void;
  onCalibrationFrame?: (frame: {
    handPresence: boolean;
    facePresence: boolean;
    posePresence: boolean;
    poseLandmarks?: AnalyzeInterviewPostureInput["poseLandmarks"];
  }) => void;
};

export const useMediapipe = (
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  overlayEnabled: boolean,
  options: UseMediaPipeOptions = {}
) => {
  const [handPresence, setHandPresence] = useState(false);
  const [facePresence, setFacePresence] = useState(false);
  const [posePresence, setPosePresence] = useState(false);

  const [handDetectionCounter, setHandDetectionCounter] = useState(0);
  const [handDetectionDuration, setHandDetectionDuration] = useState(0);
  const [notFacingCounter, setNotFacingCounter] = useState(0);
  const [notFacingDuration, setNotFacingDuration] = useState(0);
  const [badPostureDetectionCounter, setBadPostureDetectionCounter] =
    useState(0);
  const [badPostureDuration, setBadPostureDuration] = useState(0);

  const isHandOnScreenRef = useRef(false);
  const handDetectionStartTimeRef = useRef(0);
  const notFacingStartTimeRef = useRef<number | null>(null);
  const notFacingRef = useRef(false);
  const hasBadPostureRef = useRef(false);
  const badPostureStartTimeRef = useRef(0);

  const handDetectorRef = useRef<HandLandmarker | null>(null);
  const faceDetectorRef = useRef<FaceLandmarker | null>(null);
  const poseDetectorRef = useRef<PoseLandmarker | null>(null);
  const previousFrameRef = useRef<
    NonNullable<AnalyzeInterviewPostureInput["previousFrame"]> | null
  >(null);
  const previousEmaRef = useRef<AnalyzeInterviewPostureInput["previousEma"]>();
  const lastDebugLogTimeRef = useRef(0);
  const optionsRef = useRef(options);
  const lastSentVisionChunkRef = useRef<string | null>(null);
  const lastVisionTransportWarningTimeRef = useRef(0);
  const visionChunkSamplesRef = useRef<VisionChunkSample[]>([]);

  const { updateMetrics } = useMetrics();

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    lastSentVisionChunkRef.current = null;
    visionChunkSamplesRef.current = [];
  }, [options.sessionId, options.answerTurnId, options.turnStartedAtMs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateMetrics({
        handDetectionCounter,
        handDetectionDuration,
        notFacingCounter,
        notFacingDuration,
        badPostureDetectionCounter,
        badPostureDuration,
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    updateMetrics,
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
  ]);

  useEffect(() => {
    let animationFrameId = 0;
    let isMounted = true;
    let detectorsReady = false;

    const setupDetectors = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const [handDetector, faceDetector, poseDetector] = await Promise.all([
          initializeHandDetection(vision),
          initializeFaceDetection(vision),
          initializePoseDetection(vision),
        ]);

        if (!isMounted) {
          handDetector.close();
          faceDetector.close();
          poseDetector.close();
          return;
        }

        handDetectorRef.current = handDetector;
        faceDetectorRef.current = faceDetector;
        poseDetectorRef.current = poseDetector;
        detectorsReady = true;
      } catch (error) {
        console.error("Failed to initialize MediaPipe detectors:", error);
      }
    };

    const detect = () => {
      if (!isMounted) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!detectorsReady || !video || !canvas) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }

      // 비디오가 실제 프레임을 읽을 수 있을 때만 실행
      if (
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }

      // canvas를 실제 video 크기와 맞춤
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }

      const currentTime = performance.now();
      let handLandmarks: AnalyzeInterviewPostureInput["handLandmarks"];
      let faceLandmarks: AnalyzeInterviewPostureInput["faceLandmarks"];
      let poseLandmarks: AnalyzeInterviewPostureInput["poseLandmarks"];

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (overlayEnabled) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // --- Hand Detection Logic ---
      try {
        if (handDetectorRef.current) {
          const handResults = handDetectorRef.current.detectForVideo(
            video,
            currentTime
          );

          const hasHands =
            !!handResults.landmarks && handResults.landmarks.length > 0;

          setHandPresence(hasHands);
          handLandmarks = hasHands ? handResults.landmarks : undefined;

          if (hasHands) {
            if (!isHandOnScreenRef.current) {
              setHandDetectionCounter((prev) => prev + 1);
              handDetectionStartTimeRef.current = currentTime;
              isHandOnScreenRef.current = true;
            }
          } else {
            if (isHandOnScreenRef.current && handDetectionStartTimeRef.current) {
              const durationSec =
                (currentTime - handDetectionStartTimeRef.current) / 1000;
              setHandDetectionDuration((prev) => prev + durationSec);
            }
            handDetectionStartTimeRef.current = 0;
            isHandOnScreenRef.current = false;
          }

          if (overlayEnabled && handResults.landmarks) {
            drawHandLandmarks(canvas, handResults.landmarks);
          }
        }
      } catch (error) {
        console.error("Hand detection error:", error);
      }

      // --- Face Detection and Facing Forward Logic ---
      try {
        if (faceDetectorRef.current) {
          const faceResults = faceDetectorRef.current.detectForVideo(
            video,
            currentTime
          );

          const hasFace =
            !!faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0;

          setFacePresence(hasFace);
          faceLandmarks = hasFace ? faceResults.faceLandmarks[0] : undefined;

          if (hasFace) {
            if (overlayEnabled) {
              drawFaceMeshLandmarks(canvas, faceResults);
            }

            const lookingForward = isFacingForward(faceResults.faceLandmarks[0]);
            notFacingRef.current = !lookingForward;

            if (!lookingForward) {
              if (notFacingStartTimeRef.current === null) {
                notFacingStartTimeRef.current = currentTime;
                setNotFacingCounter((prev) => prev + 1);
              }
            } else {
              if (notFacingStartTimeRef.current !== null) {
                const elapsedSec =
                  (currentTime - notFacingStartTimeRef.current) / 1000;
                setNotFacingDuration((prev) => prev + elapsedSec);
                notFacingStartTimeRef.current = null;
              }
            }
          } else {
            notFacingRef.current = false;
            if (notFacingStartTimeRef.current !== null) {
              const elapsedSec =
                (currentTime - notFacingStartTimeRef.current) / 1000;
              setNotFacingDuration((prev) => prev + elapsedSec);
              notFacingStartTimeRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error("Face detection error:", error);
      }

      // --- Pose Detection and Bad Posture Logic ---
      try {
        if (poseDetectorRef.current) {
          const poseResults = poseDetectorRef.current.detectForVideo(
            video,
            currentTime
          );

          const hasPose =
            !!poseResults.landmarks && poseResults.landmarks.length > 0;

          setPosePresence(hasPose);
          poseLandmarks = hasPose ? poseResults.landmarks[0] : undefined;

          if (hasPose) {
            const landmarks = poseResults.landmarks[0];
            const badPosture = isBadPosture(landmarks);

            if (badPosture) {
              if (!hasBadPostureRef.current) {
                setBadPostureDetectionCounter((prev) => prev + 1);
                badPostureStartTimeRef.current = currentTime;
                hasBadPostureRef.current = true;
              }
            } else {
              if (hasBadPostureRef.current) {
                const durationSec =
                  (currentTime - badPostureStartTimeRef.current) / 1000;
                setBadPostureDuration((prev) => prev + durationSec);
                badPostureStartTimeRef.current = 0;
                hasBadPostureRef.current = false;
              }
            }

            if (overlayEnabled && poseResults.landmarks) {
              drawPoseLandmarkers(canvas, poseResults.landmarks);
            }
          } else {
            if (hasBadPostureRef.current) {
              const durationSec =
                (currentTime - badPostureStartTimeRef.current) / 1000;
              setBadPostureDuration((prev) => prev + durationSec);
              badPostureStartTimeRef.current = 0;
              hasBadPostureRef.current = false;
            }
          }
        }
      } catch (error) {
        console.error("Pose detection error:", error);
      }

      if (poseLandmarks || handLandmarks || faceLandmarks) {
        const mediaPipeOptions = optionsRef.current;
        mediaPipeOptions.onCalibrationFrame?.({
          handPresence: !!handLandmarks?.length,
          facePresence: !!faceLandmarks,
          posePresence: !!poseLandmarks,
          poseLandmarks,
        });
        const currentTimeSeconds =
          mediaPipeOptions.turnStartedAtMs !== undefined
            ? Math.max(
                (currentTime - mediaPipeOptions.turnStartedAtMs) / 1000,
                0
              )
            : currentTime / 1000;
        const analysis = analyzeInterviewPosture({
          poseLandmarks,
          handLandmarks,
          faceLandmarks,
          previousFrame: previousFrameRef.current,
          previousEma: previousEmaRef.current,
          currentTimeSeconds,
          questionContext: mediaPipeOptions.questionContext,
        });

        previousFrameRef.current = {
          poseLandmarks,
          handLandmarks,
          faceLandmarks,
          timestampSeconds: currentTimeSeconds,
          motionState: analysis.motionState,
        };

        previousEmaRef.current = analysis.ema;
        mediaPipeOptions.onVisionAnalysis?.(analysis);

        if (
          mediaPipeOptions.enabled &&
          mediaPipeOptions.sessionId &&
          mediaPipeOptions.answerTurnId &&
          mediaPipeOptions.chunkMs &&
          mediaPipeOptions.turnStartedAtMs !== undefined &&
          mediaPipeOptions.backendBaseUrl
        ) {
          const elapsedMs = Math.max(
            currentTime - mediaPipeOptions.turnStartedAtMs,
            0
          );

          visionChunkSamplesRef.current.push({
            analysis,
            elapsedMs,
          });

          const timing = getCompletedChunkTiming(
            currentTime,
            mediaPipeOptions.turnStartedAtMs,
            mediaPipeOptions.chunkMs
          );
          const sentKey = timing
            ? `${mediaPipeOptions.answerTurnId}:${timing.chunkId}`
            : null;

          if (timing && sentKey !== lastSentVisionChunkRef.current) {
            lastSentVisionChunkRef.current = sentKey;

            const samples = visionChunkSamplesRef.current.filter(
              (sample) => sample.elapsedMs >= timing.t0 && sample.elapsedMs <= timing.t1
            );
            const expectedFrameCount = Math.max(
              Math.round(mediaPipeOptions.chunkMs / (1000 / 30)),
              1
            );
            const visionChunk = createAggregatedVisionChunk({
              samples,
              expectedFrameCount,
              sessionId: mediaPipeOptions.sessionId,
              answerTurnId: mediaPipeOptions.answerTurnId,
              chunkId: timing.chunkId,
              t0: timing.t0,
              t1: timing.t1,
              context: mediaPipeOptions.questionContext,
            });

            visionChunkSamplesRef.current = visionChunkSamplesRef.current.filter(
              (sample) => sample.elapsedMs > timing.t1
            );

            fetch(
              `${mediaPipeOptions.backendBaseUrl}/api/sessions/${mediaPipeOptions.sessionId}/vision-chunks`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(visionChunk),
              }
            )
              .then((response) => {
                if (!response.ok) {
                  console.error("[vision-chunk-send-failed]", {
                    sessionId: mediaPipeOptions.sessionId,
                    answerTurnId: mediaPipeOptions.answerTurnId,
                    chunkId: timing.chunkId,
                    status: response.status,
                  });
                  return;
                }

                console.info("[vision-chunk-sent]", {
                  sessionId: mediaPipeOptions.sessionId,
                  answerTurnId: mediaPipeOptions.answerTurnId,
                  chunkId: timing.chunkId,
                  sampleCount: samples.length,
                });
              })
              .catch((error) => {
                console.error("[vision-chunk-send-error]", {
                  sessionId: mediaPipeOptions.sessionId,
                  answerTurnId: mediaPipeOptions.answerTurnId,
                  chunkId: timing.chunkId,
                  error,
                });
              });
          }
        } else if (
          mediaPipeOptions.enabled &&
          currentTime - lastVisionTransportWarningTimeRef.current >= 2000
        ) {
          lastVisionTransportWarningTimeRef.current = currentTime;
          console.warn("[vision-chunk-skip]", {
            hasSessionId: Boolean(mediaPipeOptions.sessionId),
            hasAnswerTurnId: Boolean(mediaPipeOptions.answerTurnId),
            hasChunkMs: Boolean(mediaPipeOptions.chunkMs),
            hasTurnStartedAtMs: mediaPipeOptions.turnStartedAtMs !== undefined,
            hasBackendBaseUrl: Boolean(mediaPipeOptions.backendBaseUrl),
          });
        }

        if (currentTime - lastDebugLogTimeRef.current >= 500) {
          console.log("[interview-posture-analysis]", {
            score: analysis.score,
            level: analysis.level,
            signals: analysis.signals,
            states: analysis.states,
            zScores: analysis.zScores,
            gaze: analysis.gaze,
            reasons: analysis.reasons,
          });
          lastDebugLogTimeRef.current = currentTime;
        }
      }

      animationFrameId = requestAnimationFrame(detect);
    };

    setupDetectors().then(() => {
      if (isMounted) {
        detect();
      }
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);

      handDetectorRef.current?.close();
      faceDetectorRef.current?.close();
      poseDetectorRef.current?.close();

      handDetectorRef.current = null;
      faceDetectorRef.current = null;
      poseDetectorRef.current = null;
    };
  }, [videoRef, canvasRef, overlayEnabled]);

  return {
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
    hasBadPostureRef,
  };
};
