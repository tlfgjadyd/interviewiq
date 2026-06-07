from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, relationship

from app.core.config import settings


def table_name(name: str) -> str:
    return f"{settings.DB_TABLE_PREFIX}{name}"


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = table_name("users")

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    google_sub = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    courses = relationship("Course", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="user", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="user", cascade="all, delete-orphan")
    correction_loops = relationship(
        "CorrectionLoop",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Document(Base):
    __tablename__ = table_name("documents")

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    resume_text = Column(Text, nullable=True)
    job_posting_text = Column(Text, nullable=True)
    resume_summary = Column(JSON, default=dict, nullable=False)
    job_summary = Column(JSON, default=dict, nullable=False)
    match_keywords = Column(JSON, default=list, nullable=False)
    source_file_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User", back_populates="documents")
    courses = relationship("Course", back_populates="document")


class Course(Base):
    __tablename__ = table_name("courses")

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(
        String,
        ForeignKey(f"{Document.__tablename__}.id", ondelete="SET NULL"),
        nullable=True,
    )
    company = Column(String, nullable=True)
    role = Column(String, nullable=True)
    interview_type = Column(String, nullable=True)
    status = Column(String, default="draft", nullable=False)
    current_stage = Column(String, default="document_upload", nullable=False)
    cycle_index = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="courses")
    document = relationship("Document", back_populates="courses")
    sessions = relationship("Session", back_populates="course", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="course", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="course", cascade="all, delete-orphan")
    correction_loops = relationship(
        "CorrectionLoop",
        back_populates="course",
        cascade="all, delete-orphan",
    )


class Session(Base):
    __tablename__ = table_name("sessions")

    id = Column(String, primary_key=True)
    course_id = Column(
        String,
        ForeignKey(f"{Course.__tablename__}.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    session_type = Column(String, nullable=False)
    cycle_index = Column(Integer, default=1, nullable=False)
    drill_index = Column(Integer, nullable=True)
    target_phase = Column(String, nullable=True)
    status = Column(String, default="created", nullable=False)
    question_index = Column(Integer, default=1, nullable=False)
    total_questions = Column(Integer, default=12, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    course = relationship("Course", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    reports = relationship("Report", back_populates="session")
    assets = relationship("Asset", back_populates="session")


class Report(Base):
    __tablename__ = table_name("reports")

    id = Column(String, primary_key=True)
    course_id = Column(
        String,
        ForeignKey(f"{Course.__tablename__}.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id = Column(
        String,
        ForeignKey(f"{Session.__tablename__}.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    report_type = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    metrics = Column(JSON, default=dict, nullable=False)
    comparison = Column(JSON, default=dict, nullable=False)
    recommendations = Column(JSON, default=dict, nullable=False)
    status = Column(String, default="generating", nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    course = relationship("Course", back_populates="reports")
    session = relationship("Session", back_populates="reports")
    user = relationship("User", back_populates="reports")
    correction_loops = relationship("CorrectionLoop", back_populates="source_report")


class CorrectionLoop(Base):
    __tablename__ = table_name("correction_loops")

    id = Column(String, primary_key=True)
    course_id = Column(
        String,
        ForeignKey(f"{Course.__tablename__}.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    source_session_id = Column(
        String,
        ForeignKey(f"{Session.__tablename__}.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_report_id = Column(
        String,
        ForeignKey(f"{Report.__tablename__}.id", ondelete="SET NULL"),
        nullable=True,
    )
    loop_index = Column(Integer, default=1, nullable=False)
    status = Column(String, default="planned", nullable=False)
    goals = Column(JSON, default=list, nullable=False)
    drills = Column(JSON, default=list, nullable=False)
    plan = Column(JSON, default=dict, nullable=False)
    results = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    course = relationship("Course", back_populates="correction_loops")
    user = relationship("User", back_populates="correction_loops")
    source_session = relationship("Session")
    source_report = relationship("Report", back_populates="correction_loops")


class Asset(Base):
    __tablename__ = table_name("assets")

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey(f"{User.__tablename__}.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(
        String,
        ForeignKey(f"{Course.__tablename__}.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id = Column(
        String,
        ForeignKey(f"{Session.__tablename__}.id", ondelete="CASCADE"),
        nullable=True,
    )
    answer_turn_id = Column(String, nullable=True)
    asset_type = Column(String, nullable=False)
    object_key = Column(String, nullable=False, unique=True)
    bucket = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User", back_populates="assets")
    course = relationship("Course", back_populates="assets")
    session = relationship("Session", back_populates="assets")
