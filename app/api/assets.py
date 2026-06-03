import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.r2 import create_presigned_get_url, create_presigned_put_url
from app.db.database import get_db
from app.db.models import Asset, Session, User
from app.schemas.asset import (
    AssetCompleteRequest,
    AssetListResponse,
    AssetReadUrlResponse,
    AssetResponse,
    AssetUploadUrlRequest,
    AssetUploadUrlResponse,
)

router = APIRouter(prefix="/api", tags=["assets"])
SAFE_EXTENSION_PATTERN = re.compile(r"^[a-zA-Z0-9]{1,12}$")
DEFAULT_EXTENSIONS = {
    "video/webm": "webm",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
}


def _asset_response(asset: Asset) -> AssetResponse:
    return AssetResponse(
        id=asset.id,
        userId=asset.user_id,
        courseId=asset.course_id,
        sessionId=asset.session_id,
        answerTurnId=asset.answer_turn_id,
        assetType=asset.asset_type,
        objectKey=asset.object_key,
        bucket=asset.bucket,
        mimeType=asset.mime_type,
        fileSizeBytes=asset.file_size_bytes,
        durationMs=asset.duration_ms,
        status=asset.status,
        createdAt=asset.created_at,
        updatedAt=asset.updated_at,
    )


async def _get_user_session(
    *,
    db: AsyncSession,
    user_id: str,
    session_id: str,
) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _extension_for(payload: AssetUploadUrlRequest) -> str:
    if payload.extension:
        extension = payload.extension.strip().lstrip(".")
        if SAFE_EXTENSION_PATTERN.match(extension):
            return extension.lower()
    return DEFAULT_EXTENSIONS.get(payload.mimeType.lower(), "bin")


def _object_key(
    *,
    user_id: str,
    course_id: str,
    session_id: str,
    asset_id: str,
    payload: AssetUploadUrlRequest,
) -> str:
    extension = _extension_for(payload)
    if payload.assetType == "answer_audio" and payload.answerTurnId:
        return (
            f"users/{user_id}/courses/{course_id}/sessions/{session_id}/"
            f"answers/{payload.answerTurnId}/{asset_id}.{extension}"
        )
    return (
        f"users/{user_id}/courses/{course_id}/sessions/{session_id}/"
        f"{payload.assetType}/{asset_id}.{extension}"
    )


@router.post("/sessions/{session_id}/assets/upload-url", response_model=AssetUploadUrlResponse)
async def create_asset_upload_url(
    session_id: str,
    payload: AssetUploadUrlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_user_session(db=db, user_id=current_user.id, session_id=session_id)
    asset_id = f"asset_{uuid.uuid4().hex[:12]}"
    object_key = _object_key(
        user_id=current_user.id,
        course_id=session.course_id,
        session_id=session.id,
        asset_id=asset_id,
        payload=payload,
    )

    try:
        upload_url = create_presigned_put_url(object_key=object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    asset = Asset(
        id=asset_id,
        user_id=current_user.id,
        course_id=session.course_id,
        session_id=session.id,
        answer_turn_id=payload.answerTurnId,
        asset_type=payload.assetType,
        object_key=object_key,
        bucket=settings.R2_BUCKET,
        mime_type=payload.mimeType,
        file_size_bytes=payload.fileSizeBytes,
        duration_ms=payload.durationMs,
        status="pending",
    )
    db.add(asset)
    await db.commit()

    return AssetUploadUrlResponse(
        assetId=asset_id,
        objectKey=object_key,
        uploadUrl=upload_url,
        expiresIn=settings.R2_PRESIGN_EXPIRES_SECONDS,
    )


@router.post("/sessions/{session_id}/assets/complete", response_model=AssetResponse)
async def complete_asset_upload(
    session_id: str,
    payload: AssetCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_session(db=db, user_id=current_user.id, session_id=session_id)
    result = await db.execute(
        select(Asset).where(
            Asset.id == payload.assetId,
            Asset.session_id == session_id,
            Asset.user_id == current_user.id,
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.object_key != payload.objectKey:
        raise HTTPException(status_code=400, detail="objectKey does not match asset")

    if payload.mimeType is not None:
        asset.mime_type = payload.mimeType
    if payload.fileSizeBytes is not None:
        asset.file_size_bytes = payload.fileSizeBytes
    if payload.durationMs is not None:
        asset.duration_ms = payload.durationMs
    asset.status = payload.status

    await db.commit()
    await db.refresh(asset)
    return _asset_response(asset)


@router.get(
    "/sessions/{session_id}/assets/{asset_id}/read-url",
    response_model=AssetReadUrlResponse,
)
async def create_asset_read_url(
    session_id: str,
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_session(db=db, user_id=current_user.id, session_id=session_id)
    result = await db.execute(
        select(Asset).where(
            Asset.id == asset_id,
            Asset.session_id == session_id,
            Asset.user_id == current_user.id,
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.status == "pending":
        raise HTTPException(status_code=409, detail="Asset upload is not completed")

    try:
        read_url = create_presigned_get_url(object_key=asset.object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AssetReadUrlResponse(
        assetId=asset.id,
        objectKey=asset.object_key,
        readUrl=read_url,
        expiresIn=settings.R2_PRESIGN_EXPIRES_SECONDS,
    )


@router.get("/sessions/{session_id}/assets", response_model=AssetListResponse)
async def list_session_assets(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_session(db=db, user_id=current_user.id, session_id=session_id)
    result = await db.execute(
        select(Asset)
        .where(Asset.session_id == session_id, Asset.user_id == current_user.id)
        .order_by(Asset.created_at.asc())
    )
    return AssetListResponse(
        assets=[_asset_response(asset) for asset in result.scalars().all()]
    )
