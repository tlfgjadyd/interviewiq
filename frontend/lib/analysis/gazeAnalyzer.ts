import {
  DEFAULT_FRAME_SECONDS,
  IRIS_LANDMARK_COUNT,
  LEFT_EYE,
  RIGHT_EYE,
} from "./constants";
import {
  averageLandmarks,
  calculateDistance,
  clampScore,
  createLandmark,
} from "./math";
import { Landmark } from "./types";

type EyeLandmarkConfig = {
  outer: number;
  inner: number;
  irisStart: number;
};

const hasIrisLandmarks = (
  landmarks: Landmark[] | undefined,
  eye: EyeLandmarkConfig
): landmarks is Landmark[] => {
  return Boolean(
    landmarks && landmarks.length >= eye.irisStart + IRIS_LANDMARK_COUNT
  );
};

const hasEyeCorners = (landmarks?: Landmark[]): landmarks is Landmark[] => {
  return Boolean(
    landmarks?.[RIGHT_EYE.outer] &&
      landmarks?.[RIGHT_EYE.inner] &&
      landmarks?.[LEFT_EYE.outer] &&
      landmarks?.[LEFT_EYE.inner]
  );
};

export const isFacingForward = (landmarks: Landmark[]): boolean => {
  if (
    !hasIrisLandmarks(landmarks, RIGHT_EYE) &&
    !hasIrisLandmarks(landmarks, LEFT_EYE)
  ) {
    console.warn("Not enough landmarks provided for gaze estimation.");
    return false;
  }

  return analyzeFacingForward({ faceLandmarks: landmarks }).isFacingForward;
};

const calculateEyeCenter = (
  landmarks: Landmark[],
  outerIndex: number,
  innerIndex: number
): Landmark | undefined => {
  const outer = landmarks[outerIndex];
  const inner = landmarks[innerIndex];

  if (!outer || !inner) {
    return undefined;
  }

  return createLandmark(
    (outer.x + inner.x) / 2,
    (outer.y + inner.y) / 2,
    (outer.z + inner.z) / 2
  );
};

const calculateIrisT = (
  landmarks: Landmark[],
  outerIndex: number,
  innerIndex: number,
  irisStartIndex: number
): number | undefined => {
  if (landmarks.length < irisStartIndex + IRIS_LANDMARK_COUNT) {
    return undefined;
  }

  const outer = landmarks[outerIndex];
  const inner = landmarks[innerIndex];
  const irisCenter = averageLandmarks(
    landmarks
      .slice(irisStartIndex, irisStartIndex + IRIS_LANDMARK_COUNT)
      .filter((landmark): landmark is Landmark => Boolean(landmark))
  );

  if (!outer || !inner || !irisCenter) {
    return undefined;
  }

  const eyeVector = {
    x: inner.x - outer.x,
    y: inner.y - outer.y,
  };
  const irisVector = {
    x: irisCenter.x - outer.x,
    y: irisCenter.y - outer.y,
  };
  const norm2 = eyeVector.x * eyeVector.x + eyeVector.y * eyeVector.y;

  if (norm2 === 0) {
    return undefined;
  }

  return (irisVector.x * eyeVector.x + irisVector.y * eyeVector.y) / norm2;
};

const isCenteredIris = (irisT: number | undefined): boolean => {
  return irisT !== undefined && irisT >= 0.4 && irisT <= 0.6;
};

const estimateHeadForwardFromEyeGeometry = (landmarks: Landmark[]): boolean => {
  if (!hasEyeCorners(landmarks)) {
    return false;
  }

  const rightEyeCenter = calculateEyeCenter(
    landmarks,
    RIGHT_EYE.outer,
    RIGHT_EYE.inner
  );
  const leftEyeCenter = calculateEyeCenter(
    landmarks,
    LEFT_EYE.outer,
    LEFT_EYE.inner
  );

  if (!rightEyeCenter || !leftEyeCenter) {
    return false;
  }

  const eyeDistance = calculateDistance(rightEyeCenter, leftEyeCenter);

  if (eyeDistance === 0) {
    return false;
  }

  const eyeTilt = Math.abs(rightEyeCenter.y - leftEyeCenter.y) / eyeDistance;
  const eyeDepthDiff = Math.abs(rightEyeCenter.z - leftEyeCenter.z) / eyeDistance;

  return eyeTilt <= 0.12 && eyeDepthDiff <= 0.18;
};

const calculateMeanIrisT = (landmarks?: Landmark[]): number | undefined => {
  if (!landmarks) {
    return undefined;
  }

  const irisValues = [
    calculateIrisT(
      landmarks,
      RIGHT_EYE.outer,
      RIGHT_EYE.inner,
      RIGHT_EYE.irisStart
    ),
    calculateIrisT(
      landmarks,
      LEFT_EYE.outer,
      LEFT_EYE.inner,
      LEFT_EYE.irisStart
    ),
  ].filter((value): value is number => value !== undefined);

  if (irisValues.length === 0) {
    return undefined;
  }

  return (
    irisValues.reduce((sum, value) => sum + value, 0) / irisValues.length
  );
};

export const analyzeFacingForward = ({
  faceLandmarks,
  previousFaceLandmarks,
  deltaSeconds = DEFAULT_FRAME_SECONDS,
  previousGazeAwayDuration = 0,
  previousIsFacingForward,
}: {
  faceLandmarks?: Landmark[];
  previousFaceLandmarks?: Landmark[];
  deltaSeconds?: number;
  previousGazeAwayDuration?: number;
  previousIsFacingForward?: boolean;
}): {
  isFacingForward: boolean;
  isAvailable: boolean;
  eyeCentered: boolean;
  headForward: boolean;
  gazeStable: boolean;
  gazeAwayDuration: number;
  gazePenalty: number;
  irisT?: number;
} => {
  const hasRightIris = hasIrisLandmarks(faceLandmarks, RIGHT_EYE);
  const hasLeftIris = hasIrisLandmarks(faceLandmarks, LEFT_EYE);

  if (!faceLandmarks || (!hasRightIris && !hasLeftIris)) {
    return {
      isFacingForward: false,
      isAvailable: false,
      eyeCentered: false,
      headForward: false,
      gazeStable: false,
      gazeAwayDuration: 0,
      gazePenalty: 0,
    };
  }

  const rightIrisT = hasRightIris
    ? calculateIrisT(
        faceLandmarks,
        RIGHT_EYE.outer,
        RIGHT_EYE.inner,
        RIGHT_EYE.irisStart
      )
    : undefined;
  const leftIrisT = hasLeftIris
    ? calculateIrisT(
        faceLandmarks,
        LEFT_EYE.outer,
        LEFT_EYE.inner,
        LEFT_EYE.irisStart
      )
    : undefined;
  const irisValues = [rightIrisT, leftIrisT].filter(
    (value): value is number => value !== undefined
  );
  const centeredCount = [rightIrisT, leftIrisT].filter(isCenteredIris).length;
  const eyeCentered =
    irisValues.length > 0 && centeredCount >= Math.ceil(irisValues.length / 2);
  const headForward = estimateHeadForwardFromEyeGeometry(faceLandmarks);
  const previousMeanIrisT = calculateMeanIrisT(previousFaceLandmarks);
  const meanIrisT =
    irisValues.length > 0
      ? irisValues.reduce((sum, value) => sum + value, 0) / irisValues.length
      : undefined;
  const gazeStable =
    eyeCentered &&
    (previousMeanIrisT === undefined ||
      meanIrisT === undefined ||
      Math.abs(meanIrisT - previousMeanIrisT) <= 0.08);
  const isFacingForward = eyeCentered && headForward;
  const previousWasLookingAway = previousIsFacingForward === false;
  const gazeAwayDuration = isFacingForward
    ? 0
    : previousWasLookingAway
    ? previousGazeAwayDuration + deltaSeconds
    : deltaSeconds;
  const gazePenalty = isFacingForward
    ? 0
    : clampScore(
        (eyeCentered ? 20 : 55) +
          (headForward ? 0 : 25) +
          Math.min(gazeAwayDuration * 8, 20)
      );

  return {
    isFacingForward,
    isAvailable: true,
    eyeCentered,
    headForward,
    gazeStable,
    gazeAwayDuration,
    gazePenalty,
    irisT: meanIrisT,
  };
};
