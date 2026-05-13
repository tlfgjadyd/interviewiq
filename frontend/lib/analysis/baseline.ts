import {
  BaselineMetric,
  BaselineSignal,
  LegacyBaseline,
  UserBaseline,
} from "./types";
import { robustZScore } from "./math";

export const getBaselineMetric = (
  signal: BaselineSignal,
  userBaseline?: UserBaseline,
  legacyBaseline?: LegacyBaseline
): BaselineMetric | undefined => {
  const direct =
    userBaseline?.rollingBaseline?.[signal] ??
    userBaseline?.sessionBaseline?.[signal];

  if (direct) {
    return direct;
  }

  if (signal === "postureCollapse") {
    return legacyBaseline?.postureCollapse ?? legacyBaseline?.posture;
  }

  if (signal === "handMovement") {
    return legacyBaseline?.handMovement ?? legacyBaseline?.fidget;
  }

  return legacyBaseline?.[signal];
};

export const calculateSignalZScore = (
  signal: BaselineSignal,
  value: number,
  userBaseline?: UserBaseline,
  legacyBaseline?: LegacyBaseline
): number => {
  const baseline = getBaselineMetric(signal, userBaseline, legacyBaseline);

  return baseline ? robustZScore(value, baseline.median, baseline.mad) : 0;
};

export const getGlobalThreshold = (
  signal: BaselineSignal,
  fallback: number,
  userBaseline?: UserBaseline
): number => {
  return userBaseline?.globalThreshold?.[signal] ?? fallback;
};
