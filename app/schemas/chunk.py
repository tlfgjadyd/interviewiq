from typing import Literal

from pydantic import BaseModel, Field, model_validator


class VisionContext(BaseModel):
    questionType: str = "unknown"
    answerPhase: Literal["start", "middle", "end", "unknown"] = "unknown"


class VisionEvent(BaseModel):
    type: Literal["leg_shaking", "leg_movement", "bad_posture", "fidget", "gaze_away"]
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    severity: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    reason: str

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.endMs < self.startMs:
            raise ValueError("endMs must be greater than or equal to startMs")
        return self


class VisionPostureV2(BaseModel):
    postureCollapse: float = Field(ge=0, le=100)
    bodySway: float = Field(ge=0, le=100)
    isBadPosture: bool
    isPostureCollapsed: bool


class VisionGazeV2(BaseModel):
    isFacingForward: bool
    isLookingAway: bool
    eyeCentered: bool
    headForward: bool
    gazeStable: bool
    gazeAwayDurationMs: int = Field(ge=0)
    gazePenalty: float = Field(ge=0, le=100)


class VisionGestureV2(BaseModel):
    fidgetScore: float = Field(ge=0, le=100)
    handMovement: float = Field(ge=0, le=100)
    handVelocity: float = Field(ge=0, le=100)
    handJerk: float = Field(ge=0, le=100)
    movementRepetition: float = Field(ge=0, le=100)
    handToFaceProximity: float = Field(ge=0, le=100)
    upperBodyMovement: float = Field(ge=0, le=100)
    legMovement: float = Field(ge=0, le=100)
    kneeMovement: float | None = Field(default=None, ge=0)
    kneeVelocity: float | None = Field(default=None, ge=0)
    kneeVariance: float | None = Field(default=None, ge=0)
    kneeZeroCrossingRate: float | None = Field(default=None, ge=0)
    kneeZeroCrossingScore: float | None = Field(default=None, ge=0, le=100)
    legShakingScore: float = Field(ge=0, le=100)


class VisionZScoresV2(BaseModel):
    postureCollapseZ: float | None = None
    handMovementZ: float | None = None
    gazeAwayZ: float | None = None
    bodySwayZ: float | None = None
    fidgetZ: float | None = None
    legMovementZ: float | None = None


class VisionStatesV2(BaseModel):
    isBadPosture: bool
    isFidgeting: bool
    isFacingForward: bool
    isGazeUnstable: bool
    isGoodSegment: bool
    isLegMovementHigh: bool
    isLegShaking: bool
    isPostureCollapsed: bool
    isNervous: bool
    isLookingAway: bool


class VisionQualityV2(BaseModel):
    frameCount: int = Field(ge=0)
    validFrameRatio: float = Field(ge=0, le=1)
    fullBodyDetectedRatio: float = Field(ge=0, le=1)
    lowerBodyDetectedRatio: float | None = Field(default=None, ge=0, le=1)
    faceResolutionLevel: Literal["low", "medium", "high"] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class VisionAnalysisV2(BaseModel):
    behaviorRiskScore: float = Field(ge=0, le=100)
    nonverbalRiskScore: float = Field(ge=0, le=100)
    level: Literal["good", "warning", "danger"]
    reasons: list[str] = Field(default_factory=list)
    events: list[VisionEvent] = Field(default_factory=list)
    posture: VisionPostureV2
    gaze: VisionGazeV2
    gesture: VisionGestureV2
    zScores: VisionZScoresV2 = Field(default_factory=VisionZScoresV2)
    states: VisionStatesV2
    quality: VisionQualityV2 | None = None


class RealtimeAudioSignals(BaseModel):
    rmsVolume: float = Field(ge=0)
    peakVolume: float | None = Field(default=None, ge=0)
    isSpeakingRatio: float = Field(ge=0, le=1)
    silenceDurationMs: int = Field(ge=0)
    volumeWarning: Literal["too_low", "too_high", "normal"] | None = None
    paceHint: Literal["slow", "normal", "fast"] | None = None


class VisionChunkCreate(BaseModel):
    version: Literal["vision_v2"]
    sessionId: str
    answerTurnId: str
    chunkId: str
    t0: int = Field(ge=0)
    t1: int = Field(gt=0)
    context: VisionContext = Field(default_factory=VisionContext)
    vision: VisionAnalysisV2
    realtimeAudioSignals: RealtimeAudioSignals | None = None

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.t1 <= self.t0:
            raise ValueError("t1 must be greater than t0")
        return self


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
    analysisReady: bool = False


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
    analysisReady: int


class AnswerStatusResponse(BaseModel):
    answerTurnId: str
    status: Literal["collecting", "analyzing", "analysis_ready"]
    chunks: AnswerChunkCounts
