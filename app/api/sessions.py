import json
import logging
import re
import tempfile
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.question_sets import get_question
from app.core.question_sets import get_question_set_id
from app.core.question_sets import progress_for_question
from app.core.redis import REDIS_TTL_SECONDS, get_redis
from app.core.r2 import create_presigned_get_url
from app.db.database import AsyncSessionLocal
from app.db.database import get_db
from app.db.models import Asset
from app.db.models import Report as DbReport
from app.db.models import Session as DbSession
from app.db.models import User
from app.llm import QuestionGenerator
from app.llm.question_generator import GeneratedQuestion
from app.llm.transcriber import AudioTranscriber, TranscriptionResult
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
    AnswerAudioAssetRequest,
    AnswerAudioAssetResponse,
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
logger = logging.getLogger("uvicorn.error")
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
        "phase": "ice_breaking",
        "goal": "자기소개, 지원동기, 가치관을 통해 답변의 기본 톤과 방향을 확인한다.",
    },
    {
        "phase": "basic_personality",
        "goal": "기본 인성, 상황 대응, 팀워크 경험을 확인한다.",
    },
    {
        "phase": "job_competency",
        "goal": "직무 지식, 산업 이해도, 프로젝트 경험을 통해 직무 역량을 확인한다.",
    },
    {
        "phase": "deep_dive",
        "goal": "상황형 또는 압박 질문으로 답변의 구체성, 일관성, 문제 해결 깊이를 확인한다.",
    },
    {
        "phase": "closing",
        "goal": "마무리 답변과 역질문을 통해 직무 적합도와 준비도를 확인한다.",
    },
]
INTERVIEW_PHASE_GOALS = {phase["phase"]: phase["goal"] for phase in INTERVIEW_PHASES}
QUESTION_BLUEPRINTS = [
    {
        "phase": "ice_breaking",
        "topic": "motivation",
        "analysisFocus": "지원 동기와 회사/직무 관심도의 구체성을 확인한다.",
    },
    {
        "phase": "ice_breaking",
        "topic": "values",
        "analysisFocus": "일하는 방식과 가치관이 직무와 연결되는지 확인한다.",
    },
    {
        "phase": "ice_breaking",
        "topic": "self_introduction",
        "analysisFocus": "자기소개가 핵심 경험과 강점을 명확하게 전달하는지 확인한다.",
    },
    {
        "phase": "basic_personality",
        "topic": "values",
        "analysisFocus": "기본 인성과 의사결정 기준이 일관적인지 확인한다.",
    },
    {
        "phase": "basic_personality",
        "topic": "situational",
        "analysisFocus": "상황 판단과 문제 대응 과정을 구조적으로 설명하는지 확인한다.",
    },
    {
        "phase": "basic_personality",
        "topic": "teamwork",
        "analysisFocus": "협업, 갈등 조율, 커뮤니케이션 경험을 구체적으로 설명하는지 확인한다.",
    },
    {
        "phase": "job_competency",
        "topic": "technical_knowledge",
        "analysisFocus": "직무 기술 지식과 선택 근거를 정확하게 설명하는지 확인한다.",
    },
    {
        "phase": "job_competency",
        "topic": "industry_knowledge",
        "analysisFocus": "지원 산업과 회사 맥락을 이해하고 답변에 반영하는지 확인한다.",
    },
    {
        "phase": "job_competency",
        "topic": "project_experience",
        "analysisFocus": "프로젝트에서 본인의 역할, 문제 해결 과정, 결과를 수치와 근거로 설명하는지 확인한다.",
    },
    {
        "phase": "deep_dive",
        "topic": "situational",
        "analysisFocus": "꼬리질문이나 압박 상황에서도 답변의 논리와 일관성을 유지하는지 확인한다.",
    },
    {
        "phase": "deep_dive",
        "topic": "situational",
        "analysisFocus": "복잡한 상황에서 trade-off와 대안을 설명하는 깊이를 확인한다.",
    },
    {
        "phase": "closing",
        "topic": "general",
        "analysisFocus": "마무리 답변과 역질문에서 준비도, 관심도, 성장 방향을 확인한다.",
    },
]
REPORT_TYPE_BY_SESSION_TYPE = {
    "baseline": "baseline_report",
    "drill": "drill_report",
    "full": "full_report",
}


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


def _phase_for_question(
    question_index: int,
    total_questions: int,
    question_set_id: str | None = None,
) -> dict[str, Any]:
    return progress_for_question(
        question_index=question_index,
        total_questions=total_questions,
        question_set_id=question_set_id,
    )


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


async def _load_session_chunks(session_id: str) -> list[dict[str, Any]]:
    chunks = []
    for answer_turn_id in await _load_turn_ids(session_id):
        chunks.extend(await _load_answer_chunks(session_id, answer_turn_id))
    return sorted(
        chunks,
        key=lambda item: (
            str(item.get("answerTurnId", "")),
            item.get("t0", 0),
            item.get("chunkId", ""),
        ),
    )


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


def _safe_storage_id(value: str) -> str:
    return "".join(char for char in value if char.isalnum() or char in {"_", "-"})


def _audio_suffix(*, file_name: str | None = None, mime_type: str | None = None) -> str:
    original_suffix = Path(file_name or "").suffix
    if original_suffix.startswith(".") and len(original_suffix) <= 12:
        return original_suffix

    mime_extensions = {
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/wav": ".wav",
    }
    return mime_extensions.get((mime_type or "").lower(), ".webm")


def _download_url_to_path(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=60) as response, path.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)


def _transcription_to_dict(transcription: TranscriptionResult) -> dict[str, Any]:
    return {
        "text": transcription.text,
        "source": transcription.source,
        "model": transcription.model,
        "error": transcription.error,
    }


def _transcription_from_dict(value: dict[str, Any]) -> TranscriptionResult:
    return TranscriptionResult(
        text=str(value.get("text") or ""),
        source=str(value.get("source") or "unknown"),
        model=value.get("model"),
        error=value.get("error"),
    )


async def _store_answer_audio(
    *,
    session_id: str,
    answer_turn_id: str,
    audio_path: Path,
    mime_type: str | None,
    duration_ms: int | None,
    language: str | None,
    browser_transcript: str | None,
    browser_latest_text: str | None,
    started_at: int | None = None,
    ended_at: int | None = None,
    asset: Asset | None = None,
) -> dict[str, Any]:
    stored_audio = {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "audioPath": str(audio_path),
        "audioMimeType": mime_type,
        "audioMetadata": {
            "startedAt": started_at,
            "endedAt": ended_at,
            "durationMs": duration_ms,
            "language": language,
            "browserTranscript": browser_transcript,
            "browserLatestText": browser_latest_text,
        },
        "status": {
            "audioReceived": True,
            "speechReady": False,
            "audioFeatureReady": False,
        },
    }
    if asset is not None:
        stored_audio["asset"] = {
            "assetId": asset.id,
            "objectKey": asset.object_key,
            "bucket": asset.bucket,
            "assetType": asset.asset_type,
        }
    await _write_json(_answer_audio_key(session_id, answer_turn_id), stored_audio)
    return stored_audio


async def _transcribe_answer_audio_record(
    *,
    session_id: str,
    answer_turn_id: str,
    language: str | None = None,
) -> tuple[dict[str, Any], TranscriptionResult]:
    answer_audio = await _read_json(_answer_audio_key(session_id, answer_turn_id))
    if answer_audio is None:
        raise HTTPException(status_code=404, detail="Answer audio not found")

    existing_transcription = answer_audio.get("transcription")
    if isinstance(existing_transcription, dict):
        return answer_audio, _transcription_from_dict(existing_transcription)

    audio_metadata = (
        answer_audio.get("audioMetadata", {})
        if isinstance(answer_audio.get("audioMetadata"), dict)
        else {}
    )
    transcription = await audio_transcriber.transcribe_answer_audio(
        audio_path=answer_audio.get("audioPath"),
        language=language or audio_metadata.get("language"),
    )
    answer_audio["transcription"] = _transcription_to_dict(transcription)
    answer_audio["status"] = {
        **answer_audio.get("status", {}),
        "speechReady": bool(transcription.text.strip()),
    }
    await _write_json(_answer_audio_key(session_id, answer_turn_id), answer_audio)
    return answer_audio, transcription


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
    if payload.sessionType == "drill" and payload.initialQuestion:
        return GeneratedQuestion(text=payload.initialQuestion, source="drill_initial_question")

    question = get_question(payload.questionSetId, 1)
    return GeneratedQuestion(text=str(question.get("text") or ""), source="question_set")

def _fallback_question_for_progress(
    progress: dict[str, Any],
    *,
    company: str | None,
    role: str | None,
    answer_text: str,
) -> str:
    question_meta = (
        progress.get("questionMeta") if isinstance(progress.get("questionMeta"), dict) else {}
    )
    topic = str(question_meta.get("topic") or "general")
    phase = str(progress.get("phase") or "ice_breaking")
    company_label = (company or "지원 회사").replace("_", " ")
    role_label = (role or "지원 직무").replace("_", " ")

    topic_questions = {
        "motivation": f"{company_label}와 {role_label}에 지원한 이유를 본인의 경험과 연결해서 설명해 주세요.",
        "values": "일할 때 가장 중요하게 생각하는 기준은 무엇이고, 그 기준이 드러난 경험을 설명해 주세요.",
        "self_introduction": f"{role_label} 직무와 연결되는 강점 중심으로 자기소개를 해 주세요.",
        "situational": "예상하지 못한 문제를 만났을 때 상황을 판단하고 해결했던 과정을 설명해 주세요.",
        "teamwork": "팀 안에서 의견 차이나 갈등을 조율했던 경험과 본인의 역할을 설명해 주세요.",
        "technical_knowledge": f"{role_label} 업무에서 중요하다고 생각하는 기술 선택과 그 근거를 설명해 주세요.",
        "industry_knowledge": f"{company_label}가 속한 산업에서 중요하다고 보는 변화와 본인의 준비도를 설명해 주세요.",
        "project_experience": "가장 자신 있는 프로젝트를 문제 상황, 본인 역할, 해결 과정, 결과 중심으로 설명해 주세요.",
        "general": "앞선 답변에서 가장 강조하고 싶은 역량을 구체적인 사례와 함께 설명해 주세요.",
    }
    if progress.get("isFinalQuestion") or phase == "closing":
        return f"마지막으로 {company_label} {role_label} 직무에 기여할 수 있는 본인의 강점을 한 가지 경험과 함께 정리해 주세요."
    if answer_text.strip() and topic == "situational":
        return "방금 답변한 상황에서 선택지를 비교했던 기준과, 그 결정의 결과를 더 구체적으로 설명해 주세요."
    return topic_questions.get(topic, topic_questions["general"])


def _next_question(
    meta: dict[str, Any],
    answer_text: str,
    session_documents: list[RagDocument] | None = None,
    nonverbal_feedback: dict[str, Any] | None = None,
    interview_progress: dict[str, Any] | None = None,
) -> tuple[GeneratedQuestion, list[dict[str, Any]]]:
    progress = interview_progress or {}
    question_meta_for_progress = (
        progress.get("questionMeta") if isinstance(progress.get("questionMeta"), dict) else {}
    )
    json_question_text = str(question_meta_for_progress.get("text") or "").strip()
    if not json_question_text:
        try:
            json_question = get_question(
                meta.get("questionSetId"),
                int(progress.get("questionIndex") or 1),
            )
            json_question_text = str(json_question.get("text") or "").strip()
        except (TypeError, ValueError):
            json_question_text = ""

    should_use_llm = (
        str(progress.get("phase") or question_meta_for_progress.get("flow") or "")
        == "deep_dive"
        or bool(progress.get("isFollowup"))
    )
    if json_question_text and not should_use_llm:
        return GeneratedQuestion(text=json_question_text, source="question_set"), []

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
    fallback = json_question_text or _fallback_question_for_progress(
        progress,
        company=meta.get("company"),
        role=meta.get("role"),
        answer_text=answer_text,
    )
    if followup and not progress.get("questionMeta"):
        fallback = followup
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


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def _ratio(count: int, total: int) -> float | None:
    if total <= 0:
        return None
    return round(count / total, 4)


def _chunk_duration_ms(chunk: dict[str, Any]) -> int:
    t0 = chunk.get("t0")
    t1 = chunk.get("t1")
    if isinstance(t0, int) and isinstance(t1, int) and t1 > t0:
        return t1 - t0
    return 0


def _build_report_metrics(
    *,
    meta: dict[str, Any],
    chunks: list[dict[str, Any]],
    analyses: list[dict[str, Any]],
) -> dict[str, Any]:
    vision_chunks = [chunk for chunk in chunks if isinstance(chunk.get("vision"), dict)]
    audio_signal_chunks = [
        chunk for chunk in chunks if isinstance(chunk.get("realtimeAudioSignals"), dict)
    ]
    answered_turns = [
        analysis for analysis in analyses if analysis.get("status") == "analysis_ready"
    ]

    behavior_risk_scores = []
    nonverbal_risk_scores = []
    gaze_penalties = []
    leg_shaking_scores = []
    gaze_away_count = 0
    bad_posture_count = 0
    fidgeting_count = 0
    leg_shaking_count = 0
    gaze_away_ms = 0
    bad_posture_ms = 0
    event_counts: dict[str, int] = {}

    for chunk in vision_chunks:
        duration_ms = _chunk_duration_ms(chunk)
        vision = chunk["vision"]
        behavior = _number(vision.get("behaviorRiskScore"))
        nonverbal = _number(vision.get("nonverbalRiskScore"))
        if behavior is not None:
            behavior_risk_scores.append(behavior)
        if nonverbal is not None:
            nonverbal_risk_scores.append(nonverbal)

        gaze = vision.get("gaze") if isinstance(vision.get("gaze"), dict) else {}
        gaze_penalty = _number(gaze.get("gazePenalty"))
        if gaze_penalty is not None:
            gaze_penalties.append(gaze_penalty)
        is_looking_away = bool(gaze.get("isLookingAway"))
        if is_looking_away:
            gaze_away_count += 1
        gaze_away_duration = _number(gaze.get("gazeAwayDurationMs"))
        if gaze_away_duration is not None:
            gaze_away_ms += int(gaze_away_duration)
        elif is_looking_away:
            gaze_away_ms += duration_ms

        posture = vision.get("posture") if isinstance(vision.get("posture"), dict) else {}
        is_bad_posture = bool(posture.get("isBadPosture") or posture.get("isPostureCollapsed"))
        if is_bad_posture:
            bad_posture_count += 1
            bad_posture_ms += duration_ms

        gesture = vision.get("gesture") if isinstance(vision.get("gesture"), dict) else {}
        leg_shaking_score = _number(gesture.get("legShakingScore"))
        if leg_shaking_score is not None:
            leg_shaking_scores.append(leg_shaking_score)

        states = vision.get("states") if isinstance(vision.get("states"), dict) else {}
        if states.get("isFidgeting"):
            fidgeting_count += 1
        if states.get("isLegShaking"):
            leg_shaking_count += 1

        for event in vision.get("events", []) if isinstance(vision.get("events"), list) else []:
            event_type = event.get("type") if isinstance(event, dict) else None
            if event_type:
                event_counts[str(event_type)] = event_counts.get(str(event_type), 0) + 1

    speaking_ratios = []
    rms_volumes = []
    peak_volumes = []
    silence_ms_values = []
    too_low_count = 0
    too_high_count = 0
    slow_pace_count = 0
    fast_pace_count = 0

    for chunk in audio_signal_chunks:
        signals = chunk["realtimeAudioSignals"]
        speaking_ratio = _number(signals.get("isSpeakingRatio"))
        rms_volume = _number(signals.get("rmsVolume"))
        peak_volume = _number(signals.get("peakVolume"))
        silence_ms = _number(signals.get("silenceDurationMs"))
        if speaking_ratio is not None:
            speaking_ratios.append(speaking_ratio)
        if rms_volume is not None:
            rms_volumes.append(rms_volume)
        if peak_volume is not None:
            peak_volumes.append(peak_volume)
        if silence_ms is not None:
            silence_ms_values.append(silence_ms)
        if signals.get("volumeWarning") == "too_low":
            too_low_count += 1
        if signals.get("volumeWarning") == "too_high":
            too_high_count += 1
        if signals.get("paceHint") == "slow":
            slow_pace_count += 1
        if signals.get("paceHint") == "fast":
            fast_pace_count += 1

    long_silence_threshold_ms = 3000
    answer_texts = [str(analysis.get("answerText") or "") for analysis in answered_turns]
    answer_lengths = [len(text.strip()) for text in answer_texts if text.strip()]
    transcript_sources: dict[str, int] = {}
    phase_metrics: dict[str, dict[str, Any]] = {}
    answer_phase_by_turn: dict[str, str] = {}

    def phase_bucket(phase: str) -> dict[str, Any]:
        return phase_metrics.setdefault(
            phase,
            {
                "answerCount": 0,
                "totalAnswerLengthChars": 0,
                "visionChunkCount": 0,
                "audioSignalChunkCount": 0,
                "gazeAwayCount": 0,
                "totalGazeAwayMs": 0,
                "badPostureCount": 0,
                "totalBadPostureMs": 0,
                "longSilenceCount": 0,
                "totalSilenceMs": 0,
                "_behaviorRiskScores": [],
                "_nonverbalRiskScores": [],
                "_gazePenalties": [],
                "_speakingRatios": [],
                "_rmsVolumes": [],
            },
        )

    for analysis in answered_turns:
        source = str(analysis.get("answerTextSource") or "none")
        transcript_sources[source] = transcript_sources.get(source, 0) + 1
        progress = analysis.get("interviewProgress")
        phase = progress.get("phase") if isinstance(progress, dict) else None
        if phase:
            normalized_phase = str(phase)
            answer_turn_id = analysis.get("answerTurnId")
            if answer_turn_id:
                answer_phase_by_turn[str(answer_turn_id)] = normalized_phase
            bucket = phase_bucket(normalized_phase)
            answer_text = str(analysis.get("answerText") or "").strip()
            bucket["answerCount"] += 1
            bucket["totalAnswerLengthChars"] += len(answer_text)

    for chunk in chunks:
        answer_turn_id = str(chunk.get("answerTurnId") or "")
        phase = answer_phase_by_turn.get(answer_turn_id)
        if not phase:
            continue
        bucket = phase_bucket(phase)
        duration_ms = _chunk_duration_ms(chunk)

        vision = chunk.get("vision") if isinstance(chunk.get("vision"), dict) else None
        if vision:
            bucket["visionChunkCount"] += 1
            behavior = _number(vision.get("behaviorRiskScore"))
            nonverbal = _number(vision.get("nonverbalRiskScore"))
            if behavior is not None:
                bucket["_behaviorRiskScores"].append(behavior)
            if nonverbal is not None:
                bucket["_nonverbalRiskScores"].append(nonverbal)

            gaze = vision.get("gaze") if isinstance(vision.get("gaze"), dict) else {}
            gaze_penalty = _number(gaze.get("gazePenalty"))
            if gaze_penalty is not None:
                bucket["_gazePenalties"].append(gaze_penalty)
            is_looking_away = bool(gaze.get("isLookingAway"))
            if is_looking_away:
                bucket["gazeAwayCount"] += 1
            gaze_away_duration = _number(gaze.get("gazeAwayDurationMs"))
            if gaze_away_duration is not None:
                bucket["totalGazeAwayMs"] += int(gaze_away_duration)
            elif is_looking_away:
                bucket["totalGazeAwayMs"] += duration_ms

            posture = vision.get("posture") if isinstance(vision.get("posture"), dict) else {}
            if posture.get("isBadPosture") or posture.get("isPostureCollapsed"):
                bucket["badPostureCount"] += 1
                bucket["totalBadPostureMs"] += duration_ms

        audio_signals = (
            chunk.get("realtimeAudioSignals")
            if isinstance(chunk.get("realtimeAudioSignals"), dict)
            else None
        )
        if audio_signals:
            bucket["audioSignalChunkCount"] += 1
            speaking_ratio = _number(audio_signals.get("isSpeakingRatio"))
            rms_volume = _number(audio_signals.get("rmsVolume"))
            silence_ms = _number(audio_signals.get("silenceDurationMs"))
            if speaking_ratio is not None:
                bucket["_speakingRatios"].append(speaking_ratio)
            if rms_volume is not None:
                bucket["_rmsVolumes"].append(rms_volume)
            if silence_ms is not None:
                bucket["totalSilenceMs"] += int(silence_ms)
                if silence_ms >= long_silence_threshold_ms:
                    bucket["longSilenceCount"] += 1

    for phase_bucket in phase_metrics.values():
        answer_count = int(phase_bucket["answerCount"])
        total_chars = int(phase_bucket["totalAnswerLengthChars"])
        vision_count = int(phase_bucket["visionChunkCount"])
        audio_count = int(phase_bucket["audioSignalChunkCount"])
        phase_bucket["averageAnswerLengthChars"] = (
            round(total_chars / answer_count, 2) if answer_count else 0
        )
        phase_bucket["averageBehaviorRiskScore"] = _average(
            [float(value) for value in phase_bucket.pop("_behaviorRiskScores", [])]
        )
        phase_bucket["averageNonverbalRiskScore"] = _average(
            [float(value) for value in phase_bucket.pop("_nonverbalRiskScores", [])]
        )
        phase_bucket["averageGazePenalty"] = _average(
            [float(value) for value in phase_bucket.pop("_gazePenalties", [])]
        )
        phase_bucket["gazeAwayRatio"] = _ratio(int(phase_bucket["gazeAwayCount"]), vision_count)
        phase_bucket["badPostureRatio"] = _ratio(
            int(phase_bucket["badPostureCount"]),
            vision_count,
        )
        phase_bucket["averageSpeakingRatio"] = _average(
            [float(value) for value in phase_bucket.pop("_speakingRatios", [])]
        )
        phase_bucket["averageRmsVolume"] = _average(
            [float(value) for value in phase_bucket.pop("_rmsVolumes", [])]
        )
        phase_bucket["longSilenceThresholdMs"] = long_silence_threshold_ms

    total_silence_ms = int(sum(silence_ms_values))
    drill_recommendation = _calculate_phase_weakness(phase_metrics)

    return {
        "schemaVersion": "metrics_v1",
        "session": {
            "sessionType": meta.get("sessionType"),
            "totalQuestions": meta.get("totalQuestions"),
            "answeredQuestions": len(answered_turns),
            "chunkCount": len(chunks),
            "visionChunkCount": len(vision_chunks),
            "audioSignalChunkCount": len(audio_signal_chunks),
        },
        "nonverbal": {
            "averageBehaviorRiskScore": _average(behavior_risk_scores),
            "averageNonverbalRiskScore": _average(nonverbal_risk_scores),
            "averageGazePenalty": _average(gaze_penalties),
            "averageLegShakingScore": _average(leg_shaking_scores),
            "gazeAwayRatio": _ratio(gaze_away_count, len(vision_chunks)),
            "totalGazeAwayMs": gaze_away_ms,
            "badPostureRatio": _ratio(bad_posture_count, len(vision_chunks)),
            "totalBadPostureMs": bad_posture_ms,
            "fidgetingRatio": _ratio(fidgeting_count, len(vision_chunks)),
            "legShakingRatio": _ratio(leg_shaking_count, len(vision_chunks)),
            "eventCounts": event_counts,
        },
        "audio": {
            "averageSpeakingRatio": _average(speaking_ratios),
            "averageRmsVolume": _average(rms_volumes),
            "averagePeakVolume": _average(peak_volumes),
            "totalSilenceMs": total_silence_ms,
            "longSilenceCount": sum(
                1 for silence_ms in silence_ms_values if silence_ms >= long_silence_threshold_ms
            ),
            "longSilenceThresholdMs": long_silence_threshold_ms,
            "tooLowVolumeRatio": _ratio(too_low_count, len(audio_signal_chunks)),
            "tooHighVolumeRatio": _ratio(too_high_count, len(audio_signal_chunks)),
            "slowPaceRatio": _ratio(slow_pace_count, len(audio_signal_chunks)),
            "fastPaceRatio": _ratio(fast_pace_count, len(audio_signal_chunks)),
        },
        "content": {
            "answerCount": len(answered_turns),
            "transcriptSources": transcript_sources,
            "averageAnswerLengthChars": _average([float(value) for value in answer_lengths]),
            "totalAnswerLengthChars": sum(answer_lengths),
        },
        "phase": phase_metrics,
        "drillRecommendation": drill_recommendation,
    }


def _build_answer_chunk_metrics(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    vision_chunks = [chunk for chunk in chunks if isinstance(chunk.get("vision"), dict)]
    audio_signal_chunks = [
        chunk for chunk in chunks if isinstance(chunk.get("realtimeAudioSignals"), dict)
    ]
    behavior_scores = []
    gaze_away_count = 0
    total_gaze_away_ms = 0
    speaking_ratios = []
    silence_values = []

    for chunk in vision_chunks:
        vision = chunk["vision"]
        behavior = _number(vision.get("behaviorRiskScore"))
        if behavior is not None:
            behavior_scores.append(behavior)
        gaze = vision.get("gaze") if isinstance(vision.get("gaze"), dict) else {}
        is_looking_away = bool(gaze.get("isLookingAway"))
        if is_looking_away:
            gaze_away_count += 1
        gaze_away_duration = _number(gaze.get("gazeAwayDurationMs"))
        if gaze_away_duration is not None:
            total_gaze_away_ms += int(gaze_away_duration)
        elif is_looking_away:
            total_gaze_away_ms += _chunk_duration_ms(chunk)

    for chunk in audio_signal_chunks:
        signals = chunk["realtimeAudioSignals"]
        speaking_ratio = _number(signals.get("isSpeakingRatio"))
        silence_ms = _number(signals.get("silenceDurationMs"))
        if speaking_ratio is not None:
            speaking_ratios.append(speaking_ratio)
        if silence_ms is not None:
            silence_values.append(silence_ms)

    return {
        "chunkCount": len(chunks),
        "visionChunkCount": len(vision_chunks),
        "audioSignalChunkCount": len(audio_signal_chunks),
        "averageBehaviorRiskScore": _average(behavior_scores),
        "gazeAwayRatio": _ratio(gaze_away_count, len(vision_chunks)),
        "totalGazeAwayMs": total_gaze_away_ms,
        "averageSpeakingRatio": _average(speaking_ratios),
        "totalSilenceMs": int(sum(silence_values)),
    }


def _bounded_score(value: float | None, *, scale: float = 100.0) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(float(value) / scale * 100.0, 100.0))


def _calculate_phase_weakness(phase_metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    phase_scores: dict[str, dict[str, Any]] = {}
    for phase, metrics in phase_metrics.items():
        nonverbal_score = _bounded_score(_number(metrics.get("averageNonverbalRiskScore")))
        gaze_score = _bounded_score(_number(metrics.get("gazeAwayRatio")), scale=1.0)
        posture_score = _bounded_score(_number(metrics.get("badPostureRatio")), scale=1.0)
        silence_count = _number(metrics.get("longSilenceCount")) or 0.0
        silence_score = min(silence_count * 20.0, 100.0)

        speaking_ratio = _number(metrics.get("averageSpeakingRatio"))
        speaking_score = 0.0
        if speaking_ratio is not None and speaking_ratio < 0.45:
            speaking_score = min((0.45 - speaking_ratio) / 0.45 * 100.0, 100.0)

        answer_length = _number(metrics.get("averageAnswerLengthChars"))
        content_score = 0.0
        if answer_length is not None and answer_length < 120:
            content_score = min((120 - answer_length) / 120 * 100.0, 100.0)

        weakness_score = round(
            nonverbal_score * 0.25
            + gaze_score * 0.2
            + posture_score * 0.15
            + silence_score * 0.2
            + speaking_score * 0.1
            + content_score * 0.1,
            2,
        )

        reasons = []
        if nonverbal_score >= 50:
            reasons.append("비언어 위험도 평균이 높습니다.")
        if gaze_score >= 35:
            reasons.append("시선 이탈 비율이 높습니다.")
        if posture_score >= 35:
            reasons.append("자세 불안정 비율이 높습니다.")
        if silence_score >= 40:
            reasons.append("긴 침묵 구간이 반복되었습니다.")
        if speaking_score >= 35:
            reasons.append("말하기 비율이 낮게 나타났습니다.")
        if content_score >= 35:
            reasons.append("답변 길이가 짧아 근거 설명이 부족할 수 있습니다.")
        if not reasons:
            reasons.append("상대적으로 보완 우선순위가 높은 phase입니다.")

        metrics["weaknessScore"] = weakness_score
        metrics["weaknessReasons"] = reasons
        phase_scores[phase] = {
            "weaknessScore": weakness_score,
            "reasons": reasons,
        }

    if not phase_scores:
        return {
            "targetPhase": None,
            "weaknessScore": None,
            "phaseScores": {},
            "reasons": [],
        }

    target_phase, target = max(
        phase_scores.items(),
        key=lambda item: (item[1]["weaknessScore"], item[0]),
    )
    return {
        "targetPhase": target_phase,
        "weaknessScore": target["weaknessScore"],
        "phaseScores": phase_scores,
        "reasons": target["reasons"],
    }


def _build_session_report(
    *,
    session_id: str,
    report_id: str,
    meta: dict[str, Any],
    analyses: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
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
    chunks_by_turn: dict[str, list[dict[str, Any]]] = {}
    for chunk in chunks:
        answer_turn_id = str(chunk.get("answerTurnId") or "")
        if answer_turn_id:
            chunks_by_turn.setdefault(answer_turn_id, []).append(chunk)

    answer_text_source_counts: dict[str, int] = {}
    sample_questions = []
    transcription_count = 0
    transcription_text_count = 0
    for analysis in answered_turns:
        source = str(analysis.get("answerTextSource") or "none")
        answer_text_source_counts[source] = answer_text_source_counts.get(source, 0) + 1

        transcription = analysis.get("transcription")
        transcription_text = ""
        if isinstance(transcription, dict):
            transcription_count += 1
            transcription_text = str(transcription.get("text") or "").strip()
            if transcription_text:
                transcription_text_count += 1

        progress = analysis.get("interviewProgress", {})
        question_meta = (
            progress.get("questionMeta")
            if isinstance(progress.get("questionMeta"), dict)
            else {}
        )
        answer_turn_id = str(analysis.get("answerTurnId") or "")
        turn_chunks = chunks_by_turn.get(answer_turn_id, [])
        if len(sample_questions) < 5:
            sample_questions.append(
                {
                    "answerTurnId": answer_turn_id,
                    "questionIndex": progress.get("questionIndex"),
                    "questionId": question_meta.get("questionId"),
                    "topic": question_meta.get("topic"),
                    "answerTextSource": analysis.get("answerTextSource"),
                    "answerTextLength": len(str(analysis.get("answerText") or "").strip()),
                    "hasTranscription": isinstance(transcription, dict),
                    "transcriptionTextLength": len(transcription_text),
                    "chunkCount": len(turn_chunks),
                    "visionChunkCount": sum(
                        1 for chunk in turn_chunks if isinstance(chunk.get("vision"), dict)
                    ),
                    "audioSignalChunkCount": sum(
                        1
                        for chunk in turn_chunks
                        if isinstance(chunk.get("realtimeAudioSignals"), dict)
                    ),
                }
            )

    vision_chunk_count = sum(1 for chunk in chunks if isinstance(chunk.get("vision"), dict))
    audio_signal_chunk_count = sum(
        1 for chunk in chunks if isinstance(chunk.get("realtimeAudioSignals"), dict)
    )
    debug_materials = {
        "analysesCount": len(analyses),
        "answeredTurns": len(answered_turns),
        "nonEmptyAnswerTexts": len(answer_texts),
        "answerTextSources": answer_text_source_counts,
        "transcriptions": transcription_count,
        "nonEmptyTranscriptions": transcription_text_count,
        "chunkCount": len(chunks),
        "visionChunkCount": vision_chunk_count,
        "audioSignalChunkCount": audio_signal_chunk_count,
        "sampleQuestions": sample_questions,
        "fallbackReasons": [
            reason
            for reason, active in (
                ("no_non_empty_answer_text", not answer_texts),
                ("no_non_empty_transcription", transcription_text_count == 0),
                ("no_vision_chunks", vision_chunk_count == 0),
                ("no_audio_signal_chunks", audio_signal_chunk_count == 0),
            )
            if active
        ],
    }
    logger.info(
        "report.materials session_id=%s report_id=%s materials=%s",
        session_id,
        report_id,
        json.dumps(debug_materials, ensure_ascii=False),
    )

    question_reports = []
    for analysis in answered_turns:
        progress = analysis.get("interviewProgress", {})
        question_meta = (
            progress.get("questionMeta")
            if isinstance(progress.get("questionMeta"), dict)
            else {}
        )
        answer_turn_id = str(analysis.get("answerTurnId") or "")
        question_reports.append(
            {
                "answerTurnId": answer_turn_id,
                "questionId": question_meta.get("questionId"),
                "questionIndex": progress.get("questionIndex"),
                "phase": progress.get("phase"),
                "phaseGoal": progress.get("phaseGoal"),
                "topic": question_meta.get("topic"),
                "analysisFocus": question_meta.get("analysisFocus"),
                "answerText": analysis.get("answerText", ""),
                "answerTextSource": analysis.get("answerTextSource"),
                "transcription": analysis.get("transcription"),
                "contentFeedback": analysis.get("contentFeedback", []),
                "nonverbalFeedback": analysis.get("nonverbalFeedback", {}),
                "metrics": _build_answer_chunk_metrics(chunks_by_turn.get(answer_turn_id, [])),
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
    metrics = _build_report_metrics(meta=meta, chunks=chunks, analyses=analyses)
    drill_recommendation = metrics.get("drillRecommendation", {})
    target_phase = (
        drill_recommendation.get("targetPhase")
        if isinstance(drill_recommendation, dict)
        else None
    )

    return {
        "sessionId": session_id,
        "reportId": report_id,
        "status": "ready",
        "company": meta.get("company"),
        "role": meta.get("role"),
        "interviewType": meta.get("interviewType"),
        "totalQuestions": meta.get("totalQuestions"),
        "answeredQuestions": len(answered_turns),
        "metrics": metrics,
        "debugMaterials": debug_materials,
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
            "targetPhase": target_phase,
            "weaknessScore": drill_recommendation.get("weaknessScore")
            if isinstance(drill_recommendation, dict)
            else None,
            "reasons": drill_recommendation.get("reasons", [])
            if isinstance(drill_recommendation, dict)
            else [],
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
    chunks = await _load_session_chunks(session_id)
    report = _build_session_report(
        session_id=session_id,
        report_id=resolved_report_id,
        meta=meta,
        analyses=analyses,
        chunks=chunks,
    )
    await _write_json(_session_report_key(session_id), report)
    return report


def _report_metrics_from_redis_report(report: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
    metrics = report.get("metrics")
    if isinstance(metrics, dict):
        return metrics
    questions = report.get("questions") if isinstance(report.get("questions"), list) else []
    return {
        "schemaVersion": "metrics_v1",
        "session": {
            "sessionType": meta.get("sessionType"),
            "totalQuestions": report.get("totalQuestions") or meta.get("totalQuestions"),
            "answeredQuestions": report.get("answeredQuestions") or len(questions),
            "questionCount": len(questions),
        },
    }


def _metric_value(metrics: dict[str, Any], path: str) -> float | None:
    current: Any = metrics
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return _number(current)


def _metric_delta(
    *,
    current_metrics: dict[str, Any],
    reference_metrics: dict[str, Any] | None,
    path: str,
) -> dict[str, Any] | None:
    if not reference_metrics:
        return None
    current_value = _metric_value(current_metrics, path)
    reference_value = _metric_value(reference_metrics, path)
    if current_value is None or reference_value is None:
        return None
    return {
        "current": round(current_value, 4),
        "reference": round(reference_value, 4),
        "delta": round(current_value - reference_value, 4),
        "deltaPercent": (
            round((current_value - reference_value) / reference_value * 100, 2)
            if reference_value != 0
            else None
        ),
    }


def _build_metrics_comparison(
    *,
    current_metrics: dict[str, Any],
    baseline_report: DbReport | None,
    previous_report: DbReport | None,
) -> dict[str, Any]:
    metric_paths = [
        "nonverbal.averageNonverbalRiskScore",
        "nonverbal.gazeAwayRatio",
        "nonverbal.badPostureRatio",
        "nonverbal.fidgetingRatio",
        "audio.averageSpeakingRatio",
        "audio.totalSilenceMs",
        "audio.longSilenceCount",
        "content.averageAnswerLengthChars",
    ]

    def compare_to(reference: DbReport | None) -> dict[str, Any]:
        if reference is None or not isinstance(reference.metrics, dict):
            return {"reportId": None, "metrics": {}}
        comparisons = {}
        for path in metric_paths:
            delta = _metric_delta(
                current_metrics=current_metrics,
                reference_metrics=reference.metrics,
                path=path,
            )
            if delta is not None:
                comparisons[path] = delta
        return {
            "reportId": reference.id,
            "reportType": reference.report_type,
            "sessionId": reference.session_id,
            "metrics": comparisons,
        }

    baseline_comparison = compare_to(baseline_report)
    previous_comparison = compare_to(previous_report)
    summary = []
    gaze_delta = baseline_comparison["metrics"].get("nonverbal.gazeAwayRatio", {}).get("delta")
    silence_delta = baseline_comparison["metrics"].get("audio.longSilenceCount", {}).get("delta")
    posture_delta = baseline_comparison["metrics"].get("nonverbal.badPostureRatio", {}).get("delta")
    if gaze_delta is not None:
        summary.append(
            {
                "metric": "gazeAwayRatio",
                "direction": "decreased" if gaze_delta < 0 else "increased" if gaze_delta > 0 else "unchanged",
                "delta": gaze_delta,
            }
        )
    if silence_delta is not None:
        summary.append(
            {
                "metric": "longSilenceCount",
                "direction": "decreased" if silence_delta < 0 else "increased" if silence_delta > 0 else "unchanged",
                "delta": silence_delta,
            }
        )
    if posture_delta is not None:
        summary.append(
            {
                "metric": "badPostureRatio",
                "direction": "decreased" if posture_delta < 0 else "increased" if posture_delta > 0 else "unchanged",
                "delta": posture_delta,
            }
        )

    return {
        "schemaVersion": "comparison_v1",
        "baseline": baseline_comparison,
        "previous": previous_comparison,
        "summary": summary,
    }


async def _load_comparison_references(
    *,
    db: Any,
    course_id: str,
    user_id: str,
    current_report_type: str,
) -> tuple[DbReport | None, DbReport | None]:
    baseline_result = await db.execute(
        select(DbReport)
        .where(
            DbReport.course_id == course_id,
            DbReport.user_id == user_id,
            DbReport.report_type == "baseline_report",
            DbReport.status == "ready",
        )
        .order_by(DbReport.created_at.asc())
    )
    baseline_report = baseline_result.scalars().first()

    previous_result = await db.execute(
        select(DbReport)
        .where(
            DbReport.course_id == course_id,
            DbReport.user_id == user_id,
            DbReport.status == "ready",
            DbReport.report_type != "final_report",
        )
        .order_by(DbReport.created_at.desc())
    )
    previous_report = previous_result.scalars().first()

    if current_report_type == "baseline_report":
        baseline_report = None
        previous_report = None

    return baseline_report, previous_report


async def _sync_db_session_from_runtime(
    session_id: str,
    meta: dict[str, Any],
    *,
    status: str | None = None,
    report: dict[str, Any] | None = None,
) -> None:
    if AsyncSessionLocal is None or not meta.get("dbSessionId"):
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DbSession).where(
                DbSession.id == meta["dbSessionId"],
                DbSession.user_id == meta.get("userId"),
            )
        )
        db_session = result.scalar_one_or_none()
        if db_session is None:
            return

        db_session.question_index = int(meta.get("questionIndex") or db_session.question_index)
        db_session.total_questions = int(meta.get("totalQuestions") or db_session.total_questions)
        if status:
            db_session.status = status
        if status == "finished":
            db_session.ended_at = db_session.ended_at or datetime.utcnow()

        if report is not None:
            report_id = report.get("reportId") or meta.get("reportId") or f"r_{uuid.uuid4().hex[:12]}"
            report_type = REPORT_TYPE_BY_SESSION_TYPE.get(
                str(meta.get("sessionType") or ""),
                "baseline_report",
            )
            metrics = _report_metrics_from_redis_report(report, meta)
            baseline_report, previous_report = await _load_comparison_references(
                db=db,
                course_id=meta["courseId"],
                user_id=meta["userId"],
                current_report_type=report_type,
            )
            comparison = _build_metrics_comparison(
                current_metrics=metrics,
                baseline_report=baseline_report,
                previous_report=previous_report,
            )
            existing_report = await db.execute(
                select(DbReport).where(
                    DbReport.id == report_id,
                    DbReport.user_id == meta.get("userId"),
                )
            )
            if existing_report.scalar_one_or_none() is None:
                db.add(
                    DbReport(
                        id=report_id,
                        course_id=meta["courseId"],
                        session_id=session_id,
                        user_id=meta["userId"],
                        report_type=report_type,
                        summary=" ".join(report.get("overallSummary") or []) or None,
                        metrics=metrics,
                        comparison=comparison,
                        recommendations=report.get("nextPractice") or {},
                        status="ready",
                    )
                )

        await db.commit()


async def start_runtime_session(
    payload: SessionCreate,
    *,
    session_id: str | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> SessionCreateResponse:
    client = await _redis()
    resolved_session_id = session_id or f"s_{uuid.uuid4().hex[:12]}"
    answer_turn_id = f"a_{uuid.uuid4().hex[:12]}"
    question_set_id = get_question_set_id(payload.questionSetId)
    progress = _phase_for_question(1, payload.totalQuestions, question_set_id)
    first_question = _first_question(payload)
    logger.info(
        "session.start session_id=%s question_index=%s source=%s question_id=%s topic=%s",
        resolved_session_id,
        progress["questionIndex"],
        first_question.source,
        progress["questionMeta"]["questionId"],
        progress["questionMeta"]["topic"],
    )

    meta = {
        "sessionId": resolved_session_id,
        "company": payload.company,
        "role": payload.role,
        "interviewType": payload.interviewType,
        "sessionType": payload.sessionType,
        "questionSetId": question_set_id,
        "courseId": payload.courseId,
        "questionSetVersion": payload.questionSetVersion,
        "baselineId": payload.baselineId,
        "sourceSessionId": payload.sourceSessionId,
        "drillId": payload.drillId,
        "drillTarget": payload.drillTarget,
        "maxAnswerSec": payload.maxAnswerSec,
        "chunkMs": payload.chunkMs,
        "cluster": payload.cluster,
        "industry": payload.industry,
        "status": "active",
        "currentAnswerTurnId": answer_turn_id,
        "currentQuestion": first_question.text,
        "currentQuestionSource": first_question.source,
        "currentQuestionMeta": progress["questionMeta"],
        **progress,
    }
    if extra_meta:
        meta.update(extra_meta)

    await _write_json(_session_meta_key(resolved_session_id), meta)
    await client.rpush(_turns_key(resolved_session_id), answer_turn_id)
    await client.expire(_turns_key(resolved_session_id), REDIS_TTL_SECONDS)
    return SessionCreateResponse(
        sessionId=resolved_session_id,
        sessionType=payload.sessionType,
        questionSetId=question_set_id,
        courseId=payload.courseId,
        questionSetVersion=payload.questionSetVersion,
        baselineId=payload.baselineId,
        sourceSessionId=payload.sourceSessionId,
        drillId=payload.drillId,
        drillTarget=payload.drillTarget,
        maxAnswerSec=payload.maxAnswerSec,
        answerTurnId=answer_turn_id,
        firstQuestion=first_question.text,
        firstQuestionSource=first_question.source,
        questionIndex=progress["questionIndex"],
        totalQuestions=progress["totalQuestions"],
        phase=progress["phase"],
        phaseGoal=progress["phaseGoal"],
        currentQuestionMeta=progress["questionMeta"],
    )


@router.post("", response_model=SessionCreateResponse)
async def create_session(payload: SessionCreate):
    return await start_runtime_session(payload)


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
    logger.info(
        "session.vision_chunk session_id=%s answer_turn_id=%s chunk_id=%s t0=%s t1=%s risk=%s",
        session_id,
        payload.answerTurnId,
        payload.chunkId,
        payload.t0,
        payload.t1,
        payload.vision.behaviorRiskScore,
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

    safe_answer_turn_id = _safe_storage_id(answer_turn_id)
    suffix = _audio_suffix(file_name=audio.filename, mime_type=parsed_metadata.mimeType)

    audio_dir = Path(tempfile.gettempdir()) / "interviewiq_audio" / "answers"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{session_id}_{safe_answer_turn_id}{suffix}"
    audio_path.write_bytes(await audio.read())

    await _store_answer_audio(
        session_id=session_id,
        answer_turn_id=answer_turn_id,
        audio_path=audio_path,
        mime_type=parsed_metadata.mimeType,
        duration_ms=parsed_metadata.durationMs,
        language=parsed_metadata.language,
        browser_transcript=parsed_metadata.browserTranscript,
        browser_latest_text=parsed_metadata.browserLatestText,
        started_at=parsed_metadata.startedAt,
        ended_at=parsed_metadata.endedAt,
    )

    return AnswerAudioResponse(
        sessionId=session_id,
        answerTurnId=answer_turn_id,
        status="received",
        audioPath=str(audio_path),
        mimeType=parsed_metadata.mimeType,
        durationMs=parsed_metadata.durationMs,
    )


@router.post(
    "/{session_id}/answers/{answer_turn_id}/audio/analyze-asset",
    response_model=AnswerAudioAssetResponse,
)
async def analyze_answer_audio_asset(
    session_id: str,
    answer_turn_id: str,
    payload: AnswerAudioAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_session(session_id)
    session_result = await db.execute(
        select(DbSession).where(
            DbSession.id == session_id,
            DbSession.user_id == current_user.id,
        )
    )
    db_session = session_result.scalar_one_or_none()
    if db_session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    asset_result = await db.execute(
        select(Asset).where(
            Asset.id == payload.assetId,
            Asset.session_id == session_id,
            Asset.user_id == current_user.id,
        )
    )
    asset = asset_result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.asset_type != "answer_audio":
        raise HTTPException(status_code=400, detail="Asset is not answer_audio")
    if asset.answer_turn_id != answer_turn_id:
        raise HTTPException(status_code=400, detail="Asset answerTurnId does not match path")
    if asset.status == "pending":
        raise HTTPException(status_code=409, detail="Asset upload is not completed")

    suffix = _audio_suffix(file_name=asset.object_key, mime_type=asset.mime_type)
    safe_answer_turn_id = _safe_storage_id(answer_turn_id)
    audio_dir = Path(tempfile.gettempdir()) / "interviewiq_audio" / "answers"
    audio_path = audio_dir / f"{session_id}_{safe_answer_turn_id}_{asset.id}{suffix}"

    try:
        read_url = create_presigned_get_url(object_key=asset.object_key)
        await asyncio.to_thread(_download_url_to_path, read_url, audio_path)
    except Exception as exc:
        asset.status = "failed"
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Failed to download R2 asset: {exc}") from exc

    await _store_answer_audio(
        session_id=session_id,
        answer_turn_id=answer_turn_id,
        audio_path=audio_path,
        mime_type=asset.mime_type,
        duration_ms=asset.duration_ms,
        language=payload.language,
        browser_transcript=payload.browserTranscript,
        browser_latest_text=payload.browserLatestText,
        asset=asset,
    )
    answer_audio, transcription = await _transcribe_answer_audio_record(
        session_id=session_id,
        answer_turn_id=answer_turn_id,
        language=payload.language,
    )

    asset.status = "processed"
    await db.commit()

    return AnswerAudioAssetResponse(
        sessionId=session_id,
        answerTurnId=answer_turn_id,
        assetId=asset.id,
        status="processed",
        audioPath=str(audio_path),
        mimeType=asset.mime_type,
        durationMs=asset.duration_ms,
        transcription=answer_audio["transcription"],
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
        answer_audio, transcription = await _transcribe_answer_audio_record(
            session_id=session_id,
            answer_turn_id=answer_turn_id,
            language=payload.language,
        )

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
        "questionMeta": meta.get("currentQuestionMeta") or meta.get("questionMeta"),
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
            meta.get("questionSetId"),
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
        report = await _save_session_report(session_id, meta, report_id)
        await _sync_db_session_from_runtime(
            session_id,
            meta,
            status="finished",
            report=report,
        )
        logger.info(
            "session.report_ready session_id=%s report_id=%s answered=%s total=%s",
            session_id,
            report_id,
            len(report.get("questions") or []),
            meta.get("totalQuestions"),
        )
        return AnswerFinishResponse(
            answerTurnId=answer_turn_id,
            status="analysis_ready",
            nextQuestionPending=False,
            nextAnswerTurnId=None,
            nextQuestion=None,
            nextQuestionSource=None,
            questionIndex=int(current_progress.get("questionIndex", 1)),
            totalQuestions=int(current_progress.get("totalQuestions", 12)),
            phase=str(current_progress.get("phase") or "closing"),
            phaseGoal=str(current_progress.get("phaseGoal") or INTERVIEW_PHASES[-1]["goal"]),
            nextQuestionMeta=None,
            sessionFinished=True,
            reportId=report_id,
        )

    meta["currentAnswerTurnId"] = next_answer_turn_id
    meta["currentQuestion"] = next_question.text if next_question else None
    meta["currentQuestionSource"] = next_question.source if next_question else None
    meta["currentQuestionMeta"] = (
        next_progress.get("questionMeta") if next_progress else None
    )
    meta.update(next_progress or {})
    await _write_json(_session_meta_key(session_id), meta)
    await client.rpush(_turns_key(session_id), next_answer_turn_id)
    await client.expire(_turns_key(session_id), REDIS_TTL_SECONDS)
    await _sync_db_session_from_runtime(session_id, meta, status="active")
    logger.info(
        "session.next_question session_id=%s question_index=%s source=%s question_id=%s topic=%s",
        session_id,
        next_progress["questionIndex"] if next_progress else None,
        next_question.source if next_question else None,
        next_progress["questionMeta"]["questionId"] if next_progress else None,
        next_progress["questionMeta"]["topic"] if next_progress else None,
    )

    return AnswerFinishResponse(
        answerTurnId=answer_turn_id,
        status="analysis_ready",
        nextQuestionPending=False,
        nextAnswerTurnId=next_answer_turn_id,
        nextQuestion=next_question.text if next_question else None,
        nextQuestionSource=next_question.source if next_question else None,
        questionIndex=next_progress["questionIndex"] if next_progress else 1,
        totalQuestions=next_progress["totalQuestions"] if next_progress else 12,
        phase=next_progress["phase"] if next_progress else "ice_breaking",
        phaseGoal=next_progress["phaseGoal"] if next_progress else INTERVIEW_PHASES[0]["goal"],
        nextQuestionMeta=next_progress["questionMeta"] if next_progress else None,
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
        phase=meta.get("phase", "ice_breaking"),
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
    report = await _save_session_report(session_id, meta, report_id)
    await _sync_db_session_from_runtime(
        session_id,
        meta,
        status="finished",
        report=report,
    )
    return SessionFinishResponse(sessionId=session_id, status="finished", reportId=report_id)
