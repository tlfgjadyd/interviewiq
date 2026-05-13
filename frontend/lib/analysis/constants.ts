export const RIGHT_EYE = { outer: 33, inner: 133, irisStart: 468 } as const;
export const LEFT_EYE = { outer: 362, inner: 263, irisStart: 473 } as const;
export const IRIS_LANDMARK_COUNT = 5;
export const DEFAULT_FRAME_SECONDS = 1 / 30;
export const MAX_RECENT_MOVEMENT_SAMPLES = 12;
export const MAX_RECENT_KNEE_SAMPLES = 30;

export const POSTURE_INDICES = {
  head: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export const KNEE_SHAKE_INDICES = {
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
} as const;
