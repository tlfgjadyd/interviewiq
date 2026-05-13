import { analyzeFacingForward } from "./gazeAnalyzer";
import { analyzeGestureBehavior } from "./gestureAnalyzer";
import { analyzePosture } from "./postureAnalyzer";
import {
  calculateSignalZScore,
  getGlobalThreshold,
} from "./baseline";
import {
  createContextPrefix,
  determineBehaviorLevel,
} from "./behaviorScoring";
import { createBehaviorEvents } from "./events";
import { clampScore, ema, getDeltaSeconds, scaleMovement } from "./math";
import {
  AnalyzeInterviewPostureInput,
  CreateVisionChunkInput,
  InterviewBehaviorAnalysis,
  VisionChunk,
} from "./types";

export const analyzeInterviewPosture = ({
  currentTimeSeconds,
  previousTimeSeconds,
  poseLandmarks,
  faceLandmarks,
  handLandmarks,
  previousFrame,
  questionContext,
  userBaseline,
  baseline,
  previousEma,
  speechSignals,
}: AnalyzeInterviewPostureInput): InterviewBehaviorAnalysis => {
  const effectivePreviousTimeSeconds =
    previousTimeSeconds ?? previousFrame?.timestampSeconds;
  const deltaSeconds = getDeltaSeconds(
    currentTimeSeconds,
    effectivePreviousTimeSeconds
  );
  const postureAnalysis = poseLandmarks
    ? analyzePosture(poseLandmarks, previousFrame?.poseLandmarks)
    : null;
  const gestureAnalysis = analyzeGestureBehavior({
    currentTimeSeconds,
    previousTimeSeconds: effectivePreviousTimeSeconds,
    handLandmarks,
    previousHandLandmarks: previousFrame?.handLandmarks,
    faceLandmarks,
    poseLandmarks,
    previousPoseLandmarks: previousFrame?.poseLandmarks,
    previousMotionState: previousFrame?.motionState,
  });
  const gazeAnalysis = analyzeFacingForward({
    faceLandmarks,
    previousFaceLandmarks: previousFrame?.faceLandmarks,
    deltaSeconds,
    previousGazeAwayDuration: previousFrame?.motionState?.gazeAwayDuration,
    previousIsFacingForward: previousFrame?.motionState?.isFacingForward,
  });
  const postureCollapse = postureAnalysis?.metrics.postureCollapse ?? 0;
  const bodySway = scaleMovement(postureAnalysis?.metrics.bodySway ?? 0);
  const {
    fidgetScore,
    handMovement,
    handVelocity,
    handJerk,
    movementRepetition,
    handToFaceProximity,
    upperBodyMovement,
    legMovement,
    kneeMovement,
    kneeVelocity,
    kneeVariance,
    kneeZeroCrossingRate,
    kneeZeroCrossingScore,
    legShakingScore,
    isLegShaking,
  } = gestureAnalysis;
  const postureCollapseZ = calculateSignalZScore(
    "postureCollapse",
    postureCollapse,
    userBaseline,
    baseline
  );
  const handMovementZ = calculateSignalZScore(
    "handMovement",
    handMovement,
    userBaseline,
    baseline
  );
  const gazeAwayZ = calculateSignalZScore(
    "gazeAway",
    gazeAnalysis.gazeAwayDuration,
    userBaseline,
    baseline
  );
  const bodySwayZ = calculateSignalZScore(
    "bodySway",
    bodySway,
    userBaseline,
    baseline
  );
  const legMovementZ = calculateSignalZScore(
    "legMovement",
    legMovement,
    userBaseline,
    baseline
  );
  const fidgetZ = calculateSignalZScore(
    "fidgetScore",
    fidgetScore,
    userBaseline,
    baseline
  );
  const emaValues = {
    fidget: ema(fidgetScore, previousEma?.fidget),
    fidgetScore: ema(
      fidgetScore,
      previousEma?.fidgetScore ?? previousEma?.fidget
    ),
    legMovement: ema(legMovement, previousEma?.legMovement),
    posture: ema(postureCollapse, previousEma?.posture),
    postureCollapse: ema(
      postureCollapse,
      previousEma?.postureCollapse ?? previousEma?.posture
    ),
  };
  const behaviorRiskScore = clampScore(
    postureCollapse * 0.25 +
      fidgetScore * 0.25 +
      gazeAnalysis.gazePenalty * 0.2 +
      bodySway * 0.15 +
      legMovement * 0.15
  );
  const nonverbalRiskScore = behaviorRiskScore;
  const score = behaviorRiskScore;
  const level = determineBehaviorLevel(behaviorRiskScore);
  const postureThreshold = getGlobalThreshold(
    "postureCollapse",
    60,
    userBaseline
  );
  const fidgetThreshold = getGlobalThreshold("fidgetScore", 60, userBaseline);
  const legThreshold = getGlobalThreshold("legMovement", 60, userBaseline);
  const bodySwayThreshold = getGlobalThreshold("bodySway", 60, userBaseline);
  const speechRateZ = speechSignals?.speechRateZ;
  const pauseZ = speechSignals?.pauseZ;
  const pitchInstabilityZ = speechSignals?.pitchInstabilityZ;
  const fillerZ = speechSignals?.fillerZ;
  const volumeInstabilityZ = speechSignals?.volumeInstabilityZ;
  const isVoiceUnstable =
    Math.abs(speechRateZ ?? 0) > 2 ||
    (pauseZ ?? 0) > 2 ||
    (pitchInstabilityZ ?? 0) > 2 ||
    (fillerZ ?? 0) > 2 ||
    (volumeInstabilityZ ?? 0) > 2;
  const isBadPosture =
    postureCollapseZ > 2 || postureCollapse >= postureThreshold;
  const isFidgeting = fidgetZ > 2.5 || fidgetScore >= fidgetThreshold;
  const isFacingForward = gazeAnalysis.isAvailable
    ? gazeAnalysis.isFacingForward
    : false;
  const isGazeUnstable =
    gazeAnalysis.isAvailable &&
    (!gazeAnalysis.gazeStable ||
      gazeAwayZ > 2 ||
      gazeAnalysis.gazePenalty >= 50);
  const isLegMovementHigh = legMovementZ > 2.5 || legMovement >= legThreshold;
  const isPostureCollapsed =
    postureCollapseZ > 2 || postureCollapse >= postureThreshold;
  const isLookingAway = gazeAnalysis.isAvailable
    ? !gazeAnalysis.isFacingForward
    : false;
  const isGoodSegment =
    behaviorRiskScore < 25 &&
    (!gazeAnalysis.isAvailable || gazeAnalysis.isFacingForward) &&
    fidgetScore < 25 &&
    postureCollapse < 25;
  const states: InterviewBehaviorAnalysis["states"] = {
    isBadPosture,
    isFidgeting,
    isFacingForward,
    isGazeUnstable,
    isGoodSegment,
    isLegMovementHigh,
    isLegShaking,
    isPostureCollapsed,
    // TODO: move final nervous judgment to the multimodal aggregator.
    isNervous: isFidgeting && isVoiceUnstable,
    isLookingAway,
  };
  const reasons = [...(postureAnalysis?.reasons ?? [])];
  const contextPrefix = createContextPrefix(questionContext);

  if (!poseLandmarks) {
    reasons.push("자세 분석에 필요한 pose landmark가 부족합니다.");
  }

  if (gazeAnalysis.isAvailable && !gazeAnalysis.eyeCentered) {
    reasons.push(`${contextPrefix}시선 중앙 유지율이 낮아졌습니다.`);
  }

  if (gazeAnalysis.isAvailable && !gazeAnalysis.headForward) {
    reasons.push(`${contextPrefix}얼굴 방향이 카메라 정면에서 벗어났습니다.`);
  }

  if (states.isFidgeting) {
    reasons.push(
      `${contextPrefix}손 움직임과 반복 움직임이 개인 기준보다 증가했습니다.`
    );
  } else if (fidgetScore >= 35) {
    reasons.push(`${contextPrefix}손 또는 상체 움직임이 다소 증가했습니다.`);
  }

  if (handJerk >= 50) {
    reasons.push("갑작스러운 손 움직임이 감지되었습니다.");
  }

  if (movementRepetition >= 50) {
    reasons.push("반복적인 미세 손 움직임이 감지되었습니다.");
  }

  if (handToFaceProximity >= 50) {
    reasons.push("손이 얼굴이나 목 주변에 가까워지는 행동이 감지되었습니다.");
  }

  if (states.isLegShaking) {
    reasons.push(
      `${contextPrefix}다리 떨림으로 보이는 반복적인 하체 움직임이 감지되었습니다.`
    );
  } else if (states.isLegMovementHigh) {
    reasons.push(`${contextPrefix}다리 움직임이 기준보다 증가했습니다.`);
  }

  if (bodySwayZ > 2 || bodySway >= bodySwayThreshold) {
    reasons.push(`${contextPrefix}상체 흔들림이 기준보다 증가했습니다.`);
  }

  if (reasons.length === 0 && states.isGoodSegment) {
    reasons.push("시선, 자세, 손 움직임이 안정적인 구간입니다.");
  }

  const signals: InterviewBehaviorAnalysis["signals"] = {
    postureCollapse,
    fidgetScore,
    gazePenalty: gazeAnalysis.gazePenalty,
    bodySway,
    legMovement,
    kneeMovement,
    kneeVelocity,
    kneeVariance,
    kneeZeroCrossingRate,
    kneeZeroCrossingScore,
    legShakingScore,
    handMovement,
    handVelocity,
    handJerk,
    movementRepetition,
    handToFaceProximity,
    upperBodyMovement,
    gazeAwayDuration: gazeAnalysis.gazeAwayDuration,
    fidget: fidgetScore,
  };
  const events = createBehaviorEvents({
    currentTimeSeconds,
    deltaSeconds,
    states,
    signals,
    reasons,
  });

  return {
    isBadPosture: states.isBadPosture,
    score,
    behaviorRiskScore,
    nonverbalRiskScore,
    level,
    reasons,
    events,
    signals,
    zScores: {
      postureCollapseZ,
      handMovementZ,
      gazeAwayZ,
      bodySwayZ,
      fidgetZ,
      legMovementZ,
      postureZ: postureCollapseZ,
      speechRateZ,
      pauseZ,
      pitchInstabilityZ,
      fillerZ,
      volumeInstabilityZ,
    },
    gaze: gazeAnalysis.isAvailable
      ? {
          isFacingForward: gazeAnalysis.isFacingForward,
          isLookingAway: !gazeAnalysis.isFacingForward,
          eyeCentered: gazeAnalysis.eyeCentered,
          headForward: gazeAnalysis.headForward,
          gazeStable: gazeAnalysis.gazeStable,
          gazeAwayDuration: gazeAnalysis.gazeAwayDuration,
        }
      : undefined,
    ema: emaValues,
    motionState: {
      ...gestureAnalysis.motionState,
      gazeAwayDuration: gazeAnalysis.gazeAwayDuration,
      isFacingForward: gazeAnalysis.isFacingForward,
    },
    states,
  };
};

export const createVisionChunk = ({
  analysis,
  sessionId,
  answerTurnId,
  chunkId,
  t0,
  t1,
  context,
}: CreateVisionChunkInput): VisionChunk => {
  return {
    version: "vision_v2",
    sessionId,
    answerTurnId,
    chunkId,
    t0,
    t1,
    context,
    vision: {
      behaviorRiskScore: analysis.behaviorRiskScore,
      nonverbalRiskScore: analysis.nonverbalRiskScore,
      level: analysis.level,
      reasons: analysis.reasons,
      events: analysis.events,
      posture: {
        postureCollapse: analysis.signals.postureCollapse,
        bodySway: analysis.signals.bodySway,
        isBadPosture: analysis.states.isBadPosture,
        isPostureCollapsed: analysis.states.isPostureCollapsed,
      },
      gaze: {
        isFacingForward: analysis.gaze?.isFacingForward ?? false,
        isLookingAway: analysis.gaze?.isLookingAway ?? false,
        eyeCentered: analysis.gaze?.eyeCentered ?? false,
        headForward: analysis.gaze?.headForward ?? false,
        gazeStable: analysis.gaze?.gazeStable ?? false,
        gazeAwayDuration: analysis.signals.gazeAwayDuration,
        gazePenalty: analysis.signals.gazePenalty,
      },
      gesture: {
        fidgetScore: analysis.signals.fidgetScore,
        handMovement: analysis.signals.handMovement,
        handVelocity: analysis.signals.handVelocity,
        handJerk: analysis.signals.handJerk,
        movementRepetition: analysis.signals.movementRepetition,
        handToFaceProximity: analysis.signals.handToFaceProximity,
        upperBodyMovement: analysis.signals.upperBodyMovement,
        legMovement: analysis.signals.legMovement,
        kneeMovement: analysis.signals.kneeMovement,
        kneeVelocity: analysis.signals.kneeVelocity,
        kneeVariance: analysis.signals.kneeVariance,
        kneeZeroCrossingRate: analysis.signals.kneeZeroCrossingRate,
        kneeZeroCrossingScore: analysis.signals.kneeZeroCrossingScore,
        legShakingScore: analysis.signals.legShakingScore,
      },
      zScores: analysis.zScores,
      states: analysis.states,
    },
  };
};

export const analyzeInterviewSegment = analyzeInterviewPosture;
