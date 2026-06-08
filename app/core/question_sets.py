import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DEFAULT_QUESTION_SET_ID = "full_12"
QUESTION_SET_DIR = Path(__file__).resolve().parents[1] / "question_sets"


def _safe_question_set_id(question_set_id: str | None) -> str:
    if question_set_id in {"full_12", "demo_5"}:
        return question_set_id
    return DEFAULT_QUESTION_SET_ID


def _one_question_per_order(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected_by_order: dict[int, dict[str, Any]] = {}
    for question in sorted(questions, key=lambda item: int(item.get("order") or 0)):
        order = int(question.get("order") or 0)
        if order not in selected_by_order:
            selected_by_order[order] = question
    return list(selected_by_order.values())


@lru_cache(maxsize=8)
def load_question_set(question_set_id: str | None = None) -> dict[str, Any]:
    resolved_id = _safe_question_set_id(question_set_id)
    path = QUESTION_SET_DIR / f"{resolved_id}.json"
    with path.open("r", encoding="utf-8") as file:
        question_set = json.load(file)

    questions = question_set.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError(f"Question set {resolved_id} has no questions")

    question_set["questions"] = _one_question_per_order(questions)
    return question_set


def get_question_set_id(question_set_id: str | None = None) -> str:
    return str(load_question_set(question_set_id).get("questionSetId") or DEFAULT_QUESTION_SET_ID)


def get_questions(question_set_id: str | None = None) -> list[dict[str, Any]]:
    return load_question_set(question_set_id)["questions"]


def get_question(
    question_set_id: str | None,
    question_index: int,
) -> dict[str, Any]:
    questions = get_questions(question_set_id)
    safe_index = min(max(question_index, 1), len(questions))
    return questions[safe_index - 1]


def question_meta(question: dict[str, Any]) -> dict[str, Any]:
    flow = str(question.get("flow") or question.get("phase") or "ice_breaking")
    return {
        "questionId": str(question.get("questionId") or f"q{int(question.get('order') or 1):02d}"),
        "order": int(question.get("order") or 1),
        "flow": flow,
        "phase": flow,
        "topic": str(question.get("topic") or "general"),
        "title": question.get("title"),
        "text": str(question.get("text") or ""),
        "intent": question.get("intent"),
        "analysisFocus": question.get("analysisFocus") or [],
    }


def progress_for_question(
    question_index: int,
    total_questions: int | None = None,
    question_set_id: str | None = None,
) -> dict[str, Any]:
    questions = get_questions(question_set_id)
    safe_total = max(min(total_questions or len(questions), len(questions)), 1)
    safe_index = min(max(question_index, 1), safe_total)
    question = get_question(question_set_id, safe_index)
    meta = question_meta(question)
    phase_name = str(meta.get("flow") or "ice_breaking")
    visible_questions = questions[:safe_total]
    phase_question_indices = [
        index
        for index, candidate in enumerate(visible_questions, start=1)
        if str(candidate.get("flow") or candidate.get("phase")) == phase_name
    ]
    phase_question_index = (
        phase_question_indices.index(safe_index) + 1
        if safe_index in phase_question_indices
        else 1
    )

    return {
        "questionIndex": safe_index,
        "totalQuestions": safe_total,
        "phase": phase_name,
        "phaseGoal": str(question.get("intent") or ""),
        "phaseQuestionIndex": phase_question_index,
        "phaseQuestionTotal": len(phase_question_indices),
        "remainingQuestions": max(safe_total - safe_index, 0),
        "isFinalQuestion": safe_index >= safe_total,
        "questionMeta": meta,
    }
