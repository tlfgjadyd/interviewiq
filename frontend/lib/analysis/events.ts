import { clamp } from "./math";
import {
  BehaviorEvent,
  BehaviorEventSeverity,
  InterviewBehaviorAnalysis,
} from "./types";

const eventSeverityFromScore = (score: number): BehaviorEventSeverity => {
  if (score >= 75) {
    return "high";
  }

  if (score >= 50) {
    return "medium";
  }

  return "low";
};

const pickReason = (
  reasons: string[],
  matchers: string[],
  fallback: string
): string => {
  return (
    reasons.find((reason) =>
      matchers.some((matcher) => reason.includes(matcher))
    ) ?? fallback
  );
};

export const createBehaviorEvents = ({
  currentTimeSeconds,
  deltaSeconds,
  states,
  signals,
  reasons,
}: {
  currentTimeSeconds?: number;
  deltaSeconds: number;
  states: InterviewBehaviorAnalysis["states"];
  signals: InterviewBehaviorAnalysis["signals"];
  reasons: string[];
}): BehaviorEvent[] => {
  const t1 =
    currentTimeSeconds !== undefined && Number.isFinite(currentTimeSeconds)
      ? currentTimeSeconds
      : 0;
  const t0 = Math.max(0, t1 - deltaSeconds);
  const events: BehaviorEvent[] = [];

  if (states.isPostureCollapsed) {
    events.push({
      type: "bad_posture",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.postureCollapse),
      confidence: clamp(signals.postureCollapse / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["자세", "어깨", "상체", "머리"],
        "자세 붕괴 신호가 기준 이상입니다."
      ),
    });
  }

  if (states.isLookingAway) {
    events.push({
      type: "gaze_away",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.gazePenalty),
      confidence: clamp(signals.gazePenalty / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["시선", "얼굴 방향"],
        "시선 또는 얼굴 방향이 정면에서 벗어났습니다."
      ),
    });
  }

  if (states.isFidgeting) {
    events.push({
      type: "fidget",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.fidgetScore),
      confidence: clamp(signals.fidgetScore / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["손 움직임", "반복"],
        "손 움직임, 반복 움직임, 갑작스러운 움직임이 증가했습니다."
      ),
    });
  }

  if (signals.handJerk >= 50) {
    events.push({
      type: "hand_jerk",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.handJerk),
      confidence: clamp(signals.handJerk / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["갑작스러운 손"],
        "갑작스러운 손 움직임이 감지되었습니다."
      ),
    });
  }

  if (signals.handToFaceProximity >= 50) {
    events.push({
      type: "self_touch",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.handToFaceProximity),
      confidence: clamp(signals.handToFaceProximity / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["얼굴이나 목", "가까워"],
        "손이 얼굴이나 목 주변에 가까워졌습니다."
      ),
    });
  }

  if (states.isLegShaking) {
    events.push({
      type: "leg_shaking",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.legShakingScore),
      confidence: clamp(signals.legShakingScore / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["다리 떨림", "반복적인 하체"],
        "다리 떨림으로 보이는 반복적인 하체 움직임이 감지되었습니다."
      ),
    });
  }

  if (states.isLegMovementHigh && !states.isLegShaking) {
    events.push({
      type: "leg_movement",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.legMovement),
      confidence: clamp(signals.legMovement / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["다리"],
        "다리 움직임이 기준보다 증가했습니다."
      ),
    });
  }

  if (signals.bodySway >= 60) {
    events.push({
      type: "body_sway",
      t0,
      t1,
      severity: eventSeverityFromScore(signals.bodySway),
      confidence: clamp(signals.bodySway / 100, 0, 1),
      reason: pickReason(
        reasons,
        ["상체 흔들림"],
        "상체 흔들림이 증가했습니다."
      ),
    });
  }

  return events;
};
