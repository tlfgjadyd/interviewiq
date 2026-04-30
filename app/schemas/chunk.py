from typing import Literal

from pydantic import BaseModel, Field


class PostureMetrics(BaseModel):
    badPostureCount: int = Field(ge=0)
    badPostureDurationMs: int = Field(ge=0)
    postureStability: float = Field(ge=0, le=1)


class HandMetrics(BaseModel):
    handVisibleRatio: float = Field(ge=0, le=1)
    handMovementIntensity: float = Field(ge=0, le=1)
    gestureCount: int = Field(ge=0)


class HeadMetrics(BaseModel):
    faceDetectedRatio: float = Field(ge=0, le=1)
    headForwardRatio: float = Field(ge=0, le=1)
    lookingAwayCount: int = Field(ge=0)
    lookingAwayDurationMs: int = Field(ge=0)


class VisionQualityMetrics(BaseModel):
    frameCount: int = Field(ge=0)
    validFrameRatio: float = Field(ge=0, le=1)
    fullBodyDetectedRatio: float = Field(ge=0, le=1)


class FullBodyVisionMetricsV1(BaseModel):
    posture: PostureMetrics
    hands: HandMetrics
    head: HeadMetrics
    quality: VisionQualityMetrics


class VisionChunkCreate(BaseModel):
    sessionId: str
    answerTurnId: str
    chunkId: str
    t0: int = Field(ge=0)
    t1: int = Field(gt=0)
    vision: FullBodyVisionMetricsV1


class AudioChunkMetadata(BaseModel):
    chunkId: str
    answerTurnId: str
    t0: int = Field(ge=0)
    t1: int = Field(gt=0)
    mimeType: str


class ChunkStatus(BaseModel):
    visionReady: bool = False
    audioReceived: bool = False
    speechReady: bool = False
    audioFeatureReady: bool = False


class ChunkAck(BaseModel):
    sessionId: str
    answerTurnId: str
    chunkId: str
    status: ChunkStatus


class AnswerChunkCounts(BaseModel):
    total: int
    visionReady: int
    audioReceived: int
    speechReady: int
    audioFeatureReady: int


class AnswerStatusResponse(BaseModel):
    answerTurnId: str
    status: Literal["collecting", "analyzing", "analysis_ready"]
    chunks: AnswerChunkCounts
