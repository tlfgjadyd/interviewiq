import { POSTURE_INDICES } from "./constants";
import {
  calculateAverageMovement,
  calculateDistance,
  clampScore,
  createLandmark,
} from "./math";
import { Landmark, PostureAnalysis, PostureLevel } from "./types";

export const analyzePosture = (
  landmarks: Landmark[],
  previousLandmarks?: Landmark[]
): PostureAnalysis => {
  const head = landmarks[POSTURE_INDICES.head];
  const leftEar = landmarks[POSTURE_INDICES.leftEar];
  const rightEar = landmarks[POSTURE_INDICES.rightEar];
  const leftShoulder = landmarks[POSTURE_INDICES.leftShoulder];
  const rightShoulder = landmarks[POSTURE_INDICES.rightShoulder];
  const leftHip = landmarks[POSTURE_INDICES.leftHip];
  const rightHip = landmarks[POSTURE_INDICES.rightHip];

  if (!head || !leftShoulder || !rightShoulder) {
    return {
      isBadPosture: false,
      score: 0,
      level: "normal",
      reasons: ["자세 분석에 필요한 landmark가 부족합니다."],
      metrics: {
        headShoulderDistance: 0,
        normalizedHeadShoulderDistance: 0,
        shoulderWidth: 0,
        shoulderTilt: 0,
        torsoLean: 0,
        headTilt: 0,
        upperBodyCompression: 0,
        bodySway: 0,
        postureCollapse: 0,
      },
    };
  }

  const midShoulders = createLandmark(
    (leftShoulder.x + rightShoulder.x) / 2,
    (leftShoulder.y + rightShoulder.y) / 2,
    (leftShoulder.z + rightShoulder.z) / 2
  );
  const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
  const headShoulderDistance = calculateDistance(head, midShoulders);
  const normalizedHeadShoulderDistance =
    shoulderWidth > 0 ? headShoulderDistance / shoulderWidth : 0;
  const shoulderTilt =
    shoulderWidth > 0
      ? Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth
      : 0;
  const midHips =
    leftHip && rightHip
      ? createLandmark(
          (leftHip.x + rightHip.x) / 2,
          (leftHip.y + rightHip.y) / 2,
          (leftHip.z + rightHip.z) / 2
        )
      : undefined;
  const torsoDistance = midHips ? calculateDistance(midShoulders, midHips) : 0;
  const torsoLean =
    midHips && shoulderWidth > 0
      ? Math.abs(midShoulders.x - midHips.x) / shoulderWidth
      : 0;
  const earDistance = leftEar && rightEar ? calculateDistance(leftEar, rightEar) : 0;
  const headTilt =
    leftEar && rightEar && earDistance > 0
      ? Math.abs(leftEar.y - rightEar.y) / earDistance
      : 0;
  const upperBodyCompression =
    shoulderWidth > 0 && torsoDistance > 0
      ? clampScore((1.05 - torsoDistance / shoulderWidth) * 100)
      : 0;
  const upperBodySwayIndices = [
    POSTURE_INDICES.head,
    POSTURE_INDICES.leftEar,
    POSTURE_INDICES.rightEar,
    POSTURE_INDICES.leftShoulder,
    POSTURE_INDICES.rightShoulder,
    POSTURE_INDICES.leftElbow,
    POSTURE_INDICES.rightElbow,
    POSTURE_INDICES.leftWrist,
    POSTURE_INDICES.rightWrist,
    POSTURE_INDICES.leftHip,
    POSTURE_INDICES.rightHip,
  ];
  const bodySway = previousLandmarks
    ? calculateAverageMovement(landmarks, previousLandmarks, upperBodySwayIndices)
    : 0;
  const headCollapseScore =
    normalizedHeadShoulderDistance < 0.85
      ? 70
      : normalizedHeadShoulderDistance < 1.0
      ? 40
      : normalizedHeadShoulderDistance < 1.12
      ? 15
      : 0;
  const shoulderTiltScore =
    shoulderTilt <= 0.06 ? 0 : clampScore(((shoulderTilt - 0.06) / 0.14) * 100);
  const torsoLeanScore = clampScore(torsoLean * 80);
  const headTiltScore = clampScore(headTilt * 180);
  const postureCollapse = clampScore(
    headCollapseScore * 0.5 +
      shoulderTiltScore * 0.2 +
      torsoLeanScore * 0.15 +
      headTiltScore * 0.1 +
      upperBodyCompression * 0.05
  );
  const score = postureCollapse;
  const level: PostureLevel =
    score >= 65 ? "bad" : score >= 35 ? "warning" : "normal";
  const reasons: string[] = [];

  if (headCollapseScore >= 70) {
    reasons.push("머리와 어깨 간 거리가 크게 줄어 자세가 무너졌습니다.");
  } else if (headCollapseScore > 0) {
    reasons.push("머리와 어깨 간 거리가 줄어든 자세 신호가 있습니다.");
  }

  if (shoulderTiltScore >= 65) {
    reasons.push("좌우 어깨 높이 차이가 큽니다.");
  } else if (shoulderTiltScore >= 35) {
    reasons.push("좌우 어깨 높이 차이가 약간 감지됩니다.");
  }

  if (torsoLeanScore >= 50) {
    reasons.push("상체 중심이 골반 중심에서 벗어난 신호가 있습니다.");
  }

  if (headTiltScore >= 50) {
    reasons.push("머리 기울어짐이 감지됩니다.");
  }

  if (upperBodyCompression >= 50) {
    reasons.push("어깨와 골반 사이 거리가 줄어 상체가 압축된 모습입니다.");
  }

  return {
    isBadPosture: score >= 65,
    score,
    level,
    reasons,
    metrics: {
      headShoulderDistance,
      normalizedHeadShoulderDistance,
      shoulderWidth,
      shoulderTilt,
      torsoLean,
      headTilt,
      upperBodyCompression,
      bodySway,
      postureCollapse,
    },
  };
};

export const isBadPosture = (landmarks: Landmark[]): boolean => {
  return analyzePosture(landmarks).isBadPosture;
};
