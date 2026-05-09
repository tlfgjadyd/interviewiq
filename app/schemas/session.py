from typing import Literal

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    company: str
    role: str
    interviewType: str
    chunkMs: int = Field(default=5000, gt=0)
    cluster: str | None = None
    industry: str | None = None


class SessionCreateResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    firstQuestion: str
    firstQuestionSource: str | None = None


class AnswerFinishRequest(BaseModel):
    endedBy: Literal["voice_command", "silence", "button", "keyboard", "manual"]
    endedAt: int = Field(ge=0)
    endPhrase: str | None = None


class AnswerFinishResponse(BaseModel):
    answerTurnId: str
    status: Literal["analysis_ready"]
    nextQuestionPending: bool
    nextAnswerTurnId: str
    nextQuestion: str
    nextQuestionSource: str | None = None


class NextQuestionResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    question: str
    questionSource: str | None = None


class SessionFinishResponse(BaseModel):
    sessionId: str
    status: Literal["finished"]
    reportId: str


class SessionDocumentsRequest(BaseModel):
    resumeText: str
    jobPostingText: str
    company: str | None = None
    role: str | None = None


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
