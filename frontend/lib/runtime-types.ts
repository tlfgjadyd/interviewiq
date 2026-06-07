import type {
  AnalysisFocus,
  InterviewFlow,
  InterviewQuestion,
  QuestionSetId,
  QuestionTopic,
} from "@/lib/question-types";

export type {
  AnalysisFocus,
  InterviewFlow,
  InterviewQuestion,
  QuestionSetId,
  QuestionTopic,
} from "@/lib/question-types";

export type SessionType = "full" | "drill" | "baseline";

export type DrillTarget =
  | AnalysisFocus
  | "fidget"
  | "leg_shaking"
  | "posture";

export type RuntimeSessionStatus = "idle" | "active" | "finished";

export type RuntimeQuestionMeta = Partial<
  Omit<InterviewQuestion, "analysisFocus" | "flow" | "topic">
> & {
  questionId: string;
  flow?: InterviewFlow | string;
  phase?: InterviewFlow | string;
  topic?: QuestionTopic | string;
  analysisFocus?: AnalysisFocus[] | string;
  analysisFocusText?: string;
};

export type InterviewSession = {
  sessionId: string;
  sessionType: SessionType;
  status: RuntimeSessionStatus;
  answerTurnId?: string;
  questionIndex?: number;
  totalQuestions?: number;
  courseId?: string;
  questionSetId?: QuestionSetId;
  baselineId?: string;
  sourceSessionId?: string;
  drillId?: string;
  drillTarget?: DrillTarget;
  currentQuestionMeta?: RuntimeQuestionMeta;
  createdAt: string;
};

export type AnswerTurn = {
  answerTurnId: string;
  sessionId: string;
  questionId: string;
  questionOrder?: number;
  flow?: InterviewFlow;
  topic?: QuestionTopic;
  analysisFocus?: DrillTarget[];
  startedAt: string;
  endedAt?: string;
  transcript?: string;
};

export type AnswerMetrics = {
  audio: {
    wpm?: number;
    paceVariance?: number;
    fillerCount?: number;
    pauseRatio?: number;
  };
  vision: {
    gazeAwayRatio?: number;
    postureDrift?: number;
    handMovement?: number;
    kneeMovement?: number;
    fidgetScore?: number;
  };
  content: {
    structureScore?: number;
    specificityScore?: number;
    relevanceScore?: number;
  };
};

export type DrillPlan = {
  planId: string;
  sourceSessionId: string;
  courseId?: string;
  drillSet?: {
    loopIndex: number;
    totalDrills: number;
    status: "planned" | "in_progress" | "completed";
    afterCompletion?: "full_session" | "final_report";
    nextActionLabel?: string;
  };
  drills: DrillItem[];
};

export type DrillItem = {
  drillId: string;
  title: string;
  target: DrillTarget;
  sourceFlow?: InterviewFlow;
  sourceTopic?: QuestionTopic;
  sourceQuestionIds?: string[];
  sourcePatternId?: string;
  analysisFocus?: DrillTarget[];
  question: string;
  instruction: string;
  passCriteria: {
    metric: string;
    operator: "<" | "<=" | ">" | ">=";
    threshold: number;
  };
};

export type RuntimeConfig = {
  sessionType: SessionType;
  courseId?: string;
  questionSetId?: QuestionSetId;
  sessionId?: string;
  baselineId?: string;
  sourceSessionId?: string;
  drillIndex?: number;
  drillId?: string;
  drillTarget?: DrillTarget;
  maxAnswerSec: number;
  totalQuestions?: number;
  initialQuestion?: string;
  initialQuestionMeta?: RuntimeQuestionMeta;
};

export type StartSessionRequest = {
  sessionType: SessionType;
  courseId?: string;
  questionSetId?: QuestionSetId;
  baselineId?: string;
  sourceSessionId?: string;
  drillIndex?: number;
  drillId?: string;
  drillTarget?: DrillTarget;
  maxAnswerSec: number;
  totalQuestions: number;
};

export type AnswerState = {
  answerTurnId: string | null;
  isRecording: boolean;
  elapsedSec: number;
  maxAnswerSec: number;
  isSpeakingRatio?: number;
  silenceDurationMs?: number;
  rmsVolume?: number;
};

export type RealtimeAudioSignal = {
  rmsVolume: number;
  peakVolume?: number;
  isSpeakingRatio: number;
  silenceDurationMs: number;
  volumeWarning?: "too_low" | "too_high" | "normal";
  paceHint?: "slow" | "normal" | "fast";
  measuredAtMs: number;
};

export type DrillSessionResult = {
  drillId: string;
  sessionId: string;
  reportId?: string;
  answerTurnId: string;
  questionId?: string;
  questionOrder?: number;
  flow?: InterviewFlow;
  topic?: QuestionTopic;
  analysisFocus?: AnalysisFocus[];
  runNo: number;
  metrics?: AnswerMetrics;
  passed?: boolean;
  createdAt: string;
};

export type InterviewReportQuestion = {
  answerTurnId?: string;
  questionId?: string;
  questionIndex?: number;
  phase?: InterviewFlow | string;
  phaseGoal?: string;
  topic?: QuestionTopic | string;
  analysisFocus?: AnalysisFocus[] | string;
  answerText?: string;
  answerTextSource?: string;
  contentFeedback?: string[];
  contentAnalysis?: unknown;
  nonverbalFeedback?: unknown;
  events?: Array<Record<string, unknown>>;
};

export type ReportComparisonMetric = {
  current: number;
  reference: number;
  delta: number;
  deltaPercent?: number | null;
};

export type ReportComparison = {
  schemaVersion?: string;
  baseline?: {
    reportId?: string | null;
    reportType?: string;
    sessionId?: string | null;
    metrics?: Record<string, ReportComparisonMetric>;
  };
  previous?: {
    reportId?: string | null;
    reportType?: string;
    sessionId?: string | null;
    metrics?: Record<string, ReportComparisonMetric>;
  };
  summary?: Array<Record<string, unknown>>;
};

export type InterviewReportMetric = {
  metricKey?: string;
  label: string;
  score: number;
  previousScore?: number;
  delta?: string;
  status: string;
  summary: string;
};

export type InterviewWeakPattern = {
  id: string;
  title: string;
  target: DrillTarget;
  flow?: InterviewFlow;
  topic?: QuestionTopic;
  sourceQuestionIds?: string[];
  analysisFocus?: AnalysisFocus[];
  evidence: string[];
  recommendedInstruction: string;
};

export type InterviewReport = {
  sessionId: string;
  reportId: string;
  status: "ready" | "pending" | "failed";
  summary: string;
  totalScore: number;
  metrics: InterviewReportMetric[];
  weakPatterns: InterviewWeakPattern[];
  recommendedPlan: DrillPlan;
  questions?: InterviewReportQuestion[];
  behaviorLinkedMoments?: Array<Record<string, unknown>>;
  comparison?: ReportComparison;
};

export type SessionPlaybackAsset = {
  sessionId: string;
  assetId: string;
  assetType: "session_video";
  status: "pending" | "uploaded" | "processed" | "failed";
  readUrl?: string;
  durationMs?: number;
};

export type AnalysisTimelineSegment = {
  id: string;
  sessionId: string;
  answerTurnId: string;
  questionId?: string;
  questionIndex?: number;
  topic?: string;
  phase?: string;
  t0: number;
  t1: number;
  label: string;
  score?: number;
  severity?: "low" | "medium" | "high";
  metricType:
    | "gaze_away"
    | "bad_posture"
    | "fidget"
    | "leg_shaking"
    | "silence"
    | "speaking_ratio"
    | "answer_quality";
  source: "vision_chunk" | "audio_chunk" | "content_analysis";
};

export type ResultPlaybackModel = {
  video: SessionPlaybackAsset | null;
  timeline: AnalysisTimelineSegment[];
  questions: {
    questionId?: string;
    questionIndex?: number;
    answerTurnId?: string;
    text?: string;
    t0?: number;
    t1?: number;
  }[];
};
