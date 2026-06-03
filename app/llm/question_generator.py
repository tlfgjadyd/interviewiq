import json
from dataclasses import dataclass
from typing import Any

from openai import OpenAI, OpenAIError

from app.core.config import settings


QUESTION_INSTRUCTIONS = """
당신은 InterviewIQ의 한국어 AI 면접관입니다.
지원자의 회사, 직무, 자기소개서, 채용공고, RAG 근거를 바탕으로 면접 질문을 생성합니다.

규칙:
- 질문은 한국어 한 문장으로 작성합니다.
- 지원자를 압박하거나 평가를 단정하지 않습니다.
- 자기소개서나 채용공고의 구체 키워드를 자연스럽게 반영합니다.
- 첫 질문은 답변을 유도하는 넓은 질문으로 만듭니다.
- interviewProgress가 있으면 현재 phase와 phaseGoal에 맞는 질문을 만듭니다.
- 꼬리질문은 직전 답변에서 모호한 역할, 기술 선택 근거, 결과 지표를 확인합니다.
- 마지막 질문 구간에서는 사용자가 핵심 강점이나 마무리 발언을 정리할 수 있게 묻습니다.
- 비언어 신호는 질문의 보조 맥락으로만 사용하고, 긴장/불안처럼 감정을 단정하지 않습니다.
""".strip()


@dataclass
class GeneratedQuestion:
    text: str
    source: str
    error: str | None = None


class QuestionGenerator:
    def __init__(self) -> None:
        api_key = (settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY or "").strip()
        self.client = (
            OpenAI(
                api_key=api_key,
                base_url=settings.OPENROUTER_BASE_URL,
            )
            if api_key
            else None
        )
        self.model = settings.OPENROUTER_QUESTION_MODEL
        self.enabled = settings.ENABLE_LLM_QUESTION_GENERATION and self.client is not None

    def generate_first_question(
        self,
        *,
        company: str,
        role: str,
        interview_type: str,
        rag_context: list[dict[str, Any]] | list[str],
        resume_summary: dict[str, Any] | None = None,
        job_summary: dict[str, Any] | None = None,
        match_keywords: list[str] | None = None,
        fallback_question: str,
        interview_progress: dict[str, Any] | None = None,
    ) -> GeneratedQuestion:
        if not self.enabled:
            return GeneratedQuestion(text=fallback_question, source="fallback_disabled")

        prompt = {
            "task": "generate_first_question",
            "company": company,
            "role": role,
            "interviewType": interview_type,
            "resumeSummary": resume_summary or {},
            "jobSummary": job_summary or {},
            "matchKeywords": match_keywords or [],
            "ragContext": rag_context,
            "interviewProgress": interview_progress or {},
            "fallbackQuestion": fallback_question,
        }
        return self._generate_question(prompt, fallback_question)

    def generate_followup_question(
        self,
        *,
        company: str | None,
        role: str | None,
        interview_type: str | None,
        current_question: str | None,
        answer_text: str,
        rag_context: list[dict[str, Any]],
        nonverbal_feedback: dict[str, Any] | None,
        fallback_question: str,
        interview_progress: dict[str, Any] | None = None,
    ) -> GeneratedQuestion:
        if not self.enabled:
            return GeneratedQuestion(text=fallback_question, source="fallback_disabled")

        prompt = {
            "task": "generate_followup_question",
            "company": company,
            "role": role,
            "interviewType": interview_type,
            "currentQuestion": current_question,
            "answerText": answer_text,
            "ragContext": rag_context,
            "nonverbalFeedback": nonverbal_feedback or {},
            "interviewProgress": interview_progress or {},
            "fallbackQuestion": fallback_question,
        }
        return self._generate_question(prompt, fallback_question)

    def _generate_question(self, prompt: dict[str, Any], fallback_question: str) -> GeneratedQuestion:
        if self.client is None:
            return GeneratedQuestion(text=fallback_question, source="fallback_missing_api_key")

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": QUESTION_INSTRUCTIONS},
                    {
                        "role": "user",
                        "content": json.dumps(prompt, ensure_ascii=False),
                    },
                ],
                temperature=0.3,
            )
        except OpenAIError as exc:
            return GeneratedQuestion(
                text=fallback_question,
                source="fallback_openai_error",
                error=str(exc),
            )

        question = (response.choices[0].message.content or "").strip()
        if not question:
            return GeneratedQuestion(text=fallback_question, source="fallback_empty_output")
        cleaned = self._clean_question(question)
        if not cleaned:
            return GeneratedQuestion(text=fallback_question, source="fallback_empty_output")
        return GeneratedQuestion(text=cleaned, source="openai")

    def _clean_question(self, question: str) -> str:
        lines = [line.strip(" -\t") for line in question.splitlines() if line.strip()]
        cleaned = " ".join(lines).strip()
        if len(cleaned) > 260:
            cleaned = cleaned[:260].rstrip()
        return cleaned
