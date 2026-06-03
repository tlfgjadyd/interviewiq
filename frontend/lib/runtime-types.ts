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

export type SessionType = "full" | "drill";

export type DrillTarget = AnalysisFocus;

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
  analysisFocus?: AnalysisFocus[];
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
  analysisFocus?: AnalysisFocus[];
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
};

export type DrillAttempt = {
  attemptId: string;
  drillId: string;
  sessionId: string;
  answerTurnId: string;
  questionId?: string;
  questionOrder?: number;
  flow?: InterviewFlow;
  topic?: QuestionTopic;
  analysisFocus?: AnalysisFocus[];
  attemptNo: number;
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
  nonverbalFeedback?: unknown;
};

export type InterviewReportMetric = {
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
  status: "ready" | "pending";
  summary: string;
  totalScore: number;
  metrics: InterviewReportMetric[];
  weakPatterns: InterviewWeakPattern[];
  recommendedPlan: DrillPlan;
  questions?: InterviewReportQuestion[];
};
