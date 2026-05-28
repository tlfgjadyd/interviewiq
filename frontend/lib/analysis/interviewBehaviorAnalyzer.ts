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
  CreateAggregatedVisionChunkInput,
  CreateVisionChunkInput,
  BehaviorEvent,
  BehaviorLevel,
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

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const max = (values: number[]): number => {
  return values.length ? Math.max(...values) : 0;
};

const averageOptional = (values: Array<number | undefined>): number | undefined => {
  const numericValues = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value)
  );

  return numericValues.length ? average(numericValues) : undefined;
};

const worstLevel = (levels: BehaviorLevel[]): BehaviorLevel => {
  const order: Record<BehaviorLevel, number> = {
    good: 0,
    caution: 1,
    warning: 2,
    bad: 3,
  };

  return levels.reduce(
    (worst, level) => (order[level] > order[worst] ? level : worst),
    "good" as BehaviorLevel
  );
};

const uniqueReasons = (samples: InterviewBehaviorAnalysis[]): string[] => {
  const seen = new Set<string>();
  const reasons: string[] = [];

  for (const sample of samples) {
    for (const reason of sample.reasons) {
      if (!seen.has(reason)) {
        seen.add(reason);
        reasons.push(reason);
      }
    }
  }

  return reasons.slice(0, 6);
};

const mergeBehaviorEvents = (
  samples: InterviewBehaviorAnalysis[]
): BehaviorEvent[] => {
  const events = samples
    .flatMap((sample) => sample.events)
    .filter((event) => Number.isFinite(event.t0) && Number.isFinite(event.t1))
    .sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
  const merged: BehaviorEvent[] = [];

  for (const event of events) {
    const previous = merged[merged.length - 1];

    if (previous && previous.type === event.type && event.t0 - previous.t1 <= 0.5) {
      const isMoreConfident = event.confidence > previous.confidence;

      previous.t1 = Math.max(previous.t1, event.t1);
      previous.confidence = Math.max(previous.confidence, event.confidence);
      previous.severity = isMoreConfident ? event.severity : previous.severity;
      continue;
    }

    merged.push({ ...event });
  }

  return merged.slice(0, 20);
};

const ratio = (samples: InterviewBehaviorAnalysis[], predicate: (sample: InterviewBehaviorAnalysis) => boolean) => {
  return samples.length ? samples.filter(predicate).length / samples.length : 0;
};

export const createAggregatedVisionChunk = ({
  samples,
  expectedFrameCount,
  ...chunkInput
}: CreateAggregatedVisionChunkInput): VisionChunk => {
  const analyses = samples.map((sample) => sample.analysis);
  const fallback = analyses[analyses.length - 1];

  if (!fallback) {
    return createVisionChunk({
      ...chunkInput,
      analysis: {
        isBadPosture: false,
        score: 0,
        behaviorRiskScore: 0,
        nonverbalRiskScore: 0,
        level: "good",
        reasons: [],
        events: [],
        signals: {
          postureCollapse: 0,
          fidgetScore: 0,
          gazePenalty: 0,
          bodySway: 0,
          legMovement: 0,
          kneeMovement: 0,
          kneeVelocity: 0,
          kneeVariance: 0,
          kneeZeroCrossingRate: 0,
          kneeZeroCrossingScore: 0,
          legShakingScore: 0,
          handMovement: 0,
          handVelocity: 0,
          handJerk: 0,
          movementRepetition: 0,
          handToFaceProximity: 0,
          upperBodyMovement: 0,
          gazeAwayDuration: 0,
          fidget: 0,
        },
        zScores: {
          postureCollapseZ: 0,
          handMovementZ: 0,
          gazeAwayZ: 0,
          bodySwayZ: 0,
        },
        ema: {
          fidget: 0,
          fidgetScore: 0,
          legMovement: 0,
          posture: 0,
          postureCollapse: 0,
        },
        motionState: {
          handVelocityRaw: 0,
          handAccelerationRaw: 0,
          legVelocityRaw: 0,
          legAccelerationRaw: 0,
          recentHandMovementScores: [],
          recentLegMovementScores: [],
          recentKneeSignals: [],
          gazeAwayDuration: 0,
          isFacingForward: false,
        },
        states: {
          isBadPosture: false,
          isFidgeting: false,
          isFacingForward: false,
          isGazeUnstable: false,
          isGoodSegment: false,
          isLegMovementHigh: false,
          isLegShaking: false,
          isPostureCollapsed: false,
          isNervous: false,
          isLookingAway: false,
        },
      },
    });
  }

  const gazeSamples = analyses.filter((sample) => sample.gaze);
  const validFrameRatio =
    expectedFrameCount && expectedFrameCount > 0
      ? Math.min(samples.length / expectedFrameCount, 1)
      : 1;
  const aggregatedAnalysis: InterviewBehaviorAnalysis = {
    ...fallback,
    isBadPosture: ratio(analyses, (sample) => sample.states.isBadPosture) >= 0.2,
    score: average(analyses.map((sample) => sample.score)),
    behaviorRiskScore: average(analyses.map((sample) => sample.behaviorRiskScore)),
    nonverbalRiskScore: average(
      analyses.map((sample) => sample.nonverbalRiskScore)
    ),
    level: worstLevel(analyses.map((sample) => sample.level)),
    reasons: uniqueReasons(analyses),
    events: mergeBehaviorEvents(analyses),
    signals: {
      postureCollapse: average(
        analyses.map((sample) => sample.signals.postureCollapse)
      ),
      fidgetScore: average(analyses.map((sample) => sample.signals.fidgetScore)),
      gazePenalty: average(analyses.map((sample) => sample.signals.gazePenalty)),
      bodySway: average(analyses.map((sample) => sample.signals.bodySway)),
      legMovement: average(analyses.map((sample) => sample.signals.legMovement)),
      kneeMovement: average(analyses.map((sample) => sample.signals.kneeMovement)),
      kneeVelocity: average(analyses.map((sample) => sample.signals.kneeVelocity)),
      kneeVariance: average(analyses.map((sample) => sample.signals.kneeVariance)),
      kneeZeroCrossingRate: average(
        analyses.map((sample) => sample.signals.kneeZeroCrossingRate)
      ),
      kneeZeroCrossingScore: average(
        analyses.map((sample) => sample.signals.kneeZeroCrossingScore)
      ),
      legShakingScore: max(
        analyses.map((sample) => sample.signals.legShakingScore)
      ),
      handMovement: average(analyses.map((sample) => sample.signals.handMovement)),
      handVelocity: average(analyses.map((sample) => sample.signals.handVelocity)),
      handJerk: max(analyses.map((sample) => sample.signals.handJerk)),
      movementRepetition: average(
        analyses.map((sample) => sample.signals.movementRepetition)
      ),
      handToFaceProximity: max(
        analyses.map((sample) => sample.signals.handToFaceProximity)
      ),
      upperBodyMovement: average(
        analyses.map((sample) => sample.signals.upperBodyMovement)
      ),
      gazeAwayDuration: average(
        analyses.map((sample) => sample.signals.gazeAwayDuration)
      ),
      fidget: average(analyses.map((sample) => sample.signals.fidget)),
    },
    zScores: {
      postureCollapseZ: average(
        analyses.map((sample) => sample.zScores.postureCollapseZ)
      ),
      handMovementZ: average(
        analyses.map((sample) => sample.zScores.handMovementZ)
      ),
      gazeAwayZ: average(analyses.map((sample) => sample.zScores.gazeAwayZ)),
      bodySwayZ: average(analyses.map((sample) => sample.zScores.bodySwayZ)),
      fidgetZ: averageOptional(analyses.map((sample) => sample.zScores.fidgetZ)),
      legMovementZ: averageOptional(
        analyses.map((sample) => sample.zScores.legMovementZ)
      ),
      postureZ: averageOptional(analyses.map((sample) => sample.zScores.postureZ)),
      speechRateZ: averageOptional(
        analyses.map((sample) => sample.zScores.speechRateZ)
      ),
      pauseZ: averageOptional(analyses.map((sample) => sample.zScores.pauseZ)),
      pitchInstabilityZ: averageOptional(
        analyses.map((sample) => sample.zScores.pitchInstabilityZ)
      ),
      fillerZ: averageOptional(analyses.map((sample) => sample.zScores.fillerZ)),
      volumeInstabilityZ: averageOptional(
        analyses.map((sample) => sample.zScores.volumeInstabilityZ)
      ),
    },
    gaze: {
      isFacingForward:
        ratio(analyses, (sample) => sample.gaze?.isFacingForward === true) >= 0.6,
      isLookingAway:
        ratio(analyses, (sample) => sample.gaze?.isLookingAway === true) >= 0.2,
      eyeCentered:
        ratio(analyses, (sample) => sample.gaze?.eyeCentered === true) >= 0.6,
      headForward:
        ratio(analyses, (sample) => sample.gaze?.headForward === true) >= 0.6,
      gazeStable:
        ratio(analyses, (sample) => sample.gaze?.gazeStable === true) >= 0.6,
      gazeAwayDuration:
        ratio(analyses, (sample) => sample.gaze?.isLookingAway === true) *
        ((chunkInput.t1 - chunkInput.t0) / 1000),
    },
    states: {
      isBadPosture: ratio(analyses, (sample) => sample.states.isBadPosture) >= 0.2,
      isFidgeting: ratio(analyses, (sample) => sample.states.isFidgeting) >= 0.2,
      isFacingForward:
        ratio(analyses, (sample) => sample.states.isFacingForward) >= 0.6,
      isGazeUnstable:
        ratio(analyses, (sample) => sample.states.isGazeUnstable) >= 0.2,
      isGoodSegment: ratio(analyses, (sample) => sample.states.isGoodSegment) >= 0.8,
      isLegMovementHigh:
        ratio(analyses, (sample) => sample.states.isLegMovementHigh) >= 0.2,
      isLegShaking:
        ratio(analyses, (sample) => sample.states.isLegShaking) >= 0.15,
      isPostureCollapsed:
        ratio(analyses, (sample) => sample.states.isPostureCollapsed) >= 0.2,
      isNervous: ratio(analyses, (sample) => sample.states.isNervous) >= 0.2,
      isLookingAway: ratio(analyses, (sample) => sample.states.isLookingAway) >= 0.2,
    },
  };
  const chunk = createVisionChunk({
    ...chunkInput,
    analysis: aggregatedAnalysis,
  });

  chunk.vision.quality = {
    frameCount: samples.length,
    validFrameRatio,
    fullBodyDetectedRatio: validFrameRatio,
    faceResolutionLevel: gazeSamples.length > 0 ? "medium" : "low",
    confidence: Math.min(validFrameRatio, 1),
  };
  chunk.vision.gaze.gazeAwayDuration = aggregatedAnalysis.gaze?.gazeAwayDuration ?? 0;
  chunk.vision.gaze.gazeAwayDurationMs = Math.round(
    (aggregatedAnalysis.gaze?.gazeAwayDuration ?? 0) * 1000
  );

  return chunk;
};

export const analyzeInterviewSegment = analyzeInterviewPosture;
