import { Landmark } from "../types";

export type { Landmark };

export type BehaviorLevel = "good" | "caution" | "warning" | "bad";
export type PostureLevel = "normal" | "warning" | "bad";

export type QuestionType =
  | "intro"
  | "experience"
  | "technical"
  | "pressure"
  | "followup"
  | "unknown";

export type AnswerPhase = "start" | "middle" | "end";

export type BaselineMetric = {
  median: number;
  mad: number;
};

export type BaselineSignal =
  | "postureCollapse"
  | "handMovement"
  | "gazeAway"
  | "bodySway"
  | "fidgetScore"
  | "legMovement";

export type UserBaseline = {
  sessionBaseline?: Partial<Record<BaselineSignal, BaselineMetric>>;
  rollingBaseline?: Partial<Record<BaselineSignal, BaselineMetric>>;
  globalThreshold?: Partial<Record<BaselineSignal, number>>;
};

export type QuestionContext = {
  questionType?: QuestionType;
  answerPhase?: AnswerPhase;
  timeSinceQuestionStart?: number;
  timeSinceAnswerStart?: number;
  isDifficultQuestion?: boolean;
};

export type BehaviorMotionState = {
  handVelocityRaw: number;
  handAccelerationRaw: number;
  legVelocityRaw: number;
  legAccelerationRaw: number;
  recentHandMovementScores: number[];
  recentLegMovementScores: number[];
  recentKneeSignals: number[];
  gazeAwayDuration: number;
  isFacingForward: boolean;
};

export type SpeechSignals = {
  speechRateZ?: number;
  pauseZ?: number;
  pitchInstabilityZ?: number;
  fillerZ?: number;
  volumeInstabilityZ?: number;
};

export type BehaviorEventType =
  | "bad_posture"
  | "gaze_away"
  | "fidget"
  | "hand_jerk"
  | "self_touch"
  | "leg_movement"
  | "leg_shaking"
  | "body_sway";

export type BehaviorEventSeverity = "low" | "medium" | "high";

export type BehaviorEvent = {
  type: BehaviorEventType;
  t0: number;
  t1: number;
  severity: BehaviorEventSeverity;
  confidence: number;
  reason: string;
};

export type LegacyBaseline = {
  fidget?: BaselineMetric;
  fidgetScore?: BaselineMetric;
  legMovement?: BaselineMetric;
  posture?: BaselineMetric;
  postureCollapse?: BaselineMetric;
  handMovement?: BaselineMetric;
  gazeAway?: BaselineMetric;
  bodySway?: BaselineMetric;
};

export type PostureAnalysis = {
  isBadPosture: boolean;
  score: number;
  level: PostureLevel;
  reasons: string[];
  metrics: {
    headShoulderDistance: number;
    normalizedHeadShoulderDistance: number;
    shoulderWidth: number;
    shoulderTilt: number;
    torsoLean: number;
    headTilt: number;
    upperBodyCompression: number;
    bodySway: number;
    postureCollapse: number;
  };
};

export type AnalyzeGestureInput = {
  currentTimeSeconds?: number;
  previousTimeSeconds?: number;
  handLandmarks?: Landmark[][];
  previousHandLandmarks?: Landmark[][];
  faceLandmarks?: Landmark[];
  poseLandmarks?: Landmark[];
  previousPoseLandmarks?: Landmark[];
  previousMotionState?: Partial<BehaviorMotionState>;
};

export type GestureBehaviorAnalysis = {
  handMovement: number;
  handVelocity: number;
  handJerk: number;
  movementRepetition: number;
  handToFaceProximity: number;
  upperBodyMovement: number;
  legMovement: number;
  kneeMovement: number;
  kneeVelocity: number;
  kneeVariance: number;
  kneeZeroCrossingRate: number;
  kneeZeroCrossingScore: number;
  legShakingScore: number;
  isLegShaking: boolean;
  fidgetScore: number;
  fidget: number;
  motionState: Pick<
    BehaviorMotionState,
    | "handVelocityRaw"
    | "handAccelerationRaw"
    | "legVelocityRaw"
    | "legAccelerationRaw"
    | "recentHandMovementScores"
    | "recentLegMovementScores"
    | "recentKneeSignals"
  >;
};

export type AnalyzeInterviewSegmentInput = {
  currentTimeSeconds: number;
  previousTimeSeconds?: number;
  faceLandmarks?: Landmark[];
  poseLandmarks?: Landmark[];
  handLandmarks?: Landmark[][];
  questionContext?: QuestionContext;
  userBaseline?: UserBaseline;
};

export type AnalyzeInterviewPostureInput = Omit<
  AnalyzeInterviewSegmentInput,
  "currentTimeSeconds"
> & {
  currentTimeSeconds?: number;
  previousFrame?: {
    poseLandmarks?: Landmark[];
    faceLandmarks?: Landmark[];
    handLandmarks?: Landmark[][];
    timestampSeconds?: number;
    motionState?: Partial<BehaviorMotionState>;
  } | null;
  baseline?: LegacyBaseline;
  previousEma?: {
    fidget?: number;
    fidgetScore?: number;
    legMovement?: number;
    posture?: number;
    postureCollapse?: number;
  };
  speechSignals?: SpeechSignals;
};

export type InterviewBehaviorAnalysis = {
  isBadPosture: boolean;
  /**
   * @deprecated use behaviorRiskScore instead.
   */
  score: number;
  behaviorRiskScore: number;
  nonverbalRiskScore: number;
  level: BehaviorLevel;
  reasons: string[];
  events: BehaviorEvent[];
  signals: {
    postureCollapse: number;
    fidgetScore: number;
    gazePenalty: number;
    bodySway: number;
    legMovement: number;
    kneeMovement: number;
    kneeVelocity: number;
    kneeVariance: number;
    kneeZeroCrossingRate: number;
    kneeZeroCrossingScore: number;
    legShakingScore: number;
    handMovement: number;
    handVelocity: number;
    handJerk: number;
    movementRepetition: number;
    handToFaceProximity: number;
    upperBodyMovement: number;
    gazeAwayDuration: number;
    fidget: number;
  };
  zScores: {
    postureCollapseZ: number;
    handMovementZ: number;
    gazeAwayZ: number;
    bodySwayZ: number;
    fidgetZ?: number;
    legMovementZ?: number;
    postureZ?: number;
    speechRateZ?: number;
    pauseZ?: number;
    pitchInstabilityZ?: number;
    fillerZ?: number;
    volumeInstabilityZ?: number;
  };
  gaze?: {
    isFacingForward: boolean;
    isLookingAway: boolean;
    eyeCentered: boolean;
    headForward: boolean;
    gazeStable: boolean;
    gazeAwayDuration: number;
  };
  ema: {
    fidget: number;
    fidgetScore: number;
    legMovement: number;
    posture: number;
    postureCollapse: number;
  };
  motionState: BehaviorMotionState;
  states: {
    isBadPosture: boolean;
    isFidgeting: boolean;
    isFacingForward: boolean;
    isGazeUnstable: boolean;
    isGoodSegment: boolean;
    isLegMovementHigh: boolean;
    isLegShaking: boolean;
    isPostureCollapsed: boolean;
    isNervous: boolean;
    isLookingAway: boolean;
  };
};

export type VisionChunk = {
  version: "vision_v2";
  sessionId?: string;
  answerTurnId?: string;
  chunkId?: string;
  t0: number;
  t1: number;
  context?: QuestionContext;
  vision: {
    behaviorRiskScore: number;
    nonverbalRiskScore: number;
    level: BehaviorLevel;
    reasons: string[];
    events: BehaviorEvent[];
    posture: {
      postureCollapse: number;
      bodySway: number;
      isBadPosture: boolean;
      isPostureCollapsed: boolean;
    };
    gaze: {
      isFacingForward: boolean;
      isLookingAway: boolean;
      eyeCentered: boolean;
      headForward: boolean;
      gazeStable: boolean;
      gazeAwayDuration: number;
      gazeAwayDurationMs?: number;
      gazePenalty: number;
    };
    gesture: {
      fidgetScore: number;
      handMovement: number;
      handVelocity: number;
      handJerk: number;
      movementRepetition: number;
      handToFaceProximity: number;
      upperBodyMovement: number;
      legMovement: number;
      kneeMovement: number;
      kneeVelocity: number;
      kneeVariance: number;
      kneeZeroCrossingRate: number;
      kneeZeroCrossingScore: number;
      legShakingScore: number;
    };
    zScores: InterviewBehaviorAnalysis["zScores"];
    states: InterviewBehaviorAnalysis["states"];
    quality?: {
      frameCount: number;
      validFrameRatio: number;
      fullBodyDetectedRatio: number;
      lowerBodyDetectedRatio?: number;
      faceResolutionLevel?: "low" | "medium" | "high";
      confidence?: number;
    };
  };
};

export type CreateVisionChunkInput = {
  analysis: InterviewBehaviorAnalysis;
  sessionId?: string;
  answerTurnId?: string;
  chunkId?: string;
  t0: number;
  t1: number;
  context?: QuestionContext;
};

export type VisionChunkSample = {
  analysis: InterviewBehaviorAnalysis;
  elapsedMs: number;
};

export type CreateAggregatedVisionChunkInput = Omit<
  CreateVisionChunkInput,
  "analysis"
> & {
  samples: VisionChunkSample[];
  expectedFrameCount?: number;
};
