import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import Course, Document, Report, Session, User
from app.api.sessions import start_runtime_session
from app.schemas.course import (
    CourseCreate,
    CourseListResponse,
    CourseResponse,
    CourseSessionCreate,
    CourseSessionListResponse,
    CourseSessionResponse,
    CourseSessionStartCreate,
    CourseSessionStartResponse,
    CourseUpdate,
    ReportCreate,
    ReportListResponse,
    ReportResponse,
    RuntimeSessionResponse,
)
from app.schemas.session import SessionCreate

router = APIRouter(prefix="/api", tags=["courses"])
VALID_TARGET_PHASES = {
    "opening",
    "project_competency",
    "collaboration_problem_solving",
    "fit_closing",
}


def _course_response(course: Course) -> CourseResponse:
    return CourseResponse(
        id=course.id,
        userId=course.user_id,
        documentId=course.document_id,
        company=course.company,
        role=course.role,
        interviewType=course.interview_type,
        status=course.status,
        currentStage=course.current_stage,
        cycleIndex=course.cycle_index,
        createdAt=course.created_at,
        updatedAt=course.updated_at,
        completedAt=course.completed_at,
    )


def _session_response(session: Session) -> CourseSessionResponse:
    return CourseSessionResponse(
        id=session.id,
        courseId=session.course_id,
        userId=session.user_id,
        sessionType=session.session_type,
        cycleIndex=session.cycle_index,
        drillIndex=session.drill_index,
        targetPhase=session.target_phase,
        status=session.status,
        questionIndex=session.question_index,
        totalQuestions=session.total_questions,
        startedAt=session.started_at,
        endedAt=session.ended_at,
        createdAt=session.created_at,
        updatedAt=session.updated_at,
    )


def _report_response(report: Report) -> ReportResponse:
    return ReportResponse(
        id=report.id,
        courseId=report.course_id,
        sessionId=report.session_id,
        userId=report.user_id,
        reportType=report.report_type,
        summary=report.summary,
        metrics=report.metrics or {},
        comparison=report.comparison or {},
        recommendations=report.recommendations or {},
        status=report.status,
        createdAt=report.created_at,
        updatedAt=report.updated_at,
    )


async def _get_user_course(
    *,
    db: AsyncSession,
    user_id: str,
    course_id: str,
) -> Course:
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.user_id == user_id)
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


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


async def _recommended_target_phase(
    *,
    db: AsyncSession,
    user_id: str,
    course_id: str,
) -> str | None:
    result = await db.execute(
        select(Report)
        .where(
            Report.course_id == course_id,
            Report.user_id == user_id,
            Report.status == "ready",
        )
        .order_by(Report.created_at.desc())
    )
    for report in result.scalars().all():
        metrics = report.metrics if isinstance(report.metrics, dict) else {}
        recommendation = metrics.get("drillRecommendation")
        if not isinstance(recommendation, dict):
            continue
        target_phase = recommendation.get("targetPhase")
        if isinstance(target_phase, str) and target_phase in VALID_TARGET_PHASES:
            return target_phase
    return None


async def _resolve_target_phase(
    *,
    db: AsyncSession,
    user_id: str,
    course_id: str,
    session_type: str,
    requested_target_phase: str | None,
) -> str | None:
    if requested_target_phase:
        return requested_target_phase
    if session_type != "drill":
        return None
    return await _recommended_target_phase(
        db=db,
        user_id=user_id,
        course_id=course_id,
    )


@router.post("/courses", response_model=CourseResponse)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    document_id = None
    has_document_payload = any(
        [
            payload.resumeText,
            payload.jobPostingText,
            payload.resumeSummary,
            payload.jobSummary,
            payload.matchKeywords,
            payload.sourceFileName,
        ]
    )
    if has_document_payload:
        document = Document(
            id=f"doc_{uuid.uuid4().hex[:12]}",
            user_id=current_user.id,
            resume_text=payload.resumeText,
            job_posting_text=payload.jobPostingText,
            resume_summary=payload.resumeSummary,
            job_summary=payload.jobSummary,
            match_keywords=payload.matchKeywords,
            source_file_name=payload.sourceFileName,
        )
        db.add(document)
        document_id = document.id

    course = Course(
        id=f"course_{uuid.uuid4().hex[:12]}",
        user_id=current_user.id,
        document_id=document_id,
        company=payload.company,
        role=payload.role,
        interview_type=payload.interviewType,
        status="draft",
        current_stage="document_upload",
        cycle_index=1,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _course_response(course)


@router.get("/courses", response_model=CourseListResponse)
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course)
        .where(Course.user_id == current_user.id)
        .order_by(Course.created_at.desc())
    )
    return CourseListResponse(
        courses=[_course_response(course) for course in result.scalars().all()]
    )


@router.get("/courses/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    return _course_response(course)


@router.patch("/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    update = payload.model_dump(exclude_unset=True)
    field_map = {
        "interviewType": "interview_type",
        "currentStage": "current_stage",
        "cycleIndex": "cycle_index",
    }
    for key, value in update.items():
        setattr(course, field_map.get(key, key), value)

    if course.status == "completed" and course.completed_at is None:
        course.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(course)
    return _course_response(course)


@router.post("/courses/{course_id}/sessions", response_model=CourseSessionResponse)
async def create_course_session(
    course_id: str,
    payload: CourseSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    target_phase = await _resolve_target_phase(
        db=db,
        user_id=current_user.id,
        course_id=course_id,
        session_type=payload.sessionType,
        requested_target_phase=payload.targetPhase,
    )
    session = Session(
        id=f"s_{uuid.uuid4().hex[:12]}",
        course_id=course_id,
        user_id=current_user.id,
        session_type=payload.sessionType,
        cycle_index=payload.cycleIndex,
        drill_index=payload.drillIndex,
        target_phase=target_phase,
        status=payload.status,
        question_index=payload.questionIndex,
        total_questions=payload.totalQuestions,
        started_at=datetime.utcnow() if payload.status == "active" else None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_response(session)


@router.post("/courses/{course_id}/sessions/start", response_model=CourseSessionStartResponse)
async def start_course_session(
    course_id: str,
    payload: CourseSessionStartCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    target_phase = await _resolve_target_phase(
        db=db,
        user_id=current_user.id,
        course_id=course_id,
        session_type=payload.sessionType,
        requested_target_phase=payload.targetPhase,
    )
    session_id = f"s_{uuid.uuid4().hex[:12]}"
    session = Session(
        id=session_id,
        course_id=course_id,
        user_id=current_user.id,
        session_type=payload.sessionType,
        cycle_index=payload.cycleIndex,
        drill_index=payload.drillIndex,
        target_phase=target_phase,
        status="active",
        question_index=1,
        total_questions=payload.totalQuestions,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    await db.flush()

    runtime_payload = SessionCreate(
        company=course.company or "unknown",
        role=course.role or "general",
        interviewType=course.interview_type or "project_experience",
        chunkMs=payload.chunkMs,
        cluster=payload.cluster,
        industry=payload.industry,
        totalQuestions=payload.totalQuestions,
    )
    runtime = await start_runtime_session(
        runtime_payload,
        session_id=session_id,
        extra_meta={
            "userId": current_user.id,
            "courseId": course_id,
            "dbSessionId": session_id,
            "sessionType": payload.sessionType,
            "cycleIndex": payload.cycleIndex,
            "drillIndex": payload.drillIndex,
            "targetPhase": target_phase,
            "runtimeSource": "course_session_start",
        },
    )

    if course.status == "draft":
        course.status = "in_progress"
    if payload.sessionType == "baseline":
        course.current_stage = "baseline"
    elif payload.sessionType == "drill":
        course.current_stage = "drill"
    elif payload.sessionType == "full":
        course.current_stage = "full"
    course.cycle_index = max(course.cycle_index or 1, payload.cycleIndex)

    await db.commit()
    await db.refresh(session)
    return CourseSessionStartResponse(
        session=_session_response(session),
        runtime=RuntimeSessionResponse(**runtime.model_dump()),
    )


@router.get("/courses/{course_id}/sessions", response_model=CourseSessionListResponse)
async def list_course_sessions(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    result = await db.execute(
        select(Session)
        .where(Session.course_id == course_id, Session.user_id == current_user.id)
        .order_by(Session.created_at.asc())
    )
    return CourseSessionListResponse(
        sessions=[_session_response(session) for session in result.scalars().all()]
    )


@router.get("/sessions/{session_id}", response_model=CourseSessionResponse)
async def get_course_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_user_session(db=db, user_id=current_user.id, session_id=session_id)
    return _session_response(session)


@router.post("/courses/{course_id}/reports", response_model=ReportResponse)
async def create_course_report(
    course_id: str,
    payload: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    if payload.sessionId:
        session = await _get_user_session(
            db=db,
            user_id=current_user.id,
            session_id=payload.sessionId,
        )
        if session.course_id != course_id:
            raise HTTPException(status_code=400, detail="Session does not belong to course")

    report = Report(
        id=f"report_{uuid.uuid4().hex[:12]}",
        course_id=course_id,
        session_id=payload.sessionId,
        user_id=current_user.id,
        report_type=payload.reportType,
        summary=payload.summary,
        metrics=payload.metrics,
        comparison=payload.comparison,
        recommendations=payload.recommendations,
        status=payload.status,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _report_response(report)


@router.get("/courses/{course_id}/reports", response_model=ReportListResponse)
async def list_course_reports(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    result = await db.execute(
        select(Report)
        .where(Report.course_id == course_id, Report.user_id == current_user.id)
        .order_by(Report.created_at.asc())
    )
    return ReportListResponse(
        reports=[_report_response(report) for report in result.scalars().all()]
    )


@router.get("/courses/{course_id}/final-report", response_model=ReportResponse)
async def get_course_final_report(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    result = await db.execute(
        select(Report)
        .where(
            Report.course_id == course_id,
            Report.user_id == current_user.id,
            Report.report_type == "final_report",
        )
        .order_by(Report.created_at.desc())
    )
    report = result.scalars().first()
    if report is None:
        raise HTTPException(status_code=404, detail="Final report not found")
    return _report_response(report)


@router.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_response(report)
