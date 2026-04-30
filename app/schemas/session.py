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


class NextQuestionResponse(BaseModel):
    sessionId: str
    answerTurnId: str
    question: str


class SessionFinishResponse(BaseModel):
    sessionId: str
    status: Literal["finished"]
    reportId: str
