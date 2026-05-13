import {
  KNEE_SHAKE_INDICES,
  MAX_RECENT_KNEE_SAMPLES,
  MAX_RECENT_MOVEMENT_SAMPLES,
  POSTURE_INDICES,
} from "./constants";
import {
  calculateAverageMovement,
  calculateDistance,
  clampScore,
  getDeltaSeconds,
  mad,
  median,
  pickExistingLandmarks,
  scaleJerk,
  scaleMovement,
  scaleVelocity,
} from "./math";
import { AnalyzeGestureInput, GestureBehaviorAnalysis, Landmark } from "./types";

const calculateHandMovement = (
  handLandmarks?: Landmark[][],
  previousHandLandmarks?: Landmark[][]
): number => {
  if (!handLandmarks || !previousHandLandmarks) {
    return 0;
  }

  const comparableHandCount = Math.min(
    handLandmarks.length,
    previousHandLandmarks.length
  );

  if (comparableHandCount === 0) {
    return 0;
  }

  const handMovements = handLandmarks
    .slice(0, comparableHandCount)
    .map((hand, index) =>
      calculateAverageMovement(hand, previousHandLandmarks[index])
    );

  return (
    handMovements.reduce((sum, movement) => sum + movement, 0) /
    handMovements.length
  );
};

const calculateMovementRepetition = (
  handMovement: number,
  recentHandMovementScores: number[]
): number => {
  if (recentHandMovementScores.length >= 4) {
    const midpoint = median(recentHandMovementScores);
    const variation = mad(recentHandMovementScores, midpoint);
    const activeSamples = recentHandMovementScores.filter(
      (value) => value >= 8 && value <= 45
    ).length;
    const consistency = clampScore((1 - variation / 25) * 100);

    return clampScore(
      (activeSamples / recentHandMovementScores.length) * consistency
    );
  }

  return handMovement >= 8 && handMovement <= 45 ? handMovement : 0;
};

const calculateHandToFaceProximity = ({
  handLandmarks,
  faceLandmarks,
  poseLandmarks,
}: {
  handLandmarks?: Landmark[][];
  faceLandmarks?: Landmark[];
  poseLandmarks?: Landmark[];
}): number => {
  if (!handLandmarks || handLandmarks.length === 0) {
    return 0;
  }

  const faceAnchors = [
    ...pickExistingLandmarks(faceLandmarks, [1, 4, 10, 152, 234, 454]),
    ...pickExistingLandmarks(poseLandmarks, [
      POSTURE_INDICES.head,
      POSTURE_INDICES.leftEar,
      POSTURE_INDICES.rightEar,
      POSTURE_INDICES.leftShoulder,
      POSTURE_INDICES.rightShoulder,
    ]),
  ];

  if (faceAnchors.length === 0) {
    return 0;
  }

  const hands = handLandmarks.flat();
  const minDistance = hands.reduce((closest, handPoint) => {
    const nearestAnchor = faceAnchors.reduce(
      (anchorClosest, anchor) =>
        Math.min(anchorClosest, calculateDistance(handPoint, anchor)),
      Number.POSITIVE_INFINITY
    );

    return Math.min(closest, nearestAnchor);
  }, Number.POSITIVE_INFINITY);
  const faceWidth = (() => {
    const leftFace = faceLandmarks?.[234];
    const rightFace = faceLandmarks?.[454];

    if (leftFace && rightFace) {
      return calculateDistance(leftFace, rightFace);
    }

    const leftShoulder = poseLandmarks?.[POSTURE_INDICES.leftShoulder];
    const rightShoulder = poseLandmarks?.[POSTURE_INDICES.rightShoulder];

    return leftShoulder && rightShoulder
      ? calculateDistance(leftShoulder, rightShoulder) * 0.6
      : 0.2;
  })();
  const dangerRadius = Math.max(faceWidth * 0.55, 0.08);

  return clampScore((1 - minDistance / dangerRadius) * 100);
};

const calculateKneeSignal = (
  poseLandmarks?: Landmark[]
): number | undefined => {
  const leftHip = poseLandmarks?.[KNEE_SHAKE_INDICES.leftHip];
  const rightHip = poseLandmarks?.[KNEE_SHAKE_INDICES.rightHip];
  const leftKnee = poseLandmarks?.[KNEE_SHAKE_INDICES.leftKnee];
  const rightKnee = poseLandmarks?.[KNEE_SHAKE_INDICES.rightKnee];
  const signals: number[] = [];

  if (leftHip && leftKnee) {
    signals.push(leftKnee.y - leftHip.y);
  }

  if (rightHip && rightKnee) {
    signals.push(rightKnee.y - rightHip.y);
  }

  if (signals.length === 0) {
    return undefined;
  }

  return signals.reduce((sum, value) => sum + value, 0) / signals.length;
};

const calculateVariance = (values: number[]): number => {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return (
    values.reduce((sum, value) => {
      const diff = value - mean;

      return sum + diff * diff;
    }, 0) / values.length
  );
};

const calculateZeroCrossings = (values: number[]): number => {
  if (values.length < 3) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  let crossings = 0;

  for (let index = 1; index < centered.length; index += 1) {
    const previous = centered[index - 1];
    const current = centered[index];

    if (previous === 0 || current === 0) {
      continue;
    }

    if (Math.sign(previous) !== Math.sign(current)) {
      crossings += 1;
    }
  }

  return crossings;
};

export const analyzeGestureBehavior = ({
  currentTimeSeconds,
  previousTimeSeconds,
  handLandmarks,
  previousHandLandmarks,
  faceLandmarks,
  poseLandmarks,
  previousPoseLandmarks,
  previousMotionState,
}: AnalyzeGestureInput): GestureBehaviorAnalysis => {
  const upperBodyIndices = [
    POSTURE_INDICES.leftShoulder,
    POSTURE_INDICES.rightShoulder,
    POSTURE_INDICES.leftElbow,
    POSTURE_INDICES.rightElbow,
    POSTURE_INDICES.leftWrist,
    POSTURE_INDICES.rightWrist,
  ];
  const legIndices = [23, 24, 25, 26, 27, 28];
  const deltaSeconds = getDeltaSeconds(
    currentTimeSeconds,
    previousTimeSeconds
  );
  const rawHandMovement = calculateHandMovement(
    handLandmarks,
    previousHandLandmarks
  );
  const rawHandVelocity = rawHandMovement / deltaSeconds;
  const rawHandAcceleration =
    previousMotionState?.handVelocityRaw !== undefined
      ? (rawHandVelocity - previousMotionState.handVelocityRaw) / deltaSeconds
      : 0;
  const rawHandJerk =
    previousMotionState?.handAccelerationRaw !== undefined
      ? (rawHandAcceleration - previousMotionState.handAccelerationRaw) /
        deltaSeconds
      : Math.max(0, rawHandAcceleration);
  const rawUpperBodyMovement =
    poseLandmarks && previousPoseLandmarks
      ? calculateAverageMovement(
          poseLandmarks,
          previousPoseLandmarks,
          upperBodyIndices
        )
      : 0;
  const rawLegMovement =
    poseLandmarks && previousPoseLandmarks
      ? calculateAverageMovement(poseLandmarks, previousPoseLandmarks, legIndices)
      : 0;
  const rawLegVelocity = rawLegMovement / deltaSeconds;
  const rawLegAcceleration =
    previousMotionState?.legVelocityRaw !== undefined
      ? (rawLegVelocity - previousMotionState.legVelocityRaw) / deltaSeconds
      : 0;
  const handMovement = scaleMovement(rawHandMovement);
  const handVelocity = scaleVelocity(rawHandVelocity);
  const handJerk = scaleJerk(rawHandJerk);
  const upperBodyMovement = scaleMovement(rawUpperBodyMovement);
  const legMovement = scaleMovement(rawLegMovement);
  const recentHandMovementScores = [
    ...(previousMotionState?.recentHandMovementScores ?? []),
    handMovement,
  ].slice(-MAX_RECENT_MOVEMENT_SAMPLES);
  const recentLegMovementScores = [
    ...(previousMotionState?.recentLegMovementScores ?? []),
    legMovement,
  ].slice(-MAX_RECENT_MOVEMENT_SAMPLES);
  const currentKneeSignal = calculateKneeSignal(poseLandmarks);
  const previousKneeSignals = previousMotionState?.recentKneeSignals ?? [];
  const previousKneeSignal =
    previousKneeSignals.length > 0
      ? previousKneeSignals[previousKneeSignals.length - 1]
      : undefined;
  const rawKneeMovement =
    currentKneeSignal !== undefined && previousKneeSignal !== undefined
      ? Math.abs(currentKneeSignal - previousKneeSignal)
      : 0;
  const kneeMovement = scaleMovement(rawKneeMovement);
  const rawKneeVelocity = rawKneeMovement / deltaSeconds;
  const kneeVelocity = scaleVelocity(rawKneeVelocity);
  const recentKneeSignals =
    currentKneeSignal !== undefined
      ? [...previousKneeSignals, currentKneeSignal].slice(
          -MAX_RECENT_KNEE_SAMPLES
        )
      : previousKneeSignals.slice(-MAX_RECENT_KNEE_SAMPLES);
  const kneeVarianceRaw = calculateVariance(recentKneeSignals);
  const kneeVariance = clampScore(kneeVarianceRaw * 100000);
  const zeroCrossings = calculateZeroCrossings(recentKneeSignals);
  const windowDurationSeconds = recentKneeSignals.length * deltaSeconds;
  const kneeZeroCrossingRate =
    windowDurationSeconds > 0 ? zeroCrossings / windowDurationSeconds : 0;
  const kneeZeroCrossingScore = clampScore((zeroCrossings / 6) * 100);
  const legShakingScore = clampScore(
    kneeVariance * 0.35 +
      kneeZeroCrossingScore * 0.35 +
      kneeVelocity * 0.3
  );
  const isLegShaking =
    currentKneeSignal !== undefined &&
    recentKneeSignals.length >= 12 &&
    kneeVariance >= 25 &&
    kneeZeroCrossingScore >= 45 &&
    kneeVelocity >= 20 &&
    legShakingScore >= 50 &&
    legMovement <= 65;
  const movementRepetition = calculateMovementRepetition(
    handMovement,
    recentHandMovementScores
  );
  const handToFaceProximity = calculateHandToFaceProximity({
    handLandmarks,
    faceLandmarks,
    poseLandmarks,
  });
  const fidgetScore = clampScore(
    handMovement * 0.4 +
      handJerk * 0.3 +
      movementRepetition * 0.2 +
      handToFaceProximity * 0.1
  );

  return {
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
    fidgetScore,
    fidget: fidgetScore,
    motionState: {
      handVelocityRaw: rawHandVelocity,
      handAccelerationRaw: rawHandAcceleration,
      legVelocityRaw: rawLegVelocity,
      legAccelerationRaw: rawLegAcceleration,
      recentHandMovementScores,
      recentLegMovementScores,
      recentKneeSignals,
    },
  };
};
