import { BehaviorLevel, QuestionContext } from "./types";

export const determineBehaviorLevel = (score: number): BehaviorLevel => {
  if (score >= 65) {
    return "bad";
  }

  if (score >= 45) {
    return "warning";
  }

  if (score >= 25) {
    return "caution";
  }

  return "good";
};

export const createContextPrefix = (context?: QuestionContext): string => {
  if (context?.questionType === "pressure") {
    return "압박 질문 구간에서 ";
  }

  if (context?.isDifficultQuestion) {
    return "난이도 높은 질문 구간에서 ";
  }

  if (context?.answerPhase === "middle") {
    return "답변 중반부터 ";
  }

  return "";
};
