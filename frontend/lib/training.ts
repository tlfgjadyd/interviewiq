import {
  BadgeCheck,
  Brain,
  Clock3,
  MessageSquareText,
  ShieldQuestion,
  Target,
} from "lucide-react";
import type {
  DrillItem,
  DrillPlan,
  DrillTarget,
  InterviewFlow,
  InterviewReport,
  QuestionTopic,
} from "@/lib/runtime-types";

export type TrainingGoal = {
  id: string;
  title: string;
  weaknessType: "structure" | "specificity" | "delivery";
  baselineScore: number;
  targetScore: number;
  metricLabel: string;
  evidence: string[];
  successCriteria: string[];
};

export type Drill = DrillItem & {
  id: string;
  drillIndex: number;
  focus: string;
  durationMinutes: number;
  checklist: string[];
  feedbackTemplate: string[];
};

export const resultMetrics = [
  {
    label: "답변 구조",
    score: 56,
    previousScore: 56,
    delta: "기준점",
    status: "주의",
    summary:
      "결론이 뒤에 배치되고 경험 설명이 길어져 핵심 역량이 늦게 드러납니다.",
  },
  {
    label: "경험 구체성",
    score: 62,
    previousScore: 62,
    delta: "기준점",
    status: "보통",
    summary:
      "프로젝트 상황은 설명되지만 본인의 역할, 선택 이유, 결과 수치가 부족합니다.",
  },
  {
    label: "전달 안정성",
    score: 71,
    previousScore: 71,
    delta: "기준점",
    status: "양호",
    summary:
      "시선과 말 속도는 유지되지만 꼬리질문 직후 filler가 늘어나는 구간이 있습니다.",
  },
];

export const recommendedGoal: TrainingGoal = {
  id: "goal_structure_specificity",
  title: "첫 30초 안에 결론, 역할, 성과를 명확히 말하기",
  weaknessType: "structure",
  baselineScore: 56,
  targetScore: 75,
  metricLabel: "답변 구조",
  evidence: [
    "프로젝트 경험 질문에서 배경 설명이 길어져 핵심 역할이 50초 이후에 등장했습니다.",
    "성과를 말할 때 수치나 판단 기준이 부족해 설득력이 약해졌습니다.",
    "꼬리질문을 받은 뒤 답변 순서가 흔들리며 같은 내용을 반복했습니다.",
  ],
  successCriteria: [
    "첫 문장에 결론을 먼저 제시한다.",
    "상황, 역할, 행동, 결과를 60초 안에 연결한다.",
    "성과는 수치, 비교, 사용자 영향 중 하나로 구체화한다.",
  ],
};

const sourceFlow: InterviewFlow = "job_competency";
const sourceTopic: QuestionTopic = "project_experience";
const sourceQuestionIds = ["q07_project_role", "q10_deep_tradeoff"];

const makeDrill = (
  drillIndex: number,
  id: string,
  title: string,
  target: DrillTarget,
  focus: string,
  durationMinutes: number,
  question: string,
  instruction: string,
  checklist: string[],
  feedbackTemplate: string[],
  passCriteria: DrillItem["passCriteria"]
): Drill => ({
  id,
  drillId: id,
  drillIndex,
  title,
  target,
  sourceFlow,
  sourceTopic,
  sourceQuestionIds,
  sourcePatternId: "weak_structure",
  analysisFocus: [target],
  focus,
  durationMinutes,
  question,
  instruction,
  checklist,
  feedbackTemplate,
  passCriteria,
});

export const drillPlan: Drill[] = [
  makeDrill(
    1,
    "drill_1_structure",
    "구조화 드릴",
    "answer_structure",
    "STAR 골격 만들기",
    8,
    "가장 자신 있는 프로젝트 하나를 선택해서, 본인의 역할과 결과 중심으로 설명해 주세요.",
    "답변을 시작하기 전에 결론 한 문장, 역할 한 문장, 결과 한 문장을 먼저 정리합니다.",
    [
      "첫 문장이 결론으로 시작했는가",
      "본인의 역할이 팀 설명보다 먼저 나왔는가",
      "마지막 문장에 결과나 배운 점이 있는가",
    ],
    ["결론 위치", "역할 명확도", "답변 순서"],
    {
      metric: "content.structureScore",
      operator: ">=",
      threshold: 75,
    }
  ),
  makeDrill(
    2,
    "drill_2_specificity",
    "구체화 드릴",
    "specificity",
    "근거와 수치 보강",
    10,
    "그 프로젝트에서 기술적으로 가장 어려웠던 문제와 해결 과정을 구체적으로 설명해 주세요.",
    "문제를 설명한 뒤 선택지, 판단 기준, 결과 수치를 반드시 하나씩 포함합니다.",
    [
      "문제의 원인이 구체적인가",
      "왜 그 해결책을 선택했는가",
      "결과를 수치나 비교로 말했는가",
    ],
    ["근거 밀도", "기술 판단", "성과 표현"],
    {
      metric: "content.specificityScore",
      operator: ">=",
      threshold: 72,
    }
  ),
  makeDrill(
    3,
    "drill_3_pressure",
    "꼬리질문 드릴",
    "filler_words",
    "압박 상황에서 재정렬",
    12,
    "방금 말한 해결 방식보다 더 단순한 방법은 없었나요? 왜 그 방식을 고집했는지 설명해 주세요.",
    "1초 멈춘 뒤 인정, 기준, 선택 이유, 한계 순서로 답합니다.",
    [
      "질문을 방어적으로 받지 않았는가",
      "판단 기준을 먼저 말했는가",
      "한계와 대안을 함께 언급했는가",
    ],
    ["압박 대응", "논리 유지", "말 속도"],
    {
      metric: "audio.fillerCount",
      operator: "<=",
      threshold: 3,
    }
  ),
];

export const fallbackDrillPlan: DrillPlan = {
  planId: "plan_mock_structure_loop_1",
  sourceSessionId: "mock_baseline_session",
  drillSet: {
    loopIndex: 1,
    totalDrills: 3,
    status: "planned",
    afterCompletion: "full_session",
    nextActionLabel: "드릴 3개 완료 후 재측정 풀세션을 진행합니다.",
  },
  drills: drillPlan.map((drill) => ({
    drillId: drill.drillId,
    title: drill.title,
    target: drill.target,
    sourceFlow: drill.sourceFlow,
    sourceTopic: drill.sourceTopic,
    sourceQuestionIds: drill.sourceQuestionIds,
    sourcePatternId: drill.sourcePatternId,
    analysisFocus: drill.analysisFocus,
    question: drill.question,
    instruction: drill.instruction,
    passCriteria: drill.passCriteria,
  })),
};

export const fallbackReport: InterviewReport = {
  sessionId: "mock_baseline_session",
  reportId: "report_mock_baseline",
  status: "ready",
  summary:
    "답변의 내용보다 먼저 구조가 흔들리고 있습니다. 이번 루프는 답변 구조와 근거 제시를 좁게 교정합니다.",
  totalScore: Math.round(
    resultMetrics.reduce((sum, item) => sum + item.score, 0) /
      resultMetrics.length
  ),
  metrics: resultMetrics,
  weakPatterns: [
    {
      id: "weak_structure",
      title: "결론이 늦게 나오는 답변 구조",
      target: "answer_structure",
      flow: sourceFlow,
      topic: sourceTopic,
      sourceQuestionIds,
      analysisFocus: ["answer_structure", "specificity", "filler_words"],
      evidence: recommendedGoal.evidence,
      recommendedInstruction: recommendedGoal.title,
    },
  ],
  recommendedPlan: fallbackDrillPlan,
};

export const loopSteps = [
  {
    icon: BadgeCheck,
    label: "초기 풀세션",
    state: "done",
  },
  {
    icon: Target,
    label: "목표 설정",
    state: "current",
  },
  {
    icon: Brain,
    label: "드릴 1",
    state: "next",
  },
  {
    icon: MessageSquareText,
    label: "드릴 2",
    state: "next",
  },
  {
    icon: ShieldQuestion,
    label: "드릴 3",
    state: "next",
  },
  {
    icon: Clock3,
    label: "검증 풀세션",
    state: "next",
  },
];

export const getDrill = (drillIndex: number) =>
  drillPlan.find((drill) => drill.drillIndex === drillIndex) ?? drillPlan[0];

export const getDrillById = (drillId: string) =>
  drillPlan.find((drill) => drill.drillId === drillId || drill.id === drillId);

export const getDrillFromPlan = (plan: DrillPlan, step: number) => {
  const planDrills = plan.drills.length ? plan.drills : fallbackDrillPlan.drills;
  const item = planDrills[Math.max(0, Math.min(step, planDrills.length - 1))];
  const fallback = getDrill(step + 1);
  const localDrill = getDrillById(item?.drillId ?? "");

  return (
    localDrill ?? {
      ...fallback,
      ...item,
      id: item.drillId,
      drillIndex: step + 1,
      focus: fallback.focus,
      durationMinutes: fallback.durationMinutes,
      checklist: fallback.checklist,
      feedbackTemplate: fallback.feedbackTemplate,
    }
  );
};
