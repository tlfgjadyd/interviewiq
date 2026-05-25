import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.redis import REDIS_TTL_SECONDS, get_redis
from app.llm import QuestionGenerator
from app.llm.question_generator import GeneratedQuestion
from app.llm.transcriber import AudioTranscriber
from app.rag import RagRetriever
from app.rag.schema import RagDocument, RagMetadata
from app.schemas.chunk import (
    AnswerChunkCounts,
    AnswerStatusResponse,
    AudioChunkMetadata,
    ChunkAck,
    ChunkStatus,
    SpeechChunkCreate,
    VisionChunkCreate,
)
from app.schemas.session import (
    AnswerAudioMetadata,
    AnswerAudioResponse,
    AnswerFinishRequest,
    AnswerFinishResponse,
    NextQuestionResponse,
    SessionCreate,
    SessionCreateResponse,
    SessionDocumentsRequest,
    SessionDocumentsResponse,
    SessionFinishResponse,
    SessionReportResponse,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
rag_retriever = RagRetriever()
question_generator = QuestionGenerator()
audio_transcriber = AudioTranscriber()
TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#.]+")
SKILL_KEYWORDS = [
    "python",
    "java",
    "spring",
    "spring boot",
    "fastapi",
    "react",
    "next.js",
    "mysql",
    "postgresql",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "rest api",
    "api",
    "db",
    "database",
    "sql",
    "성능",
    "최적화",
    "협업",
    "대용량",
    "트래픽",
    "운영",
    "장애",
    "테스트",
]
INTERVIEW_PHASES = [
    {
        "phase": "opening",
        "goal": "자기소개, 지원동기, 대표 경험을 넓게 확인한다.",
    },
    {
        "phase": "project_competency",
        "goal": "프로젝트 경험에서 본인의 역할, 기술 선택 이유, 문제 해결 과정, 결과를 확인한다.",
    },
    {
        "phase": "collaboration_problem_solving",
        "goal": "협업, 갈등 해결, 커뮤니케이션, 문제 해결 방식을 확인한다.",
    },
    {
        "phase": "fit_closing",
        "goal": "회사와 직무 적합도, 성장 방향, 마지막으로 강조하고 싶은 내용을 확인한다.",
    },
]


def _session_meta_key(session_id: str) -> str:
    return f"session:{session_id}:meta"


def _turns_key(session_id: str) -> str:
    return f"session:{session_id}:turns"


def _chunk_key(session_id: str, answer_turn_id: str, chunk_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:chunk:{chunk_id}"


def _session_chunk_pattern(session_id: str) -> str:
    return f"session:{session_id}:answer:*:chunk:*"


def _answer_chunks_key(session_id: str, answer_turn_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:chunks"


def _answer_analysis_key(session_id: str, answer_turn_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:analysis"


def _answer_audio_key(session_id: str, answer_turn_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:audio"


def _session_report_key(session_id: str) -> str:
    return f"session:{session_id}:report"


def _session_documents_key(session_id: str) -> str:
    return f"session:{session_id}:documents"


def _session_rag_docs_key(session_id: str) -> str:
    return f"session:{session_id}:rag:documents"


def _phase_for_question(question_index: int, total_questions: int) -> dict[str, Any]:
    safe_total = max(total_questions, 1)
    safe_index = min(max(question_index, 1), safe_total)
    phase_count = len(INTERVIEW_PHASES)
    phase_index = min((safe_index - 1) * phase_count // safe_total, phase_count - 1)
    phase = INTERVIEW_PHASES[phase_index]
    phase_start = (phase_index * safe_total) // phase_count + 1
    next_phase_start = ((phase_index + 1) * safe_total) // phase_count + 1
    phase_end = min(max(next_phase_start - 1, phase_start), safe_total)
    return {
        "questionIndex": safe_index,
        "totalQuestions": safe_total,
        "phase": phase["phase"],
        "phaseGoal": phase["goal"],
        "phaseQuestionIndex": safe_index - phase_start + 1,
        "phaseQuestionTotal": phase_end - phase_start + 1,
        "remainingQuestions": max(safe_total - safe_index, 0),
        "isFinalQuestion": safe_index >= safe_total,
    }


async def _redis():
    client = await get_redis()
    if client is None:
        raise HTTPException(status_code=503, detail="Redis is not initialized")
    return client


async def _read_json(key: str) -> dict[str, Any] | None:
    client = await _redis()
    raw = await client.get(key)
    return json.loads(raw) if raw else None


async def _write_json(key: str, value: dict[str, Any]) -> None:
    client = await _redis()
    await client.setex(key, REDIS_TTL_SECONDS, json.dumps(value, ensure_ascii=False))


async def _ensure_session(session_id: str) -> dict[str, Any]:
    meta = await _read_json(_session_meta_key(session_id))
    if meta is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return meta


async def _merge_chunk(
    session_id: str,
    answer_turn_id: str,
    chunk_id: str,
    patch: dict[str, Any],
) -> dict[str, Any]:
    existing = await _read_json(_chunk_key(session_id, answer_turn_id, chunk_id)) or {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": chunk_id,
        "version": None,
        "context": None,
        "vision": None,
        "speech": None,
        "audioFeatures": None,
        "realtimeAudioSignals": None,
        "audioPath": None,
        "status": ChunkStatus().model_dump(),
    }

    if existing["answerTurnId"] != answer_turn_id:
        raise HTTPException(
            status_code=409,
            detail="chunkId already belongs to another answerTurnId",
        )

    existing.update(patch)
    await _write_json(_chunk_key(session_id, answer_turn_id, chunk_id), existing)

    client = await _redis()
    await client.sadd(_answer_chunks_key(session_id, answer_turn_id), chunk_id)
    await client.expire(_answer_chunks_key(session_id, answer_turn_id), REDIS_TTL_SECONDS)
    return existing


async def _load_answer_chunks(session_id: str, answer_turn_id: str) -> list[dict[str, Any]]:
    client = await _redis()
    chunk_ids = await client.smembers(_answer_chunks_key(session_id, answer_turn_id))
    chunks = []
    for chunk_id in chunk_ids:
        chunk = await _read_json(_chunk_key(session_id, answer_turn_id, chunk_id))
        if chunk:
            chunks.append(chunk)
    return sorted(chunks, key=lambda item: (item.get("t0", 0), item.get("chunkId", "")))


async def _load_turn_ids(session_id: str) -> list[str]:
    client = await _redis()
    turn_ids = await client.lrange(_turns_key(session_id), 0, -1)
    return [str(turn_id) for turn_id in turn_ids]


async def _load_answer_analyses(session_id: str) -> list[dict[str, Any]]:
    analyses = []
    for answer_turn_id in await _load_turn_ids(session_id):
        analysis = await _read_json(_answer_analysis_key(session_id, answer_turn_id))
        if analysis:
            analyses.append(analysis)
    return analyses


async def _load_session_rag_documents(session_id: str) -> list[RagDocument]:
    client = await _redis()
    raw_documents = await client.lrange(_session_rag_docs_key(session_id), 0, -1)
    return [RagDocument.model_validate_json(raw) for raw in raw_documents]


def _count_chunks(chunks: list[dict[str, Any]]) -> AnswerChunkCounts:
    def ready(name: str) -> int:
        return sum(1 for chunk in chunks if chunk.get("status", {}).get(name))

    return AnswerChunkCounts(
        total=len(chunks),
        visionReady=ready("visionReady"),
        audioReceived=ready("audioReceived"),
        speechReady=ready("speechReady"),
        audioFeatureReady=ready("audioFeatureReady"),
        analysisReady=ready("analysisReady"),
    )


def _short_sentences(text: str, limit: int = 3) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text)
        if sentence.strip()
    ]
    if not sentences and text.strip():
        sentences = [text.strip()]
    return [sentence[:180] for sentence in sentences[:limit]]


def _keyword_hits(text: str) -> list[str]:
    lowered = text.lower()
    hits = []
    for keyword in SKILL_KEYWORDS:
        if keyword.lower() in lowered:
            hits.append(keyword)
    seen = set()
    return [keyword for keyword in hits if not (keyword in seen or seen.add(keyword))]


def _common_keywords(*groups: list[str]) -> list[str]:
    if not groups:
        return []
    normalized = [set(keyword.lower() for keyword in group) for group in groups]
    common = set.intersection(*normalized) if normalized else set()
    ordered = []
    for keyword in groups[0]:
        if keyword.lower() in common:
            ordered.append(keyword)
    return ordered[:8]


def _build_session_document_summary(payload: SessionDocumentsRequest) -> dict[str, Any]:
    resume_skills = _keyword_hits(payload.resumeText)
    job_skills = _keyword_hits(payload.jobPostingText)
    resume_sentences = _short_sentences(payload.resumeText)
    job_sentences = _short_sentences(payload.jobPostingText)
    match_keywords = _common_keywords(resume_skills, job_skills)

    return {
        "resumeSummary": {
            "experiences": resume_sentences,
            "skills": resume_skills[:10],
            "claims": [
                sentence
                for sentence in resume_sentences
                if any(word in sentence for word in ["개선", "해결", "기여", "협업", "성능"])
            ][:5],
        },
        "jobSummary": {
            "requiredSkills": job_skills[:10],
            "preferredSkills": [
                keyword
                for keyword in job_skills
                if keyword.lower() in {"대용량", "트래픽", "운영", "장애", "테스트"}
            ][:5],
            "responsibilities": job_sentences,
        },
        "matchKeywords": match_keywords,
    }


def _build_session_rag_documents(
    session_id: str,
    payload: SessionDocumentsRequest,
    summary: dict[str, Any],
) -> list[RagDocument]:
    company = payload.company
    role = payload.role or "general"
    match_keywords = ", ".join(summary["matchKeywords"]) or "공통 역량"
    resume_experience = " ".join(summary["resumeSummary"]["experiences"])[:500]
    job_responsibility = " ".join(summary["jobSummary"]["responsibilities"])[:500]

    return [
        RagDocument(
            id=f"session_{session_id}_resume_summary",
            content=(
                "지원자의 자기소개서 요약: "
                f"{resume_experience} 주요 키워드는 {', '.join(summary['resumeSummary']['skills']) or '추출 없음'}이다."
            ),
            metadata=RagMetadata(
                scope="session",
                sessionId=session_id,
                company=company,
                role=role,
                doc_type="resume_summary",
                topic="project_experience",
                source="uploaded_resume",
                priority=5,
            ),
        ),
        RagDocument(
            id=f"session_{session_id}_job_summary",
            content=(
                "채용공고 요약: "
                f"{job_responsibility} 요구 또는 관련 키워드는 "
                f"{', '.join(summary['jobSummary']['requiredSkills']) or '추출 없음'}이다."
            ),
            metadata=RagMetadata(
                scope="session",
                sessionId=session_id,
                company=company,
                role=role,
                doc_type="job_summary",
                topic="project_experience",
                source="uploaded_job_posting",
                priority=5,
            ),
        ),
        RagDocument(
            id=f"session_{session_id}_personalized_question_seed",
            content=(
                "자기소개서와 채용공고의 공통 키워드는 "
                f"{match_keywords}이다. 이 연결 지점을 기준으로 지원자의 실제 역할, "
                "기술 선택 근거, 결과 지표를 확인하는 맞춤 꼬리질문을 생성한다."
            ),
            metadata=RagMetadata(
                scope="session",
                sessionId=session_id,
                company=company,
                role=role,
                doc_type="followup_question",
                topic="project_experience",
                source="session_matcher",
                priority=5,
            ),
        ),
    ]


def _personalized_question(summary: dict[str, Any], role: str | None) -> str:
    role_label = (role or "지원 직무").replace("_", " ")
    match_keywords = summary["matchKeywords"]
    if match_keywords:
        keyword_text = ", ".join(match_keywords[:3])
        return (
            f"자기소개서와 채용공고에서 공통으로 드러난 {keyword_text} 경험에 대해 여쭤보겠습니다. "
            f"{role_label} 직무 관점에서 그 경험의 문제 상황, 본인의 역할, 적용한 기술, 결과를 설명해 주세요."
        )
    return (
        f"자기소개서의 주요 경험이 {role_label} 직무 요구사항과 어떻게 연결되는지, "
        "가장 대표적인 사례를 중심으로 설명해 주세요."
    )


def _generate_personalized_question(
    *,
    company: str | None,
    role: str | None,
    interview_type: str,
    summary: dict[str, Any],
    session_documents: list[RagDocument],
) -> GeneratedQuestion:
    fallback = _personalized_question(summary, role)
    rag_context = [
        {
            "id": document.id,
            "content": document.content,
            "metadata": document.metadata.model_dump(),
        }
        for document in session_documents
    ]
    generated = question_generator.generate_first_question(
        company=company or "unknown",
        role=role or "general",
        interview_type=interview_type,
        rag_context=rag_context,
        resume_summary=summary["resumeSummary"],
        job_summary=summary["jobSummary"],
        match_keywords=summary["matchKeywords"],
        fallback_question=fallback,
    )
    return generated


def _first_question(payload: SessionCreate) -> GeneratedQuestion:
    results = rag_retriever.search(
        company=payload.company,
        cluster=payload.cluster,
        industry=payload.industry,
        role=payload.role,
        interview_type=payload.interviewType,
        doc_types=["question", "evaluation_criteria", "star_guide"],
        limit=3,
    )
    rag_context = [
        {
            "id": result.document.id,
            "content": result.document.content,
            "metadata": result.document.metadata.model_dump(),
            "score": result.score,
            "reasons": result.reasons,
        }
        for result in results
    ]
    company = payload.company.replace("_", " ")
    role = payload.role.replace("_", " ")
    fallback = (
        f"{company} {role} 직무와 관련해 가장 자신 있게 설명할 수 있는 프로젝트 경험을 "
        "문제 상황, 본인의 역할, 해결 과정, 결과 중심으로 말씀해 주세요."
    )
    generated = question_generator.generate_first_question(
        company=payload.company,
        role=payload.role,
        interview_type=payload.interviewType,
        rag_context=rag_context,
        interview_progress=_phase_for_question(1, payload.totalQuestions),
        fallback_question=fallback,
    )
    return generated


def _next_question(
    meta: dict[str, Any],
    answer_text: str,
    session_documents: list[RagDocument] | None = None,
    nonverbal_feedback: dict[str, Any] | None = None,
    interview_progress: dict[str, Any] | None = None,
) -> tuple[GeneratedQuestion, list[dict[str, Any]]]:
    results = rag_retriever.search(
        company=meta.get("company"),
        cluster=meta.get("cluster"),
        industry=meta.get("industry"),
        role=meta.get("role"),
        interview_type=meta.get("interviewType"),
        text=answer_text,
        doc_types=[
            "followup_question",
            "evaluation_criteria",
            "star_guide",
            "resume_summary",
            "job_summary",
        ],
        extra_documents=session_documents,
        limit=6,
    )
    rag_context = [
        {
            "id": result.document.id,
            "content": result.document.content,
            "metadata": result.document.metadata.model_dump(),
            "score": result.score,
            "reasons": result.reasons,
        }
        for result in results
    ]
    followup = next(
        (
            result.document.content
            for result in results
            if result.document.metadata.doc_type == "followup_question"
        ),
        None,
    )
    progress = interview_progress or {}
    if progress.get("isFinalQuestion"):
        fallback = "마지막으로 이 직무와 회사에 본인이 기여할 수 있는 강점을 한 가지 경험과 함께 정리해 주세요."
    elif followup:
        fallback = followup
    elif answer_text.strip():
        fallback = "방금 답변에서 본인이 직접 맡은 역할과 결과를 수치나 근거 중심으로 조금 더 설명해 주세요."
    else:
        fallback = "답변 내용을 아직 확인하지 못했습니다. 같은 질문에 대해 핵심 경험을 다시 설명해 주세요."
    generated = question_generator.generate_followup_question(
        company=meta.get("company"),
        role=meta.get("role"),
        interview_type=meta.get("interviewType"),
        current_question=meta.get("currentQuestion"),
        answer_text=answer_text,
        rag_context=rag_context,
        nonverbal_feedback=nonverbal_feedback,
        fallback_question=fallback,
        interview_progress=progress,
    )
    return generated, rag_context


def _summarize_nonverbal(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    vision_chunks = [chunk for chunk in chunks if isinstance(chunk.get("vision"), dict)]
    if not vision_chunks:
        return {
            "summary": "수집된 비언어 chunk가 없어 자세/시선 피드백을 생성하지 못했습니다.",
            "signals": [],
            "events": [],
        }

    avg_behavior_risk = sum(
        chunk["vision"]["behaviorRiskScore"] for chunk in vision_chunks
    ) / len(vision_chunks)
    avg_nonverbal_risk = sum(
        chunk["vision"]["nonverbalRiskScore"] for chunk in vision_chunks
    ) / len(vision_chunks)
    avg_gaze_penalty = sum(
        chunk["vision"]["gaze"]["gazePenalty"] for chunk in vision_chunks
    ) / len(vision_chunks)
    avg_leg_shaking = sum(
        chunk["vision"]["gesture"]["legShakingScore"] for chunk in vision_chunks
    ) / len(vision_chunks)
    events = [
        {**event, "chunkId": chunk["chunkId"]}
        for chunk in vision_chunks
        for event in chunk["vision"].get("events", [])
    ]

    signals = [
        {"metric": "behaviorRiskScore", "value": round(avg_behavior_risk, 2)},
        {"metric": "nonverbalRiskScore", "value": round(avg_nonverbal_risk, 2)},
        {"metric": "gazePenalty", "value": round(avg_gaze_penalty, 2)},
        {"metric": "legShakingScore", "value": round(avg_leg_shaking, 2)},
    ]
    if avg_nonverbal_risk >= 70:
        summary = "비언어 위험도가 높은 구간이 있어 자세, 시선, 반복 움직임을 함께 점검하면 좋습니다."
    elif avg_gaze_penalty >= 50:
        summary = "얼굴 방향 또는 시선 안정성이 낮은 구간이 있어 정면 응시 표현을 보완하면 좋습니다."
    elif avg_leg_shaking >= 60:
        summary = "하체 반복 움직임으로 보이는 신호가 있어 다리 움직임을 줄이는 연습이 필요합니다."
    else:
        summary = "전반적인 비언어 위험도는 안정적인 편입니다."
    return {"summary": summary, "signals": signals, "events": events}


def _build_session_report(
    *,
    session_id: str,
    report_id: str,
    meta: dict[str, Any],
    analyses: list[dict[str, Any]],
) -> dict[str, Any]:
    answered_turns = [
        analysis for analysis in analyses if analysis.get("status") == "analysis_ready"
    ]
    answer_texts = [
        analysis.get("answerText", "").strip()
        for analysis in answered_turns
        if analysis.get("answerText", "").strip()
    ]
    nonverbal_summaries = [
        analysis.get("nonverbalFeedback", {}).get("summary")
        for analysis in answered_turns
        if isinstance(analysis.get("nonverbalFeedback"), dict)
    ]
    question_reports = []
    for analysis in answered_turns:
        progress = analysis.get("interviewProgress", {})
        question_reports.append(
            {
                "answerTurnId": analysis.get("answerTurnId"),
                "questionIndex": progress.get("questionIndex"),
                "phase": progress.get("phase"),
                "phaseGoal": progress.get("phaseGoal"),
                "answerText": analysis.get("answerText", ""),
                "answerTextSource": analysis.get("answerTextSource"),
                "transcription": analysis.get("transcription"),
                "contentFeedback": analysis.get("contentFeedback", []),
                "nonverbalFeedback": analysis.get("nonverbalFeedback", {}),
                "endedBy": analysis.get("endedBy"),
                "endedAt": analysis.get("endedAt"),
            }
        )

    summary_sentences = _short_sentences(" ".join(answer_texts), limit=2)
    if not summary_sentences:
        summary_sentences = ["아직 transcript 기반 답변 요약을 생성할 수 없습니다."]

    improvement_points = [
        "답변마다 본인의 역할, 선택 이유, 결과 지표를 함께 말하는 연습이 필요합니다.",
        "긴 침묵이나 시선 이탈 구간은 최종 리포트에서 구간별로 확인하고 다음 연습 때 줄여봅니다.",
        "마지막 답변에서는 직무와 연결되는 핵심 강점을 한 문장으로 정리하는 연습이 좋습니다.",
    ]

    return {
        "sessionId": session_id,
        "reportId": report_id,
        "status": "ready",
        "company": meta.get("company"),
        "role": meta.get("role"),
        "interviewType": meta.get("interviewType"),
        "totalQuestions": meta.get("totalQuestions"),
        "answeredQuestions": len(answered_turns),
        "overallSummary": summary_sentences,
        "overallFeedback": {
            "content": "답변 내용은 역할, 과정, 결과 근거가 함께 드러날수록 설득력이 높아집니다.",
            "nonverbal": nonverbal_summaries[-1]
            if nonverbal_summaries
            else "수집된 비언어 분석 요약이 없습니다.",
            "improvementPoints": improvement_points,
        },
        "questions": question_reports,
        "nextPractice": {
            "recommendedQuestion": "가장 자신 있는 프로젝트 경험을 STAR 구조로 1분 안에 다시 설명해 보세요.",
            "focus": ["역할 명확화", "수치 기반 결과", "시선과 침묵 구간 점검"],
        },
    }


async def _save_session_report(
    session_id: str,
    meta: dict[str, Any],
    report_id: str | None = None,
) -> dict[str, Any]:
    resolved_report_id = report_id or meta.get("reportId") or f"r_{uuid.uuid4().hex[:12]}"
    analyses = await _load_answer_analyses(session_id)
    report = _build_session_report(
        session_id=session_id,
        report_id=resolved_report_id,
        meta=meta,
        analyses=analyses,
    )
    await _write_json(_session_report_key(session_id), report)
    return report


@router.post("", response_model=SessionCreateResponse)
async def create_session(payload: SessionCreate):
    client = await _redis()
    session_id = f"s_{uuid.uuid4().hex[:12]}"
    answer_turn_id = f"a_{uuid.uuid4().hex[:12]}"
    progress = _phase_for_question(1, payload.totalQuestions)
    first_question = _first_question(payload)

    meta = {
        "sessionId": session_id,
        "company": payload.company,
        "role": payload.role,
        "interviewType": payload.interviewType,
        "chunkMs": payload.chunkMs,
        "cluster": payload.cluster,
        "industry": payload.industry,
        "status": "active",
        "currentAnswerTurnId": answer_turn_id,
        "currentQuestion": first_question.text,
        "currentQuestionSource": first_question.source,
        **progress,
    }

    await _write_json(_session_meta_key(session_id), meta)
    await client.rpush(_turns_key(session_id), answer_turn_id)
    await client.expire(_turns_key(session_id), REDIS_TTL_SECONDS)
    return SessionCreateResponse(
        sessionId=session_id,
        answerTurnId=answer_turn_id,
        firstQuestion=first_question.text,
        firstQuestionSource=first_question.source,
        questionIndex=progress["questionIndex"],
        totalQuestions=progress["totalQuestions"],
        phase=progress["phase"],
        phaseGoal=progress["phaseGoal"],
    )


@router.post("/{session_id}/documents", response_model=SessionDocumentsResponse)
async def process_session_documents(session_id: str, payload: SessionDocumentsRequest):
    meta = await _ensure_session(session_id)
    company = payload.company or meta.get("company")
    role = payload.role or meta.get("role")
    normalized_payload = payload.model_copy(update={"company": company, "role": role})

    summary = _build_session_document_summary(normalized_payload)
    documents = _build_session_rag_documents(session_id, normalized_payload, summary)
    personalized_question = _generate_personalized_question(
        company=company,
        role=role,
        interview_type=meta.get("interviewType", "project_experience"),
        summary=summary,
        session_documents=documents,
    )

    stored_summary = {
        "sessionId": session_id,
        "company": company,
        "role": role,
        "resumeText": payload.resumeText,
        "jobPostingText": payload.jobPostingText,
        **summary,
        "personalizedQuestion": personalized_question.text,
        "personalizedQuestionSource": personalized_question.source,
    }
    await _write_json(_session_documents_key(session_id), stored_summary)

    client = await _redis()
    await client.delete(_session_rag_docs_key(session_id))
    for document in documents:
        await client.rpush(
            _session_rag_docs_key(session_id),
            document.model_dump_json(),
        )
    await client.expire(_session_rag_docs_key(session_id), REDIS_TTL_SECONDS)

    meta["hasSessionDocuments"] = True
    meta["currentQuestion"] = personalized_question.text
    meta["currentQuestionSource"] = personalized_question.source
    await _write_json(_session_meta_key(session_id), meta)

    return SessionDocumentsResponse(
        status="processed",
        resumeSummary=summary["resumeSummary"],
        jobSummary=summary["jobSummary"],
        matchKeywords=summary["matchKeywords"],
        personalizedQuestion=personalized_question.text,
        personalizedQuestionSource=personalized_question.source,
    )


@router.get("/{session_id}/documents")
async def get_session_documents(session_id: str):
    await _ensure_session(session_id)
    documents = await _read_json(_session_documents_key(session_id))
    if documents is None:
        raise HTTPException(status_code=404, detail="Session documents not found")
    return documents


@router.post("/{session_id}/vision-chunks", response_model=ChunkAck)
async def receive_vision_chunk(session_id: str, payload: VisionChunkCreate):
    await _ensure_session(session_id)
    if payload.sessionId != session_id:
        raise HTTPException(status_code=400, detail="Path session_id and body sessionId differ")

    status = ChunkStatus(visionReady=True).model_dump()
    chunk = await _merge_chunk(
        session_id=session_id,
        answer_turn_id=payload.answerTurnId,
        chunk_id=payload.chunkId,
        patch={
            "t0": payload.t0,
            "t1": payload.t1,
            "version": payload.version,
            "context": payload.context.model_dump(),
            "vision": payload.vision.model_dump(),
            "realtimeAudioSignals": (
                payload.realtimeAudioSignals.model_dump()
                if payload.realtimeAudioSignals
                else None
            ),
            "status": {
                **(
                    await _read_json(
                        _chunk_key(session_id, payload.answerTurnId, payload.chunkId)
                    )
                    or {}
                ).get("status", {}),
                **status,
            },
        },
    )
    return ChunkAck(
        sessionId=session_id,
        answerTurnId=payload.answerTurnId,
        chunkId=payload.chunkId,
        status=ChunkStatus(**chunk["status"]),
    )


@router.post("/{session_id}/audio-chunks", response_model=ChunkAck)
async def receive_audio_chunk(
    session_id: str,
    audio: UploadFile = File(...),
    metadata: str = Form(...),
):
    await _ensure_session(session_id)
    try:
        parsed_metadata = AudioChunkMetadata.model_validate_json(metadata)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc

    safe_chunk_id = "".join(
        char for char in parsed_metadata.chunkId if char.isalnum() or char in {"_", "-"}
    )
    safe_answer_turn_id = "".join(
        char
        for char in parsed_metadata.answerTurnId
        if char.isalnum() or char in {"_", "-"}
    )
    audio_dir = Path(tempfile.gettempdir()) / "interviewiq_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{session_id}_{safe_answer_turn_id}_{safe_chunk_id}.webm"
    audio_path.write_bytes(await audio.read())

    existing = (
        await _read_json(
            _chunk_key(session_id, parsed_metadata.answerTurnId, parsed_metadata.chunkId)
        )
        or {}
    )
    chunk = await _merge_chunk(
        session_id=session_id,
        answer_turn_id=parsed_metadata.answerTurnId,
        chunk_id=parsed_metadata.chunkId,
        patch={
            "t0": parsed_metadata.t0,
            "t1": parsed_metadata.t1,
            "audioPath": str(audio_path),
            "audioMimeType": parsed_metadata.mimeType,
            "audioMetadata": {
                "language": parsed_metadata.language,
                "browserTranscript": parsed_metadata.browserTranscript,
                "browserLatestText": parsed_metadata.browserLatestText,
            },
            "status": {
                **existing.get("status", {}),
                "audioReceived": True,
                "speechReady": False,
                "audioFeatureReady": False,
            },
        },
    )
    return ChunkAck(
        sessionId=session_id,
        answerTurnId=parsed_metadata.answerTurnId,
        chunkId=parsed_metadata.chunkId,
        status=ChunkStatus(**chunk["status"]),
    )


@router.post("/{session_id}/answers/{answer_turn_id}/audio", response_model=AnswerAudioResponse)
async def receive_answer_audio(
    session_id: str,
    answer_turn_id: str,
    audio: UploadFile = File(...),
    metadata: str = Form(...),
):
    await _ensure_session(session_id)
    try:
        parsed_metadata = AnswerAudioMetadata.model_validate_json(metadata)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc

    if parsed_metadata.answerTurnId != answer_turn_id:
        raise HTTPException(
            status_code=400,
            detail="Path answer_turn_id and metadata answerTurnId differ",
        )

    safe_answer_turn_id = "".join(
        char for char in answer_turn_id if char.isalnum() or char in {"_", "-"}
    )
    original_suffix = Path(audio.filename or "").suffix
    suffix = original_suffix if original_suffix else ".webm"
    if not suffix.startswith(".") or len(suffix) > 12:
        suffix = ".webm"

    audio_dir = Path(tempfile.gettempdir()) / "interviewiq_audio" / "answers"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{session_id}_{safe_answer_turn_id}{suffix}"
    audio_path.write_bytes(await audio.read())

    stored_audio = {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "audioPath": str(audio_path),
        "audioMimeType": parsed_metadata.mimeType,
        "audioMetadata": {
            "startedAt": parsed_metadata.startedAt,
            "endedAt": parsed_metadata.endedAt,
            "durationMs": parsed_metadata.durationMs,
            "language": parsed_metadata.language,
            "browserTranscript": parsed_metadata.browserTranscript,
            "browserLatestText": parsed_metadata.browserLatestText,
        },
        "status": {
            "audioReceived": True,
            "speechReady": False,
            "audioFeatureReady": False,
        },
    }
    await _write_json(_answer_audio_key(session_id, answer_turn_id), stored_audio)

    return AnswerAudioResponse(
        sessionId=session_id,
        answerTurnId=answer_turn_id,
        status="received",
        audioPath=str(audio_path),
        mimeType=parsed_metadata.mimeType,
        durationMs=parsed_metadata.durationMs,
    )


@router.post("/{session_id}/speech-chunks", response_model=ChunkAck)
async def receive_speech_chunk(session_id: str, payload: SpeechChunkCreate):
    await _ensure_session(session_id)
    existing = await _read_json(_chunk_key(session_id, payload.answerTurnId, payload.chunkId)) or {}
    chunk = await _merge_chunk(
        session_id=session_id,
        answer_turn_id=payload.answerTurnId,
        chunk_id=payload.chunkId,
        patch={
            "speech": {
                "text": payload.text,
                "segments": [segment.model_dump() for segment in payload.segments],
                "source": payload.source,
            },
            "status": {
                **existing.get("status", {}),
                "speechReady": True,
            },
        },
    )
    return ChunkAck(
        sessionId=session_id,
        answerTurnId=payload.answerTurnId,
        chunkId=payload.chunkId,
        status=ChunkStatus(**chunk["status"]),
    )


@router.post("/{session_id}/answers/{answer_turn_id}/finish", response_model=AnswerFinishResponse)
async def finish_answer(
    session_id: str,
    answer_turn_id: str,
    payload: AnswerFinishRequest,
):
    meta = await _ensure_session(session_id)
    chunks = await _load_answer_chunks(session_id, answer_turn_id)
    answer_audio = await _read_json(_answer_audio_key(session_id, answer_turn_id))
    transcription = None
    if answer_audio:
        audio_metadata = (
            answer_audio.get("audioMetadata", {})
            if isinstance(answer_audio.get("audioMetadata"), dict)
            else {}
        )
        transcription = await audio_transcriber.transcribe_answer_audio(
            audio_path=answer_audio.get("audioPath"),
            language=payload.language or audio_metadata.get("language"),
        )
        answer_audio["transcription"] = {
            "text": transcription.text,
            "source": transcription.source,
            "model": transcription.model,
            "error": transcription.error,
        }
        answer_audio["status"] = {
            **answer_audio.get("status", {}),
            "speechReady": bool(transcription.text.strip()),
        }
        await _write_json(_answer_audio_key(session_id, answer_turn_id), answer_audio)

    speech_chunk_text = " ".join(
        chunk.get("speech", {}).get("text", "")
        for chunk in chunks
        if isinstance(chunk.get("speech"), dict)
    ).strip()

    answer_text = transcription.text.strip() if transcription else ""
    answer_text_source = transcription.source if answer_text and transcription else "none"
    if not answer_text and speech_chunk_text:
        answer_text = speech_chunk_text
        answer_text_source = "speech_chunks"
    if not answer_text and payload.browserTranscript:
        answer_text = payload.browserTranscript.strip()
        answer_text_source = "browser_speech_recognition"
    if not answer_text and answer_audio:
        audio_transcript = (
            answer_audio.get("audioMetadata", {}).get("browserTranscript")
            if isinstance(answer_audio.get("audioMetadata"), dict)
            else None
        )
        if audio_transcript:
            answer_text = audio_transcript.strip()
            answer_text_source = "answer_audio_browser_speech_recognition"
    nonverbal = _summarize_nonverbal(chunks)
    current_progress = {
        "questionIndex": meta.get("questionIndex", 1),
        "totalQuestions": meta.get("totalQuestions", 12),
        "phase": meta.get("phase"),
        "phaseGoal": meta.get("phaseGoal"),
        "phaseQuestionIndex": meta.get("phaseQuestionIndex"),
        "phaseQuestionTotal": meta.get("phaseQuestionTotal"),
        "remainingQuestions": meta.get("remainingQuestions"),
        "isFinalQuestion": meta.get("isFinalQuestion", False),
    }
    is_final_answer = bool(current_progress.get("isFinalQuestion")) or int(
        current_progress.get("questionIndex", 1)
    ) >= int(current_progress.get("totalQuestions", 12))

    next_answer_turn_id = None
    next_question = None
    next_progress = None
    rag_context = []
    if not is_final_answer:
        next_answer_turn_id = f"a_{uuid.uuid4().hex[:12]}"
        session_documents = await _load_session_rag_documents(session_id)
        next_question_index = min(
            int(meta.get("questionIndex", 1)) + 1,
            int(meta.get("totalQuestions", 12)),
        )
        next_progress = _phase_for_question(
            next_question_index,
            int(meta.get("totalQuestions", 12)),
        )
        next_question, rag_context = _next_question(
            meta,
            answer_text,
            session_documents,
            nonverbal,
            next_progress,
        )

    analysis = {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "status": "analysis_ready",
        "endedBy": payload.endedBy,
        "endedAt": payload.endedAt,
        "endPhrase": payload.endPhrase,
        "language": payload.language,
        "speechMetrics": payload.speechMetrics,
        "browserTranscript": payload.browserTranscript,
        "answerAudio": answer_audio,
        "transcription": (
            {
                "text": transcription.text,
                "source": transcription.source,
                "model": transcription.model,
                "error": transcription.error,
            }
            if transcription
            else None
        ),
        "answerText": answer_text,
        "answerTextSource": answer_text_source,
        "chunkCount": len(chunks),
        "interviewProgress": current_progress,
        "nextInterviewProgress": next_progress,
        "ragContext": rag_context,
        "contentFeedback": [
            "답변에는 본인의 역할, 기술 선택 이유, 결과 지표가 포함될수록 좋습니다.",
            "전사된 답변 텍스트를 기준으로 답변의 구체성과 구조를 점검합니다.",
        ],
        "nonverbalFeedback": nonverbal,
        "nextAnswerTurnId": next_answer_turn_id,
        "nextQuestion": next_question.text if next_question else None,
        "nextQuestionSource": next_question.source if next_question else None,
    }
    await _write_json(_answer_analysis_key(session_id, answer_turn_id), analysis)

    client = await _redis()
    if is_final_answer:
        report_id = meta.get("reportId") or f"r_{uuid.uuid4().hex[:12]}"
        meta["status"] = "finished"
        meta["reportId"] = report_id
        meta["finishedBy"] = "total_questions"
        meta["finishedAt"] = payload.endedAt
        await _write_json(_session_meta_key(session_id), meta)
        await _save_session_report(session_id, meta, report_id)
        return AnswerFinishResponse(
            answerTurnId=answer_turn_id,
            status="analysis_ready",
            nextQuestionPending=False,
            nextAnswerTurnId=None,
            nextQuestion=None,
            nextQuestionSource=None,
            questionIndex=int(current_progress.get("questionIndex", 1)),
            totalQuestions=int(current_progress.get("totalQuestions", 12)),
            phase=str(current_progress.get("phase") or "fit_closing"),
            phaseGoal=str(current_progress.get("phaseGoal") or INTERVIEW_PHASES[-1]["goal"]),
            sessionFinished=True,
            reportId=report_id,
        )

    meta["currentAnswerTurnId"] = next_answer_turn_id
    meta["currentQuestion"] = next_question.text if next_question else None
    meta["currentQuestionSource"] = next_question.source if next_question else None
    meta.update(next_progress or {})
    await _write_json(_session_meta_key(session_id), meta)
    await client.rpush(_turns_key(session_id), next_answer_turn_id)
    await client.expire(_turns_key(session_id), REDIS_TTL_SECONDS)

    return AnswerFinishResponse(
        answerTurnId=answer_turn_id,
        status="analysis_ready",
        nextQuestionPending=False,
        nextAnswerTurnId=next_answer_turn_id,
        nextQuestion=next_question.text if next_question else None,
        nextQuestionSource=next_question.source if next_question else None,
        questionIndex=next_progress["questionIndex"] if next_progress else 1,
        totalQuestions=next_progress["totalQuestions"] if next_progress else 12,
        phase=next_progress["phase"] if next_progress else "opening",
        phaseGoal=next_progress["phaseGoal"] if next_progress else INTERVIEW_PHASES[0]["goal"],
        sessionFinished=False,
        reportId=None,
    )


@router.get("/{session_id}/answers/{answer_turn_id}/status", response_model=AnswerStatusResponse)
async def get_answer_status(session_id: str, answer_turn_id: str):
    await _ensure_session(session_id)
    chunks = await _load_answer_chunks(session_id, answer_turn_id)
    analysis = await _read_json(_answer_analysis_key(session_id, answer_turn_id))
    return AnswerStatusResponse(
        answerTurnId=answer_turn_id,
        status="analysis_ready" if analysis else "collecting",
        chunks=_count_chunks(chunks),
    )


@router.get("/{session_id}/answers/{answer_turn_id}/analysis")
async def get_answer_analysis(session_id: str, answer_turn_id: str):
    await _ensure_session(session_id)
    analysis = await _read_json(_answer_analysis_key(session_id, answer_turn_id))
    if analysis is None:
        raise HTTPException(status_code=404, detail="Answer analysis not found")
    return analysis


@router.get("/{session_id}/next-question", response_model=NextQuestionResponse)
async def get_next_question(session_id: str):
    meta = await _ensure_session(session_id)
    return NextQuestionResponse(
        sessionId=session_id,
        answerTurnId=meta["currentAnswerTurnId"],
        question=meta["currentQuestion"],
        questionSource=meta.get("currentQuestionSource"),
        questionIndex=meta.get("questionIndex", 1),
        totalQuestions=meta.get("totalQuestions", 12),
        phase=meta.get("phase", "opening"),
        phaseGoal=meta.get("phaseGoal", INTERVIEW_PHASES[0]["goal"]),
    )


@router.get("/{session_id}/chunks")
async def get_session_chunks(session_id: str):
    await _ensure_session(session_id)
    client = await _redis()
    keys = await client.keys(_session_chunk_pattern(session_id))
    chunks = []
    for key in keys:
        chunk = await _read_json(key)
        if chunk:
            chunks.append(chunk)
    return sorted(chunks, key=lambda item: (item.get("t0", 0), item.get("chunkId", "")))


@router.get("/{session_id}/report", response_model=SessionReportResponse)
async def get_session_report(session_id: str):
    meta = await _ensure_session(session_id)
    report = await _read_json(_session_report_key(session_id))
    if report is None and meta.get("status") == "finished":
        report = await _save_session_report(session_id, meta, meta.get("reportId"))
    if report is None:
        raise HTTPException(status_code=404, detail="Session report not ready")
    return SessionReportResponse(
        sessionId=session_id,
        reportId=report["reportId"],
        status="ready",
        report=report,
    )


@router.post("/{session_id}/finish", response_model=SessionFinishResponse)
async def finish_session(session_id: str):
    meta = await _ensure_session(session_id)
    report_id = meta.get("reportId") or f"r_{uuid.uuid4().hex[:12]}"
    meta["status"] = "finished"
    meta["reportId"] = report_id
    meta["finishedBy"] = "manual_session_finish"
    await _write_json(_session_meta_key(session_id), meta)
    await _save_session_report(session_id, meta, report_id)
    return SessionFinishResponse(sessionId=session_id, status="finished", reportId=report_id)
