export type InterviewFlow =
  | "ice_breaking"
  | "basic_personality"
  | "job_competency"
  | "deep_dive"
  | "closing";

export type QuestionTopic =
  | "technical_knowledge"
  | "industry_knowledge"
  | "values"
  | "situational"
  | "motivation"
  | "teamwork"
  | "project_experience"
  | "self_introduction"
  | "reverse_question"
  | "general";

export type AnalysisFocus =
  | "speech_pace"
  | "filler_words"
  | "pause"
  | "gaze_stability"
  | "posture_stability"
  | "hand_fidget"
  | "knee_fidget"
  | "answer_structure"
  | "specificity"
  | "relevance";

export type QuestionSetId = "full_13" | "demo_5";

export type InterviewQuestion = {
  questionId: string;
  order: number;
  flow: InterviewFlow;
  topic: QuestionTopic;
  title: string;
  text: string;
  intent: string;
  expectedAnswerSec: number;
  analysisFocus: AnalysisFocus[];
};

export type InterviewQuestionSet = {
  questionSetId: QuestionSetId;
  name: string;
  description?: string;
  questions: InterviewQuestion[];
};
