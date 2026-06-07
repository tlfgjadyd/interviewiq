import json
import re
from dataclasses import dataclass
from typing import Any

from openai import OpenAI, OpenAIError

from app.core.config import settings


EVALUATOR_INSTRUCTIONS = """
You are InterviewIQ's answer evaluator. Return only compact JSON.
Evaluate the candidate answer for STAR structure, specificity, job fit,
keyword coverage, evidence strength, relevance, missing details, and follow-up seeds.
Never invent facts. If evidence is missing, mark it as missing.
""".strip()


@dataclass
class AnswerEvaluation:
    data: dict[str, Any]
    source: str
    error: str | None = None


class AnswerEvaluator:
    def __init__(self) -> None:
        api_key = (settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY or "").strip()
        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if settings.OPENROUTER_API_KEY:
            client_kwargs["base_url"] = settings.OPENROUTER_BASE_URL
        self.client = OpenAI(**client_kwargs) if api_key else None
        self.model = settings.OPENROUTER_QUESTION_MODEL
        self.enabled = settings.ENABLE_LLM_ANSWER_EVALUATION and self.client is not None

    def evaluate(
        self,
        *,
        question_meta: dict[str, Any],
        answer_text: str,
        resume_summary: dict[str, Any] | None = None,
        job_summary: dict[str, Any] | None = None,
        match_keywords: list[str] | None = None,
        behavior_metrics: dict[str, Any] | None = None,
    ) -> AnswerEvaluation:
        fallback = self._rule_based(
            question_meta=question_meta,
            answer_text=answer_text,
            job_summary=job_summary or {},
            match_keywords=match_keywords or [],
        )
        if not self.enabled or self.client is None:
            return AnswerEvaluation(data=fallback, source="fallback_rule_based")

        prompt = {
            "questionMeta": question_meta,
            "answerText": answer_text,
            "resumeSummary": resume_summary or {},
            "jobSummary": job_summary or {},
            "matchKeywords": match_keywords or [],
            "behaviorMetrics": behavior_metrics or {},
            "schema": {
                "star": {
                    "situation": "boolean",
                    "task": "boolean",
                    "action": "boolean",
                    "result": "boolean",
                    "score": "0-100 number",
                },
                "specificityScore": "0-100 number",
                "jobFitScore": "0-100 number",
                "keywordCoverageScore": "0-100 number",
                "evidenceScore": "0-100 number",
                "relevanceScore": "0-100 number",
                "missingDetails": ["string"],
                "followupSeeds": [
                    {
                        "keyword": "string",
                        "reason": "string",
                        "suggestedQuestion": "string",
                    }
                ],
            },
        }
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": EVALUATOR_INSTRUCTIONS},
                    {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content or "{}"
            parsed = json.loads(raw)
            return AnswerEvaluation(data=self._normalize(parsed, fallback), source="llm")
        except (OpenAIError, json.JSONDecodeError, TypeError, ValueError) as exc:
            return AnswerEvaluation(
                data=fallback,
                source="fallback_llm_error",
                error=str(exc),
            )

    def _rule_based(
        self,
        *,
        question_meta: dict[str, Any],
        answer_text: str,
        job_summary: dict[str, Any],
        match_keywords: list[str],
    ) -> dict[str, Any]:
        text = answer_text.strip()
        lower = text.lower()
        length = len(text)
        has_number = bool(
            re.search(r"\d|%|percent|month|months|ms|sec|seconds|minute|minutes", lower)
        )
        situation = any(
            word in lower for word in ["상황", "문제", "이슈", "배경", "context", "problem"]
        )
        task = any(
            word in lower for word in ["목표", "역할", "담당", "과제", "goal", "task", "role"]
        )
        action = any(
            word in lower
            for word in ["개선", "적용", "구현", "해결", "설계", "improve", "build", "solve"]
        )
        result = has_number or any(
            word in lower
            for word in ["결과", "성과", "감소", "증가", "향상", "result", "impact", "outcome"]
        )
        star_score = round(sum([situation, task, action, result]) / 4 * 100)
        required = [
            str(item).lower()
            for item in job_summary.get("requiredSkills", [])
            if isinstance(item, str)
        ]
        keywords = [str(item).lower() for item in match_keywords if isinstance(item, str)]
        keyword_pool = list(dict.fromkeys(required + keywords))
        keyword_hits = [keyword for keyword in keyword_pool if keyword and keyword in lower]
        keyword_score = (
            round(len(keyword_hits) / max(len(keyword_pool), 1) * 100)
            if keyword_pool
            else 50
        )
        specificity_score = min(
            100,
            round((length / 160) * 55 + (35 if has_number else 0) + (10 if action else 0)),
        )
        evidence_score = min(
            100,
            round((40 if has_number else 0) + (30 if result else 0) + min(length / 4, 30)),
        )
        relevance_score = 70 if question_meta.get("topic") and length >= 40 else min(60, length)
        job_fit_score = round(keyword_score * 0.6 + relevance_score * 0.4)
        missing = []
        if not task:
            missing.append("본인의 역할이나 과제가 명확하지 않습니다.")
        if not result:
            missing.append("결과나 성과 근거가 부족합니다.")
        if not has_number:
            missing.append("수치 기반 근거가 없습니다.")
        seed_keyword = keyword_hits[0] if keyword_hits else str(question_meta.get("topic") or "경험")
        return self._normalize(
            {
                "star": {
                    "situation": situation,
                    "task": task,
                    "action": action,
                    "result": result,
                    "score": star_score,
                },
                "specificityScore": specificity_score,
                "jobFitScore": job_fit_score,
                "keywordCoverageScore": keyword_score,
                "evidenceScore": evidence_score,
                "relevanceScore": relevance_score,
                "missingDetails": missing,
                "followupSeeds": [
                    {
                        "keyword": seed_keyword,
                        "reason": "구체 근거 확인이 필요합니다.",
                        "suggestedQuestion": f"{seed_keyword}에 대해 어떤 기준으로 성과를 확인했나요?",
                    }
                ],
            },
            {},
        )

    def _normalize(self, value: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
        def score(key: str, default: int = 50) -> int:
            raw = value.get(key, fallback.get(key, default))
            if isinstance(raw, (int, float)):
                return max(0, min(100, round(float(raw))))
            return default

        star_value = (
            value.get("star")
            if isinstance(value.get("star"), dict)
            else fallback.get("star", {})
        )
        raw_star_score = star_value.get("score") if isinstance(star_value, dict) else 0
        try:
            star_score = max(0, min(100, round(float(raw_star_score or 0))))
        except (TypeError, ValueError):
            star_score = 0
        star = {
            "situation": bool(star_value.get("situation")),
            "task": bool(star_value.get("task")),
            "action": bool(star_value.get("action")),
            "result": bool(star_value.get("result")),
            "score": star_score,
        }
        missing = value.get("missingDetails", fallback.get("missingDetails", []))
        seeds = value.get("followupSeeds", fallback.get("followupSeeds", []))
        return {
            "star": star,
            "specificityScore": score("specificityScore"),
            "jobFitScore": score("jobFitScore"),
            "keywordCoverageScore": score("keywordCoverageScore"),
            "evidenceScore": score("evidenceScore"),
            "relevanceScore": score("relevanceScore"),
            "missingDetails": [str(item) for item in missing if item],
            "followupSeeds": [
                {
                    "keyword": str(seed.get("keyword") or ""),
                    "reason": str(seed.get("reason") or ""),
                    "suggestedQuestion": str(seed.get("suggestedQuestion") or ""),
                }
                for seed in seeds
                if isinstance(seed, dict)
            ][:3],
        }
