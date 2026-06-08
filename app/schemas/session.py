from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class SessionCreate(BaseModel):
    company: str
    role: str
    interviewType: str
    chunkMs: int = Field(default=5000, gt=0)
    cluster: str | None = None
    industry: str | None = None
    totalQuestions: int = Field(default=12, ge=1, le=30)
    sessionType: Literal["full", "drill", "baseline"] = "full"
    questionSetId: str | None = "full_12"
    courseId: str | None = None
    questionSetVersion: str | None = None
    baselineId: str | None = None
    sourceSessionId: str | None = None
    drillId: str | None = None
    drillTarget: str | None = None
    maxAnswerSec: int | None = Field(default=None, gt=0)
    initialQuestion: str | None = None


class QuestionMeta(BaseModel):
    questionId: str
    order: int | None = None
    flow: str | None = None
    phase: str | None = None
    topic: str
    title: str | None = None
    text: str | None = None
    intent: str | None = None
    analysisFocus: str | list[str]


class SessionCreateResponse(BaseModel):
    sessionId: str
    sessionType: str | None = None
    questionSetId: str | None = None
    courseId: str | None = None
    questionSetVersion: str | None = None
    baselineId: str | None = None
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
    currentQuestionMeta: QuestionMeta


class AnswerFinishRequest(BaseModel):
    endedBy: Literal["voice_command", "silence", "button", "keyboard", "manual"]
    endedAt: int = Field(ge=0)
    endPhrase: str | None = None
    browserTranscript: str | None = None
    language: str | None = None
    speechMetrics: dict[str, Any] | None = None


class AnswerFinishResponse(BaseModel):
    answerTurnId: str
    status: Literal["analysis_ready"]
    nextQuestionPending: bool
    nextAnswerTurnId: str | None
    nextQuestion: str | None
    nextQuestionSource: str | None = None
    questionIndex: int
    totalQuestions: int
    phase: str
    phaseGoal: str
    nextQuestionMeta: QuestionMeta | None = None
    sessionFinished: bool = False
    reportId: str | None = None


class AnswerAudioMetadata(BaseModel):
    answerTurnId: str
    startedAt: int = Field(ge=0)
    endedAt: int = Field(gt=0)
    durationMs: int = Field(gt=0)
    mimeType: str
    language: str | None = None
    browserTranscript: str | None = None
    browserLatestText: str | None = None

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.endedAt <= self.startedAt:
            raise ValueError("endedAt must be greater than startedAt")
        return self


class AnswerAudioResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    status: Literal["received"]
    audioPath: str
    mimeType: str
    durationMs: int


class AnswerAudioAssetRequest(BaseModel):
    assetId: str
    language: str | None = None
    browserTranscript: str | None = None
    browserLatestText: str | None = None


class AnswerAudioAssetResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    assetId: str
    status: Literal["processed", "failed"]
    audioPath: str
    mimeType: str | None = None
    durationMs: int | None = None
    transcription: dict[str, Any]


class NextQuestionResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    question: str
    questionSource: str | None = None
    questionIndex: int
    totalQuestions: int
    phase: str
    phaseGoal: str


class SessionFinishResponse(BaseModel):
    sessionId: str
    status: Literal["finished"]
    reportId: str


class SessionReportResponse(BaseModel):
    sessionId: str
    reportId: str
    status: Literal["ready"]
    report: dict[str, Any]


class SessionDocumentsRequest(BaseModel):
    resumeText: str
    jobPostingText: str
    company: str | None = None
    role: str | None = None


class SessionDocumentsPdfResponse(BaseModel):
    status: Literal["parsed"]
    resumeText: str
    jobPostingText: str
    company: str | None = None
    role: str | None = None
    resumeFileName: str | None = None
    jobPostingFileName: str | None = None


class ResumeSummary(BaseModel):
    experiences: list[str]
    skills: list[str]
    claims: list[str]


class JobSummary(BaseModel):
    requiredSkills: list[str]
    preferredSkills: list[str]
    responsibilities: list[str]


class SessionDocumentsResponse(BaseModel):
    status: Literal["processed"]
    resumeSummary: ResumeSummary
    jobSummary: JobSummary
    matchKeywords: list[str]
    personalizedQuestion: str
    personalizedQuestionSource: str | None = None
