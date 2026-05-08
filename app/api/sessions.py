import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.redis import REDIS_TTL_SECONDS, get_redis
from app.rag import RagRetriever
from app.rag.schema import RagDocument, RagMetadata
from app.schemas.chunk import (
    AnswerChunkCounts,
    AnswerStatusResponse,
    AudioChunkMetadata,
    ChunkAck,
    ChunkStatus,
    VisionChunkCreate,
)
from app.schemas.session import (
    AnswerFinishRequest,
    AnswerFinishResponse,
    NextQuestionResponse,
    SessionCreate,
    SessionCreateResponse,
    SessionDocumentsRequest,
    SessionDocumentsResponse,
    SessionFinishResponse,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
rag_retriever = RagRetriever()
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


def _session_meta_key(session_id: str) -> str:
    return f"session:{session_id}:meta"


def _turns_key(session_id: str) -> str:
    return f"session:{session_id}:turns"


def _chunk_key(session_id: str, chunk_id: str) -> str:
    return f"session:{session_id}:chunk:{chunk_id}"


def _answer_chunks_key(session_id: str, answer_turn_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:chunks"


def _answer_analysis_key(session_id: str, answer_turn_id: str) -> str:
    return f"session:{session_id}:answer:{answer_turn_id}:analysis"


def _session_documents_key(session_id: str) -> str:
    return f"session:{session_id}:documents"


def _session_rag_docs_key(session_id: str) -> str:
    return f"session:{session_id}:rag:documents"


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
    existing = await _read_json(_chunk_key(session_id, chunk_id)) or {
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
    await _write_json(_chunk_key(session_id, chunk_id), existing)

    client = await _redis()
    await client.sadd(_answer_chunks_key(session_id, answer_turn_id), chunk_id)
    await client.expire(_answer_chunks_key(session_id, answer_turn_id), REDIS_TTL_SECONDS)
    return existing


async def _load_answer_chunks(session_id: str, answer_turn_id: str) -> list[dict[str, Any]]:
    client = await _redis()
    chunk_ids = await client.smembers(_answer_chunks_key(session_id, answer_turn_id))
    chunks = []
    for chunk_id in chunk_ids:
        chunk = await _read_json(_chunk_key(session_id, chunk_id))
        if chunk:
            chunks.append(chunk)
    return sorted(chunks, key=lambda item: (item.get("t0", 0), item.get("chunkId", "")))


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
            f"자기소개서와 채용공고에서 공통으로 드러난 {keyword_text} 경험을 기준으로 질문드리겠습니다. "
            f"{role_label} 직무에서 이 역량을 발휘했던 구체적인 상황, 본인의 역할, 결과를 설명해 주세요."
        )
    return (
        f"자기소개서의 주요 경험이 {role_label} 직무 요구사항과 어떻게 연결되는지, "
        "가장 대표적인 사례를 중심으로 설명해 주세요."
    )


def _first_question(payload: SessionCreate) -> str:
    contexts = rag_retriever.context_strings(
        company=payload.company,
        cluster=payload.cluster,
        industry=payload.industry,
        role=payload.role,
        interview_type=payload.interviewType,
        doc_types=["question", "evaluation_criteria", "star_guide"],
        limit=3,
    )
    company = payload.company.replace("_", " ")
    role = payload.role.replace("_", " ")
    if contexts:
        return f"{company} {role} 직무 기준으로 질문드리겠습니다. {contexts[0]}"
    return f"{company} {role} 직무 지원자로서, 가장 자신 있게 설명할 수 있는 프로젝트 경험을 말해주세요."


def _next_question(
    meta: dict[str, Any],
    answer_text: str,
    session_documents: list[RagDocument] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
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
    if followup:
        return followup, rag_context
    if answer_text.strip():
        return (
            "방금 답변에서 본인이 직접 맡은 역할과 결과를 수치나 근거 중심으로 조금 더 설명해 주세요.",
            rag_context,
        )
    return (
        "답변 내용을 아직 확인하지 못했습니다. 같은 질문에 대해 핵심 경험을 다시 설명해 주세요.",
        rag_context,
    )


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


@router.post("", response_model=SessionCreateResponse)
async def create_session(payload: SessionCreate):
    client = await _redis()
    session_id = f"s_{uuid.uuid4().hex[:12]}"
    answer_turn_id = f"a_{uuid.uuid4().hex[:12]}"
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
        "currentQuestion": first_question,
    }

    await _write_json(_session_meta_key(session_id), meta)
    await client.rpush(_turns_key(session_id), answer_turn_id)
    await client.expire(_turns_key(session_id), REDIS_TTL_SECONDS)
    return SessionCreateResponse(
        sessionId=session_id,
        answerTurnId=answer_turn_id,
        firstQuestion=first_question,
    )


@router.post("/{session_id}/documents", response_model=SessionDocumentsResponse)
async def process_session_documents(session_id: str, payload: SessionDocumentsRequest):
    meta = await _ensure_session(session_id)
    company = payload.company or meta.get("company")
    role = payload.role or meta.get("role")
    normalized_payload = payload.model_copy(update={"company": company, "role": role})

    summary = _build_session_document_summary(normalized_payload)
    documents = _build_session_rag_documents(session_id, normalized_payload, summary)
    personalized_question = _personalized_question(summary, role)

    stored_summary = {
        "sessionId": session_id,
        "company": company,
        "role": role,
        "resumeText": payload.resumeText,
        "jobPostingText": payload.jobPostingText,
        **summary,
        "personalizedQuestion": personalized_question,
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
    meta["currentQuestion"] = personalized_question
    await _write_json(_session_meta_key(session_id), meta)

    return SessionDocumentsResponse(
        status="processed",
        resumeSummary=summary["resumeSummary"],
        jobSummary=summary["jobSummary"],
        matchKeywords=summary["matchKeywords"],
        personalizedQuestion=personalized_question,
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
                **(await _read_json(_chunk_key(session_id, payload.chunkId)) or {}).get(
                    "status", {}
                ),
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
    audio_dir = Path(tempfile.gettempdir()) / "interviewiq_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{session_id}_{safe_chunk_id}.webm"
    audio_path.write_bytes(await audio.read())

    existing = await _read_json(_chunk_key(session_id, parsed_metadata.chunkId)) or {}
    chunk = await _merge_chunk(
        session_id=session_id,
        answer_turn_id=parsed_metadata.answerTurnId,
        chunk_id=parsed_metadata.chunkId,
        patch={
            "t0": parsed_metadata.t0,
            "t1": parsed_metadata.t1,
            "audioPath": str(audio_path),
            "audioMimeType": parsed_metadata.mimeType,
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


@router.post("/{session_id}/answers/{answer_turn_id}/finish", response_model=AnswerFinishResponse)
async def finish_answer(
    session_id: str,
    answer_turn_id: str,
    payload: AnswerFinishRequest,
):
    meta = await _ensure_session(session_id)
    chunks = await _load_answer_chunks(session_id, answer_turn_id)
    answer_text = " ".join(
        chunk.get("speech", {}).get("text", "")
        for chunk in chunks
        if isinstance(chunk.get("speech"), dict)
    ).strip()
    next_answer_turn_id = f"a_{uuid.uuid4().hex[:12]}"
    session_documents = await _load_session_rag_documents(session_id)
    next_question, rag_context = _next_question(meta, answer_text, session_documents)
    nonverbal = _summarize_nonverbal(chunks)

    analysis = {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "status": "analysis_ready",
        "endedBy": payload.endedBy,
        "endedAt": payload.endedAt,
        "endPhrase": payload.endPhrase,
        "answerText": answer_text,
        "chunkCount": len(chunks),
        "ragContext": rag_context,
        "contentFeedback": [
            "답변에는 본인의 역할, 기술 선택 이유, 결과 지표가 포함될수록 좋습니다.",
            "STT가 연결되면 이 항목은 실제 답변 텍스트 기반으로 더 구체화됩니다.",
        ],
        "nonverbalFeedback": nonverbal,
        "nextAnswerTurnId": next_answer_turn_id,
        "nextQuestion": next_question,
    }
    await _write_json(_answer_analysis_key(session_id, answer_turn_id), analysis)

    client = await _redis()
    meta["currentAnswerTurnId"] = next_answer_turn_id
    meta["currentQuestion"] = next_question
    await _write_json(_session_meta_key(session_id), meta)
    await client.rpush(_turns_key(session_id), next_answer_turn_id)
    await client.expire(_turns_key(session_id), REDIS_TTL_SECONDS)

    return AnswerFinishResponse(
        answerTurnId=answer_turn_id,
        status="analysis_ready",
        nextQuestionPending=False,
        nextAnswerTurnId=next_answer_turn_id,
        nextQuestion=next_question,
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
    )


@router.get("/{session_id}/chunks")
async def get_session_chunks(session_id: str):
    await _ensure_session(session_id)
    client = await _redis()
    keys = await client.keys(_chunk_key(session_id, "*"))
    chunks = []
    for key in keys:
        chunk = await _read_json(key)
        if chunk:
            chunks.append(chunk)
    return sorted(chunks, key=lambda item: (item.get("t0", 0), item.get("chunkId", "")))


@router.post("/{session_id}/finish", response_model=SessionFinishResponse)
async def finish_session(session_id: str):
    meta = await _ensure_session(session_id)
    report_id = f"r_{uuid.uuid4().hex[:12]}"
    meta["status"] = "finished"
    meta["reportId"] = report_id
    await _write_json(_session_meta_key(session_id), meta)
    return SessionFinishResponse(sessionId=session_id, status="finished", reportId=report_id)
