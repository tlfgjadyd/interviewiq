import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.db.models import CorrectionLoop, Course, Document, Report, Session, User
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
    CorrectionLoopListResponse,
    CorrectionLoopResponse,
    ReportCreate,
    ReportListResponse,
    ReportResponse,
    RuntimeSessionResponse,
)
from app.schemas.session import SessionCreate

router = APIRouter(prefix="/api", tags=["courses"])
VALID_TARGET_PHASES = {
    "ice_breaking",
    "basic_personality",
    "job_competency",
    "deep_dive",
    "closing",
}
FINAL_REPORT_METRIC_PATHS = [
    "nonverbal.averageNonverbalRiskScore",
    "nonverbal.gazeAwayRatio",
    "nonverbal.badPostureRatio",
    "nonverbal.fidgetingRatio",
    "nonverbal.legShakingRatio",
    "audio.averageSpeakingRatio",
    "audio.audioSignalChunkCount",
    "audio.totalSilenceMs",
    "audio.longSilenceCount",
    "content.averageAnswerLengthChars",
    "content.starScore",
    "content.specificityScore",
    "content.jobFitScore",
    "content.keywordCoverageScore",
    "content.evidenceScore",
    "content.relevanceScore",
]
LOWER_IS_BETTER_METRICS = {
    "nonverbal.averageNonverbalRiskScore",
    "nonverbal.gazeAwayRatio",
    "nonverbal.badPostureRatio",
    "nonverbal.fidgetingRatio",
    "nonverbal.legShakingRatio",
    "audio.totalSilenceMs",
    "audio.longSilenceCount",
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


def _correction_loop_response(loop: CorrectionLoop) -> CorrectionLoopResponse:
    return CorrectionLoopResponse(
        id=loop.id,
        courseId=loop.course_id,
        userId=loop.user_id,
        sourceSessionId=loop.source_session_id,
        sourceReportId=loop.source_report_id,
        loopIndex=loop.loop_index,
        status=loop.status,
        goals=loop.goals or [],
        drills=loop.drills or [],
        plan=loop.plan or {},
        results=loop.results or [],
        createdAt=loop.created_at,
        updatedAt=loop.updated_at,
        completedAt=loop.completed_at,
    )


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _metric_value(metrics: dict, path: str) -> float | None:
    current = metrics
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return _number(current)


def _metric_delta(current_metrics: dict, reference_metrics: dict, path: str) -> dict | None:
    current_value = _metric_value(current_metrics, path)
    reference_value = _metric_value(reference_metrics, path)
    if current_value is None or reference_value is None:
        return None
    delta = current_value - reference_value
    direction = "unchanged"
    if delta > 0:
        direction = "increased"
    elif delta < 0:
        direction = "decreased"
    lower_is_better = path in LOWER_IS_BETTER_METRICS
    improved = delta < 0 if lower_is_better else delta > 0
    if delta == 0:
        improved = None
    return {
        "current": round(current_value, 4),
        "reference": round(reference_value, 4),
        "delta": round(delta, 4),
        "deltaPercent": (
            round(delta / reference_value * 100, 2) if reference_value != 0 else None
        ),
        "direction": direction,
        "improved": improved,
        "lowerIsBetter": lower_is_better,
    }


def _report_metric_snapshot(report: Report) -> dict:
    metrics = report.metrics if isinstance(report.metrics, dict) else {}
    session_metrics = metrics.get("session") if isinstance(metrics.get("session"), dict) else {}
    drill_recommendation = (
        metrics.get("drillRecommendation")
        if isinstance(metrics.get("drillRecommendation"), dict)
        else {}
    )
    return {
        "reportId": report.id,
        "reportType": report.report_type,
        "sessionId": report.session_id,
        "createdAt": report.created_at.isoformat() if report.created_at else None,
        "session": session_metrics,
        "metrics": {
            path: _metric_value(metrics, path)
            for path in FINAL_REPORT_METRIC_PATHS
            if _metric_value(metrics, path) is not None
        },
        "drillRecommendation": drill_recommendation,
    }


def _first_report_by_type(reports: list[Report], report_type: str) -> Report | None:
    return next((report for report in reports if report.report_type == report_type), None)


def _last_report_by_type(reports: list[Report], report_type: str) -> Report | None:
    for report in reversed(reports):
        if report.report_type == report_type:
            return report
    return None


def _build_final_report_payload(course: Course, reports: list[Report]) -> dict:
    baseline = _first_report_by_type(reports, "baseline_report")
    latest_full = _last_report_by_type(reports, "full_report")
    latest_drill = _last_report_by_type(reports, "drill_report")
    latest = latest_full or reports[-1]

    latest_metrics = latest.metrics if isinstance(latest.metrics, dict) else {}
    baseline_metrics = baseline.metrics if baseline and isinstance(baseline.metrics, dict) else {}
    latest_recommendation = (
        latest_metrics.get("drillRecommendation")
        if isinstance(latest_metrics.get("drillRecommendation"), dict)
        else {}
    )

    baseline_deltas = {}
    improved_metrics = []
    remaining_risks = []
    if baseline_metrics:
        for path in FINAL_REPORT_METRIC_PATHS:
            delta = _metric_delta(latest_metrics, baseline_metrics, path)
            if delta is None:
                continue
            baseline_deltas[path] = delta
            if delta["improved"] is True:
                improved_metrics.append({"metric": path, **delta})
            elif delta["improved"] is False:
                remaining_risks.append({"metric": path, **delta})

    phase_scores = (
        latest_recommendation.get("phaseScores")
        if isinstance(latest_recommendation.get("phaseScores"), dict)
        else {}
    )
    next_target_phase = latest_recommendation.get("targetPhase")
    if not isinstance(next_target_phase, str):
        next_target_phase = None

    source_counts = {}
    for report in reports:
        source_counts[report.report_type] = source_counts.get(report.report_type, 0) + 1

    snapshots = [_report_metric_snapshot(report) for report in reports]
    summary_parts = [
        f"{course.company or '지원 기업'} {course.role or '지원 직무'} 코스의 최종 리포트입니다.",
        f"총 {len(reports)}개의 세션 리포트를 종합했습니다.",
    ]
    if baseline and latest.id != baseline.id:
        summary_parts.append("baseline 대비 최신 세션의 변화량을 기준으로 개선 추세를 계산했습니다.")
    if next_target_phase:
        summary_parts.append(f"다음 보완 우선 phase는 {next_target_phase}입니다.")

    return {
        "summary": " ".join(summary_parts),
        "metrics": {
            "schemaVersion": "final_metrics_v1",
            "sourceReports": {
                "count": len(reports),
                "countsByType": source_counts,
                "reportIds": [report.id for report in reports],
            },
            "latestReport": _report_metric_snapshot(latest),
            "baselineReportId": baseline.id if baseline else None,
            "latestFullReportId": latest_full.id if latest_full else None,
            "latestDrillReportId": latest_drill.id if latest_drill else None,
            "phaseScores": phase_scores,
            "nextTargetPhase": next_target_phase,
        },
        "comparison": {
            "schemaVersion": "final_comparison_v1",
            "baselineToLatest": {
                "baselineReportId": baseline.id if baseline else None,
                "latestReportId": latest.id,
                "metrics": baseline_deltas,
            },
            "improvedMetrics": improved_metrics[:5],
            "remainingRisks": remaining_risks[:5],
            "trend": snapshots,
        },
        "recommendations": {
            "schemaVersion": "final_recommendations_v1",
            "nextTargetPhase": next_target_phase,
            "reasons": latest_recommendation.get("reasons", [])
            if isinstance(latest_recommendation.get("reasons"), list)
            else [],
            "focus": [
                "baseline 대비 악화되었거나 개선 폭이 작은 지표를 우선 점검합니다.",
                "다음 drill은 final report의 nextTargetPhase를 기본 목표로 사용합니다.",
                "답변 길이, 침묵 구간, 시선 이탈, 자세 흔들림을 함께 확인합니다.",
            ],
        },
    }


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
        sessionType=payload.sessionType,
        questionSetId="demo_5" if payload.sessionType == "baseline" else "full_12",
        courseId=course_id,
        sourceSessionId=payload.sourceSessionId,
        drillId=payload.drillId,
        drillTarget=payload.drillTarget,
        initialQuestion=payload.initialQuestion,
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
            "sourceSessionId": payload.sourceSessionId,
            "drillId": payload.drillId,
            "drillTarget": payload.drillTarget,
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


@router.get("/courses/{course_id}/correction-loops", response_model=CorrectionLoopListResponse)
async def list_course_correction_loops(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    result = await db.execute(
        select(CorrectionLoop)
        .where(CorrectionLoop.course_id == course_id, CorrectionLoop.user_id == current_user.id)
        .order_by(CorrectionLoop.loop_index.asc(), CorrectionLoop.created_at.asc())
    )
    return CorrectionLoopListResponse(
        loops=[_correction_loop_response(loop) for loop in result.scalars().all()]
    )


@router.post("/courses/{course_id}/final-report", response_model=ReportResponse)
async def create_course_final_report(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_user_course(db=db, user_id=current_user.id, course_id=course_id)
    source_result = await db.execute(
        select(Report)
        .where(
            Report.course_id == course_id,
            Report.user_id == current_user.id,
            Report.status == "ready",
            Report.report_type != "final_report",
        )
        .order_by(Report.created_at.asc())
    )
    source_reports = source_result.scalars().all()
    if not source_reports:
        raise HTTPException(
            status_code=409,
            detail="At least one ready session report is required",
        )

    payload = _build_final_report_payload(course, source_reports)
    existing_result = await db.execute(
        select(Report)
        .where(
            Report.course_id == course_id,
            Report.user_id == current_user.id,
            Report.report_type == "final_report",
        )
        .order_by(Report.created_at.desc())
    )
    report = existing_result.scalars().first()
    if report is None:
        report = Report(
            id=f"report_{uuid.uuid4().hex[:12]}",
            course_id=course_id,
            session_id=None,
            user_id=current_user.id,
            report_type="final_report",
        )
        db.add(report)

    report.summary = payload["summary"]
    report.metrics = payload["metrics"]
    report.comparison = payload["comparison"]
    report.recommendations = payload["recommendations"]
    report.status = "ready"

    course.status = "completed"
    course.current_stage = "final_report"
    if course.completed_at is None:
        course.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(report)
    return _report_response(report)


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
