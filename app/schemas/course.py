from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


CourseStatus = Literal["draft", "in_progress", "completed", "archived"]
CourseStage = Literal[
    "document_upload",
    "baseline",
    "baseline_report",
    "drill",
    "drill_report",
    "full",
    "full_report",
    "final_report",
    "completed",
]
SessionType = Literal["baseline", "drill", "full"]
SessionStatus = Literal["created", "active", "finished", "failed", "cancelled"]
TargetPhase = Literal[
    "ice_breaking",
    "basic_personality",
    "job_competency",
    "deep_dive",
    "closing",
]
ReportType = Literal["baseline_report", "drill_report", "full_report", "final_report"]
ReportStatus = Literal["generating", "ready", "failed"]


class CourseCreate(BaseModel):
    company: str | None = None
    role: str | None = None
    interviewType: str | None = None
    resumeText: str | None = None
    jobPostingText: str | None = None
    resumeSummary: dict[str, Any] = Field(default_factory=dict)
    jobSummary: dict[str, Any] = Field(default_factory=dict)
    matchKeywords: list[str] = Field(default_factory=list)
    sourceFileName: str | None = None


class CourseUpdate(BaseModel):
    company: str | None = None
    role: str | None = None
    interviewType: str | None = None
    status: CourseStatus | None = None
    currentStage: CourseStage | None = None
    cycleIndex: int | None = Field(default=None, ge=1)


class CourseResponse(BaseModel):
    id: str
    userId: str
    documentId: str | None
    company: str | None
    role: str | None
    interviewType: str | None
    status: str
    currentStage: str
    cycleIndex: int
    createdAt: datetime
    updatedAt: datetime
    completedAt: datetime | None


class CourseListResponse(BaseModel):
    courses: list[CourseResponse]


class CourseSessionCreate(BaseModel):
    sessionType: SessionType
    cycleIndex: int = Field(default=1, ge=1)
    drillIndex: int | None = Field(default=None, ge=1)
    targetPhase: TargetPhase | None = None
    status: SessionStatus = "created"
    questionIndex: int = Field(default=1, ge=1)
    totalQuestions: int = Field(default=12, ge=1, le=30)


class CourseSessionStartCreate(BaseModel):
    sessionType: SessionType
    cycleIndex: int = Field(default=1, ge=1)
    drillIndex: int | None = Field(default=None, ge=1)
    targetPhase: TargetPhase | None = None
    sourceSessionId: str | None = None
    drillId: str | None = None
    drillTarget: str | None = None
    initialQuestion: str | None = None
    chunkMs: int = Field(default=5000, gt=0)
    cluster: str | None = None
    industry: str | None = None
    totalQuestions: int = Field(default=12, ge=1, le=30)


class CourseSessionResponse(BaseModel):
    id: str
    courseId: str
    userId: str
    sessionType: str
    cycleIndex: int
    drillIndex: int | None
    targetPhase: str | None
    status: str
    questionIndex: int
    totalQuestions: int
    startedAt: datetime | None
    endedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime


class CourseSessionListResponse(BaseModel):
    sessions: list[CourseSessionResponse]


class RuntimeSessionResponse(BaseModel):
    sessionId: str
    sessionType: str | None = None
    courseId: str | None = None
    questionSetId: str | None = None
    sourceSessionId: str | None = None
    drillId: str | None = None
    drillTarget: str | None = None
    maxAnswerSec: int | None = None
    answerTurnId: str
    firstQuestion: str
    firstQuestionSource: str | None = None
    questionIndex: int
    totalQuestions: int
    phase: str
    phaseGoal: str
    currentQuestionMeta: dict[str, Any]


class CourseSessionStartResponse(BaseModel):
    session: CourseSessionResponse
    runtime: RuntimeSessionResponse


class ReportCreate(BaseModel):
    sessionId: str | None = None
    reportType: ReportType
    summary: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    comparison: dict[str, Any] = Field(default_factory=dict)
    recommendations: dict[str, Any] = Field(default_factory=dict)
    status: ReportStatus = "ready"


class ReportResponse(BaseModel):
    id: str
    courseId: str
    sessionId: str | None
    userId: str
    reportType: str
    summary: str | None
    metrics: dict[str, Any]
    comparison: dict[str, Any]
    recommendations: dict[str, Any]
    status: str
    createdAt: datetime
    updatedAt: datetime


class ReportListResponse(BaseModel):
    reports: list[ReportResponse]


class CorrectionLoopResponse(BaseModel):
    id: str
    courseId: str
    userId: str
    sourceSessionId: str | None
    sourceReportId: str | None
    loopIndex: int
    status: str
    goals: list[dict[str, Any]]
    drills: list[dict[str, Any]]
    plan: dict[str, Any]
    results: list[dict[str, Any]]
    createdAt: datetime
    updatedAt: datetime
    completedAt: datetime | None


class CorrectionLoopListResponse(BaseModel):
    loops: list[CorrectionLoopResponse]
