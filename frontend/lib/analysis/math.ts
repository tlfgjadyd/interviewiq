import { DEFAULT_FRAME_SECONDS } from "./constants";
import { Landmark } from "./types";

export const calculateDistance = (a: Landmark, b: Landmark): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy);
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const clampScore = (value: number): number => {
  return clamp(Math.round(value), 0, 100);
};

export const createLandmark = (x: number, y: number, z = 0): Landmark => ({
  x,
  y,
  z,
  visibility: 0,
});

export const averageLandmarks = (
  landmarks: Landmark[]
): Landmark | undefined => {
  if (landmarks.length === 0) {
    return undefined;
  }

  const sum = landmarks.reduce(
    (acc, landmark) => ({
      x: acc.x + landmark.x,
      y: acc.y + landmark.y,
      z: acc.z + landmark.z,
      visibility: 0,
    }),
    createLandmark(0, 0)
  );

  return createLandmark(
    sum.x / landmarks.length,
    sum.y / landmarks.length,
    sum.z / landmarks.length
  );
};

export const pickExistingLandmarks = (
  landmarks: Landmark[] | undefined,
  indices: number[]
): Landmark[] => {
  if (!landmarks) {
    return [];
  }

  return indices
    .map((index) => landmarks[index])
    .filter((landmark): landmark is Landmark => Boolean(landmark));
};

export const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
};

export const mad = (values: number[], medianValue: number): number => {
  if (values.length === 0) {
    return 1;
  }

  const madValue = median(values.map((value) => Math.abs(value - medianValue)));

  return madValue === 0 ? 1 : madValue;
};

export const robustZScore = (
  value: number,
  medianValue: number,
  madValue: number
): number => {
  const safeMad = madValue === 0 ? 1 : madValue;

  return (0.6745 * (value - medianValue)) / safeMad;
};

export const ema = (
  currentValue: number,
  previousEma?: number,
  alpha = 0.25
): number => {
  return previousEma === undefined
    ? currentValue
    : alpha * currentValue + (1 - alpha) * previousEma;
};

export const getDeltaSeconds = (
  currentTimeSeconds?: number,
  previousTimeSeconds?: number
): number => {
  if (
    currentTimeSeconds === undefined ||
    previousTimeSeconds === undefined
  ) {
    return DEFAULT_FRAME_SECONDS;
  }

  const rawDelta = currentTimeSeconds - previousTimeSeconds;

  if (!Number.isFinite(rawDelta) || rawDelta <= 0) {
    return DEFAULT_FRAME_SECONDS;
  }

  return rawDelta;
};

export const scaleMovement = (movement: number): number => {
  return clampScore(movement * 1000);
};

export const scaleVelocity = (velocity: number): number => {
  return clampScore(velocity * 120);
};

export const scaleJerk = (jerk: number): number => {
  return clampScore(Math.abs(jerk) * 0.7);
};

export const calculateAverageMovement = (
  landmarks: Landmark[],
  previousLandmarks: Landmark[],
  indices?: number[]
): number => {
  const distances = (indices ?? landmarks.map((_, index) => index))
    .map((index) => {
      const landmark = landmarks[index];
      const previousLandmark = previousLandmarks[index];

      return landmark && previousLandmark
        ? calculateDistance(landmark, previousLandmark)
        : null;
    })
    .filter((distance): distance is number => distance !== null);

  if (distances.length === 0) {
    return 0;
  }

  return (
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length
  );
};
