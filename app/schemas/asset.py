from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AssetType = Literal["session_video", "answer_audio", "full_audio"]
AssetStatus = Literal["pending", "uploaded", "processed", "failed"]


class AssetUploadUrlRequest(BaseModel):
    assetType: AssetType
    mimeType: str
    fileSizeBytes: int | None = Field(default=None, ge=0)
    durationMs: int | None = Field(default=None, ge=0)
    answerTurnId: str | None = None
    extension: str | None = None


class AssetUploadUrlResponse(BaseModel):
    assetId: str
    objectKey: str
    uploadUrl: str
    expiresIn: int
    method: Literal["PUT"] = "PUT"


class AssetReadUrlResponse(BaseModel):
    assetId: str
    objectKey: str
    readUrl: str
    expiresIn: int
    method: Literal["GET"] = "GET"


class AssetCompleteRequest(BaseModel):
    assetId: str
    objectKey: str
    mimeType: str | None = None
    fileSizeBytes: int | None = Field(default=None, ge=0)
    durationMs: int | None = Field(default=None, ge=0)
    status: AssetStatus = "uploaded"


class AssetResponse(BaseModel):
    id: str
    userId: str
    courseId: str
    sessionId: str | None
    answerTurnId: str | None
    assetType: str
    objectKey: str
    bucket: str | None
    mimeType: str | None
    fileSizeBytes: int | None
    durationMs: int | None
    status: str
    createdAt: datetime
    updatedAt: datetime


class AssetListResponse(BaseModel):
    assets: list[AssetResponse]
