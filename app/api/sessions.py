import json
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.redis import REDIS_TTL_SECONDS, get_redis
from app.rag import RagRetriever
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
    SessionFinishResponse,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
rag_retriever = RagRetriever()


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
        "vision": None,
        "speech": None,
        "audioFeatures": None,
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


def _count_chunks(chunks: list[dict[str, Any]]) -> AnswerChunkCounts:
    def ready(name: str) -> int:
        return sum(1 for chunk in chunks if chunk.get("status", {}).get(name))

    return AnswerChunkCounts(
        total=len(chunks),
        visionReady=ready("visionReady"),
        audioReceived=ready("audioReceived"),
        speechReady=ready("speechReady"),
        audioFeatureReady=ready("audioFeatureReady"),
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


def _next_question(meta: dict[str, Any], answer_text: str) -> tuple[str, list[dict[str, Any]]]:
    results = rag_retriever.search(
        company=meta.get("company"),
        cluster=meta.get("cluster"),
        industry=meta.get("industry"),
        role=meta.get("role"),
        interview_type=meta.get("interviewType"),
        text=answer_text,
        doc_types=["followup_question", "evaluation_criteria", "star_guide"],
        limit=4,
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
        }

    avg_posture = sum(
        chunk["vision"]["posture"]["postureStability"] for chunk in vision_chunks
    ) / len(vision_chunks)
    avg_head_forward = sum(
        chunk["vision"]["head"]["headForwardRatio"] for chunk in vision_chunks
    ) / len(vision_chunks)
    avg_hand_movement = sum(
        chunk["vision"]["hands"]["handMovementIntensity"] for chunk in vision_chunks
    ) / len(vision_chunks)

    signals = [
        {"metric": "postureStability", "value": round(avg_posture, 3)},
        {"metric": "headForwardRatio", "value": round(avg_head_forward, 3)},
        {"metric": "handMovementIntensity", "value": round(avg_hand_movement, 3)},
    ]
    if avg_posture < 0.7:
        summary = "상체 자세 안정성이 낮은 구간이 있어 답변 중 자세 유지 피드백이 필요합니다."
    elif avg_head_forward < 0.65:
        summary = "얼굴 방향이 정면에서 벗어난 구간이 있어 주의 집중도 표현을 보완하면 좋습니다."
    else:
        summary = "전반적인 자세와 얼굴 방향 지표는 안정적인 편입니다."
    return {"summary": summary, "signals": signals}


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
            "vision": payload.vision.model_dump(),
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
    next_question, rag_context = _next_question(meta, answer_text)
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
