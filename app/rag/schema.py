from typing import Literal

from pydantic import BaseModel, Field


DocType = Literal[
    "company_values",
    "interview_review",
    "question",
    "followup_question",
    "evaluation_criteria",
    "good_answer",
    "bad_answer",
    "star_guide",
    "nonverbal_criteria",
    "interview_basics",
    "resume_claim",
    "job_requirement",
    "resume_summary",
    "job_summary",
]


class RagMetadata(BaseModel):
    scope: Literal["global", "session"] = "global"
    sessionId: str | None = None
    company: str | None = None
    cluster: str = "general"
    industry: str | None = None
    role: str = "general"
    doc_type: DocType
    topic: str
    source: str = "team_curated"
    priority: int = Field(default=1, ge=1, le=5)


class RagDocument(BaseModel):
    id: str
    content: str
    metadata: RagMetadata


class RagSearchQuery(BaseModel):
    company: str | None = None
    cluster: str | None = None
    industry: str | None = None
    role: str | None = None
    interview_type: str | None = None
    text: str | None = None
    doc_types: list[DocType] | None = None
    limit: int = Field(default=5, gt=0, le=20)


class RagSearchResult(BaseModel):
    document: RagDocument
    score: float
    reasons: list[str]
