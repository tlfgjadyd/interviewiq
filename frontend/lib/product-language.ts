import type { DrillTarget } from "@/lib/runtime-types";

export const targetLabel = (target?: DrillTarget | string | null) => {
  const raw = String(target ?? "");
  const labels: Record<string, string> = {
    gaze_stability: "시선 안정",
    posture: "자세 안정",
    fidget: "반복 움직임 줄이기",
    leg_shaking: "하체 움직임 안정",
    answer_structure: "답변 구조화",
    specificity: "근거 구체화",
    job_fit: "직무 연결 강화",
    filler_words: "추임새 줄이기",
    hand_fidget: "손 움직임 안정",
    knee_fidget: "하체 움직임 안정",
  };
  return labels[raw] ?? (/[가-힣]/.test(raw) ? raw : "교정 목표");
};

export const targetDescription = (target?: DrillTarget | string | null) => {
  const descriptions: Record<string, string> = {
    gaze_stability: "답변 중 시선 이탈이 많았던 구간을 줄이는 것을 목표로 합니다.",
    posture: "답변이 길어질 때 자세가 무너지는 구간을 안정화합니다.",
    fidget: "손이나 상체의 반복 움직임을 줄여 전달 안정감을 높입니다.",
    leg_shaking: "심층 질문 구간에서 하체 움직임을 줄이고 답변 리듬을 유지합니다.",
    answer_structure: "상황, 역할, 행동, 결과가 보이도록 답변 순서를 정리합니다.",
    specificity: "결과를 수치, 비교 기준, 사용자의 영향으로 구체화합니다.",
    job_fit: "경험을 채용공고의 핵심 역량과 직접 연결합니다.",
    filler_words: "불필요한 추임새를 줄이고 답변 흐름을 안정화합니다.",
  };
  return descriptions[String(target ?? "")] ?? "직전 세션에서 가장 약했던 구간을 우선 교정합니다.";
};

export const metricLabel = (metric?: string | null) => {
  const raw = String(metric ?? "");
  const value = raw.toLowerCase();
  if (!value) return "분석 지표";
  if (value.includes("legshaking") || value.includes("leg_shaking")) return "하체 움직임";
  if (value.includes("gaze")) return "시선 이탈";
  if (value.includes("posture")) return "자세 흔들림";
  if (value.includes("fidget")) return "반복 움직임";
  if (value.includes("star") || value.includes("structure")) return "STAR 답변 구조";
  if (value.includes("specificity")) return "근거 구체성";
  if (value.includes("jobfit") || value.includes("job_fit")) return "직무 적합성";
  if (value.includes("silence")) return "긴 침묵";
  if (value.includes("speakingratio")) return "발화 비율";
  if (value.includes("filler")) return "추임새";
  if (value.includes("answerlength")) return "답변 분량";
  if (value.includes("nonverbal")) return "비언어 안정성";
  if (value.includes("content")) return "답변 품질";
  if (value.includes("audio")) return "발화 안정성";
  return /[가-힣]/.test(raw) ? raw : "분석 지표";
};

export const metricValueText = (
  metric: string | undefined,
  operator?: string,
  threshold?: number
) => {
  const label = metricLabel(metric);
  if (typeof threshold !== "number") return label;

  const lower = String(metric ?? "").toLowerCase();
  const percentLike =
    lower.includes("ratio") ||
    lower.includes("fidget") ||
    lower.includes("posture") ||
    lower.includes("gaze");
  const thresholdText =
    percentLike && threshold <= 1
      ? `${Math.round(threshold * 100)}%`
      : `${threshold}점`;
  const direction =
    operator === "<" || operator === "<="
      ? "이하"
      : operator === ">" || operator === ">="
      ? "이상"
      : "";

  return `${label} ${thresholdText} ${direction}`.trim();
};

export const phaseLabel = (phase?: string | null) => {
  const labels: Record<string, string> = {
    ice_breaking: "도입 구간",
    basic_personality: "기본 역량 구간",
    job_competency: "직무 역량 구간",
    deep_dive: "심층 질문 구간",
    closing: "마무리 구간",
  };
  return labels[String(phase ?? "")] ?? "다음 교정 구간";
};

export const sessionStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    idle: "대기 중",
    active: "진행 중",
    finished: "완료",
    created: "준비됨",
    ready: "준비됨",
    pending: "대기 중",
  };
  return labels[String(status ?? "")] ?? "확인 중";
};
