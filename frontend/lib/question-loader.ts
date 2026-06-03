import full13 from "@/data/question-sets/full_13.json";
import demo5 from "@/data/question-sets/demo_5.json";
import type {
  InterviewQuestionSet,
  QuestionSetId,
} from "@/lib/question-types";

const questionSets: Record<QuestionSetId, InterviewQuestionSet> = {
  full_13: full13 as InterviewQuestionSet,
  demo_5: demo5 as InterviewQuestionSet,
};

const sortQuestionSet = (
  questionSet: InterviewQuestionSet
): InterviewQuestionSet => ({
  ...questionSet,
  questions: [...questionSet.questions].sort((a, b) => a.order - b.order),
});

export const getQuestionSet = (
  questionSetId?: QuestionSetId | string | null
): InterviewQuestionSet => {
  if (questionSetId === "demo_5" || questionSetId === "full_13") {
    return sortQuestionSet(questionSets[questionSetId]);
  }

  return sortQuestionSet(questionSets.full_13);
};

export const getDefaultQuestionSet = (): InterviewQuestionSet =>
  getQuestionSet("full_13");
