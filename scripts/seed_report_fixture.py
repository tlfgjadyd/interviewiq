import asyncio
import json
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.redis import REDIS_TTL_SECONDS, get_redis, init_redis
from app.db.database import AsyncSessionLocal, init_db
from app.db.models import Asset, CorrectionLoop, Course, Report, Session, User


USER_ID = "u_report_fixture"
COURSE_ID = "c_report_fixture"
SESSION_ID = "s_report_fixture_full"
REPORT_ID = "r_report_fixture_full"
ASSET_ID = "asset_report_fixture_video"


def _question(index, question_id, topic, phase, text, t0, t1, events, content):
    return {
        "questionId": question_id,
        "questionIndex": index,
        "topic": topic,
        "phase": phase,
        "text": text,
        "answerTurnId": f"a_report_fixture_{index:02d}",
        "answerText": content.get("answerText", ""),
        "t0": t0,
        "t1": t1,
        "events": events,
        "contentAnalysis": {
            "starScore": content.get("starScore", 60),
            "specificityScore": content.get("specificityScore", 60),
            "jobFitScore": content.get("jobFitScore", 60),
            "evidenceScore": content.get("evidenceScore", 60),
            "relevanceScore": content.get("relevanceScore", 60),
            "keywordCoverageScore": content.get("keywordCoverageScore", 60),
            "summary": content.get("summary", "답변 구조와 근거 제시가 보완 필요합니다."),
        },
    }


def build_report():
    questions = [
        _question(1, "q01_intro_self", "self_introduction", "ice_breaking", "자기소개를 해주세요.", 0, 55, [], {"starScore": 72, "specificityScore": 68, "jobFitScore": 70, "answerText": "개발 직무와 연결되는 강점을 중심으로 자기소개했습니다."}),
        _question(2, "q02_motivation_company", "motivation", "ice_breaking", "지원 동기를 설명해 주세요.", 55, 115, [{"type": "gaze_away", "t0": 72, "t1": 84, "severity": "medium", "score": 62}], {"starScore": 69, "specificityScore": 61, "jobFitScore": 73, "answerText": "회사 사업과 개인 경험의 연결을 설명했지만 근거가 짧았습니다."}),
        _question(3, "q03_strength_summary", "general", "basic_personality", "본인의 강점을 말해 주세요.", 115, 175, [], {"starScore": 74, "specificityScore": 65, "jobFitScore": 67}),
        _question(4, "q04_values_conflict", "values", "basic_personality", "갈등을 조율한 경험을 설명해 주세요.", 175, 250, [{"type": "fidget", "t0": 204, "t1": 219, "severity": "high", "score": 84}], {"starScore": 58, "specificityScore": 54, "jobFitScore": 62}),
        _question(5, "q05_teamwork", "teamwork", "basic_personality", "팀워크 경험을 설명해 주세요.", 250, 315, [{"type": "bad_posture", "t0": 268, "t1": 292, "severity": "medium", "score": 66}], {"starScore": 63, "specificityScore": 59, "jobFitScore": 66}),
        _question(6, "q06_situational_pressure", "situational", "basic_personality", "압박 상황에서 대응한 경험을 말해 주세요.", 315, 390, [{"type": "silence", "t0": 338, "t1": 351, "severity": "high", "score": 88}], {"starScore": 55, "specificityScore": 52, "jobFitScore": 58}),
        _question(7, "q07_project_role", "project_experience", "job_competency", "대표 프로젝트에서 맡은 역할을 설명해 주세요.", 390, 465, [{"type": "gaze_away", "t0": 420, "t1": 438, "severity": "high", "score": 82}], {"starScore": 64, "specificityScore": 57, "jobFitScore": 71}),
        _question(8, "q11_deep_failure", "project_experience", "deep_dive", "실패 사례와 재발 방지 조치를 설명해 주세요.", 465, 555, [{"type": "leg_shaking", "t0": 492, "t1": 530, "severity": "high", "score": 91}, {"type": "fidget", "t0": 536, "t1": 548, "severity": "medium", "score": 70}], {"starScore": 49, "specificityScore": 46, "jobFitScore": 55}),
        _question(9, "q08_technical_decision", "technical_knowledge", "job_competency", "기술 선택의 근거를 설명해 주세요.", 555, 630, [{"type": "gaze_away", "t0": 592, "t1": 606, "severity": "medium", "score": 65}], {"starScore": 60, "specificityScore": 58, "jobFitScore": 69}),
        _question(10, "q10_deep_tradeoff", "technical_knowledge", "deep_dive", "트레이드오프 판단 기준을 설명해 주세요.", 630, 720, [{"type": "silence", "t0": 652, "t1": 665, "severity": "high", "score": 86}, {"type": "leg_shaking", "t0": 668, "t1": 708, "severity": "high", "score": 89}], {"starScore": 45, "specificityScore": 43, "jobFitScore": 52}),
        _question(11, "q09_industry_fit", "industry_knowledge", "job_competency", "산업 이해도를 설명해 주세요.", 720, 790, [], {"starScore": 66, "specificityScore": 61, "jobFitScore": 74}),
        _question(12, "q12_closing_fit", "motivation", "closing", "마지막으로 직무 적합성을 정리해 주세요.", 790, 850, [{"type": "bad_posture", "t0": 810, "t1": 832, "severity": "medium", "score": 68}], {"starScore": 70, "specificityScore": 64, "jobFitScore": 76}),
    ]

    metrics = {
        "schemaVersion": "metrics_v1",
        "session": {"sessionType": "full", "totalQuestions": 12, "answeredQuestions": 12, "questionCount": 12},
        "nonverbal": {
            "averageNonverbalRiskScore": 42,
            "gazeAwayRatio": 0.32,
            "badPostureRatio": 0.21,
            "fidgetingRatio": 0.18,
            "legShakingRatio": 0.27,
            "averageLegShakingScore": 76,
        },
        "audio": {
            "averageSpeakingRatio": 0.62,
            "totalSilenceMs": 39000,
            "longSilenceCount": 2,
            "audioSignalChunkCount": 170,
        },
        "content": {
            "averageAnswerLengthChars": 310,
            "starScore": 61,
            "specificityScore": 57,
            "jobFitScore": 66,
            "keywordCoverageScore": 63,
            "evidenceScore": 55,
            "relevanceScore": 68,
        },
        "phase": {
            "ice_breaking": {"averageNonverbalRiskScore": 28, "gazeAwayRatio": 0.18, "badPostureRatio": 0.1, "fidgetingRatio": 0.06, "legShakingRatio": 0.08, "averageSpeakingRatio": 0.68, "longSilenceCount": 0},
            "basic_personality": {"averageNonverbalRiskScore": 47, "gazeAwayRatio": 0.22, "badPostureRatio": 0.24, "fidgetingRatio": 0.26, "legShakingRatio": 0.12, "averageSpeakingRatio": 0.58, "longSilenceCount": 1},
            "job_competency": {"averageNonverbalRiskScore": 38, "gazeAwayRatio": 0.35, "badPostureRatio": 0.16, "fidgetingRatio": 0.1, "legShakingRatio": 0.18, "averageSpeakingRatio": 0.64, "longSilenceCount": 0},
            "deep_dive": {"averageNonverbalRiskScore": 68, "gazeAwayRatio": 0.42, "badPostureRatio": 0.2, "fidgetingRatio": 0.24, "legShakingRatio": 0.46, "averageLegShakingScore": 84, "averageSpeakingRatio": 0.49, "longSilenceCount": 2},
            "closing": {"averageNonverbalRiskScore": 36, "gazeAwayRatio": 0.2, "badPostureRatio": 0.28, "fidgetingRatio": 0.08, "legShakingRatio": 0.1, "averageSpeakingRatio": 0.66, "longSilenceCount": 0},
        },
        "drillRecommendation": {
            "targetPhase": "deep_dive",
            "weaknessScore": 71.4,
            "reasons": ["Q8/Q10 심층 질문 구간에서 다리 움직임과 긴 침묵이 반복되었습니다."],
        },
    }
    display_metrics = [
        {"metricKey": "answer_quality", "label": "답변 품질", "score": 59, "status": "보완 필요", "summary": "STAR 구조와 구체적 근거 제시가 심층 질문에서 약해졌습니다."},
        {"metricKey": "job_fit", "label": "직무 적합성", "score": 66, "status": "보통", "summary": "직무 키워드는 일부 연결됐지만 경험의 결과 수치가 부족합니다."},
        {"metricKey": "delivery_stability", "label": "전달 안정성", "score": 61, "status": "보완 필요", "summary": "시선 이탈과 하체 움직임이 심층 질문 구간에서 증가했습니다."},
        {"metricKey": "nonverbal_risk", "label": "비언어 리스크", "score": 58, "status": "보완 필요", "summary": "fidget, leg shaking, bad posture 이벤트가 질문별로 기록되었습니다."},
    ]
    weak_patterns = [
        {"id": "weak_deep_dive_leg_shaking", "priority": 1, "title": "하체 움직임 안정화", "target": "leg_shaking", "flow": "deep_dive", "topic": "technical_knowledge", "sourceQuestionIds": ["q11_deep_failure", "q10_deep_tradeoff"], "analysisFocus": ["leg_shaking"], "evidence": ["Q8 492-530s leg_shaking", "Q10 668-708s leg_shaking"], "weaknessScore": 0.46, "recommendedInstruction": "심층 질문에서 하체를 고정하고 답변 리듬을 유지합니다."},
        {"id": "weak_deep_dive_answer_structure", "priority": 2, "title": "심층 답변 구조화", "target": "answer_structure", "flow": "deep_dive", "topic": "project_experience", "sourceQuestionIds": ["q11_deep_failure", "q10_deep_tradeoff"], "analysisFocus": ["answer_structure"], "evidence": ["Q8 STAR 49", "Q10 STAR 45"], "weaknessScore": 0.55, "recommendedInstruction": "상황-역할-행동-결과 순서로 압박 질문을 재정리합니다."},
        {"id": "weak_deep_dive_silence", "priority": 3, "title": "긴 침묵 줄이기", "target": "specificity", "flow": "deep_dive", "topic": "technical_knowledge", "sourceQuestionIds": ["q10_deep_tradeoff"], "analysisFocus": ["silence", "specificity"], "evidence": ["Q10 652-665s silence"], "weaknessScore": 0.57, "recommendedInstruction": "판단 기준을 먼저 말하고 예시를 붙여 침묵 시간을 줄입니다."},
    ]
    recommended_plan = {
        "planId": f"plan_{SESSION_ID}",
        "sourceSessionId": SESSION_ID,
        "courseId": COURSE_ID,
        "drillSet": {"loopIndex": 1, "totalDrills": 3, "status": "planned", "afterCompletion": "full_session", "nextActionLabel": "드릴 3개 완료 후 풀세션을 다시 진행합니다."},
        "drills": [
            {"drillId": "drill_leg_shaking_1", "title": "하체 안정 드릴", "target": "leg_shaking", "sourceFlow": "deep_dive", "sourceTopic": "technical_knowledge", "sourceQuestionIds": ["q11_deep_failure", "q10_deep_tradeoff"], "sourcePatternId": "weak_deep_dive_leg_shaking", "analysisFocus": ["leg_shaking"], "question": "Q10 트레이드오프 답변을 다시 말하면서 하체 움직임을 줄여 주세요.", "instruction": "발을 바닥에 고정하고 90초 동안 결론-근거-사례 순서로 답합니다.", "passCriteria": {"metric": "nonverbal.legShakingRatio", "operator": "<=", "threshold": 0.2}},
            {"drillId": "drill_answer_structure_2", "title": "심층 답변 구조 드릴", "target": "answer_structure", "sourceFlow": "deep_dive", "sourceTopic": "project_experience", "sourceQuestionIds": ["q11_deep_failure"], "sourcePatternId": "weak_deep_dive_answer_structure", "analysisFocus": ["answer_structure"], "question": "실패 사례를 STAR 순서로 다시 설명해 주세요.", "instruction": "상황-역할-행동-결과를 각각 한 문장 이상 포함합니다.", "passCriteria": {"metric": "content.starScore", "operator": ">=", "threshold": 75}},
            {"drillId": "drill_specificity_3", "title": "근거 구체화 드릴", "target": "specificity", "sourceFlow": "deep_dive", "sourceTopic": "technical_knowledge", "sourceQuestionIds": ["q10_deep_tradeoff"], "sourcePatternId": "weak_deep_dive_silence", "analysisFocus": ["specificity", "silence"], "question": "기술 선택의 트레이드오프를 수치나 기준 하나로 구체화해 주세요.", "instruction": "판단 기준을 먼저 말하고, 비교 기준과 결과를 붙입니다.", "passCriteria": {"metric": "content.specificityScore", "operator": ">=", "threshold": 70}},
        ],
    }
    return {
        "sessionId": SESSION_ID,
        "reportId": REPORT_ID,
        "status": "ready",
        "company": "테스트컴퍼니",
        "role": "백엔드 개발",
        "interviewType": "full",
        "totalQuestions": 12,
        "answeredQuestions": 12,
        "summary": "심층 질문 구간에서 하체 움직임과 긴 침묵이 증가했고, 답변 구조와 근거 구체성이 약해졌습니다.",
        "totalScore": 60,
        "displayMetrics": display_metrics,
        "weakPatterns": weak_patterns,
        "recommendedPlan": recommended_plan,
        "behaviorLinkedMoments": [
            {"questionId": "q10_deep_tradeoff", "questionIndex": 10, "eventType": "leg_shaking", "t0": 668, "t1": 708, "summary": "트레이드오프 설명 중 다리 움직임 증가"},
            {"questionId": "q10_deep_tradeoff", "questionIndex": 10, "eventType": "silence", "t0": 652, "t1": 665, "summary": "판단 기준 설명 전 긴 침묵"},
        ],
        "metrics": metrics,
        "overallSummary": ["심층 질문 구간에서 전달 안정성이 크게 낮아졌습니다.", "답변 구조와 근거 구체화를 중심으로 드릴을 추천합니다."],
        "overallFeedback": {
            "content": "STAR 구조와 결과 수치가 부족한 구간이 있습니다.",
            "nonverbal": "시선 이탈, 다리 움직임, 자세 흔들림이 질문별 이벤트로 기록되었습니다.",
            "improvementPoints": ["심층 질문에서 결론을 먼저 말하기", "하체 움직임 줄이기", "결과를 수치나 비교 기준으로 말하기"],
        },
        "questions": questions,
        "nextPractice": {
            "recommendedQuestion": "트레이드오프 판단 경험을 STAR 구조로 1분 안에 다시 설명해 주세요.",
            "targetPhase": "deep_dive",
            "weaknessScore": 71.4,
            "reasons": ["Q8/Q10 심층 질문 구간에서 다리 움직임과 긴 침묵이 반복되었습니다."],
            "focus": ["하체 안정", "STAR 구조", "근거 구체화"],
        },
    }


async def upsert():
    await init_db()
    await init_redis()
    report = build_report()
    now = datetime.utcnow()
    started_at = now - timedelta(minutes=18)
    ended_at = now - timedelta(minutes=4)

    if AsyncSessionLocal is None:
        raise RuntimeError("PostgreSQL is not configured")

    async with AsyncSessionLocal() as db:
        user = await db.get(User, USER_ID)
        if user is None:
            user = User(
                id=USER_ID,
                email="report-fixture@example.local",
                name="Report Fixture",
                google_sub="report-fixture",
                created_at=now,
                updated_at=now,
                last_login_at=now,
            )
            db.add(user)

        course = await db.get(Course, COURSE_ID)
        if course is None:
            course = Course(
                id=COURSE_ID,
                user_id=USER_ID,
                company="테스트컴퍼니",
                role="백엔드 개발",
                interview_type="full",
                status="active",
                current_stage="full_report",
                cycle_index=1,
                created_at=started_at,
                updated_at=now,
            )
            db.add(course)
        else:
            course.status = "active"
            course.current_stage = "full_report"
            course.updated_at = now

        session = await db.get(Session, SESSION_ID)
        if session is None:
            session = Session(
                id=SESSION_ID,
                course_id=COURSE_ID,
                user_id=USER_ID,
                session_type="full",
                cycle_index=1,
                status="finished",
                question_index=12,
                total_questions=12,
                started_at=started_at,
                ended_at=ended_at,
                created_at=started_at,
                updated_at=now,
            )
            db.add(session)
        else:
            session.status = "finished"
            session.question_index = 12
            session.total_questions = 12
            session.ended_at = ended_at
            session.updated_at = now

        db_report = await db.get(Report, REPORT_ID)
        report_metrics = {
            **report["metrics"],
            "fullReportPayload": report,
            "scoreSummary": {
                "totalScore": report["totalScore"],
                "displayMetrics": report["displayMetrics"],
                "weakPatterns": report["weakPatterns"],
            },
            "recommendedPlan": report["recommendedPlan"],
        }
        recommendations = {
            "nextPractice": report["nextPractice"],
            "recommendedPlan": report["recommendedPlan"],
        }
        if db_report is None:
            db_report = Report(
                id=REPORT_ID,
                course_id=COURSE_ID,
                session_id=SESSION_ID,
                user_id=USER_ID,
                report_type="full_report",
                summary=report["summary"],
                metrics=report_metrics,
                comparison={"baseline": {"reportId": None, "metrics": {}}, "previous": {"reportId": None, "metrics": {}}},
                recommendations=recommendations,
                status="ready",
                created_at=now,
                updated_at=now,
            )
            db.add(db_report)
        else:
            db_report.summary = report["summary"]
            db_report.metrics = report_metrics
            db_report.recommendations = recommendations
            db_report.status = "ready"
            db_report.updated_at = now

        loop = await db.get(CorrectionLoop, "loop_report_fixture_1")
        if loop is None:
            loop = CorrectionLoop(
                id="loop_report_fixture_1",
                course_id=COURSE_ID,
                user_id=USER_ID,
                source_session_id=SESSION_ID,
                source_report_id=REPORT_ID,
                loop_index=1,
                status="planned",
                goals=report["weakPatterns"],
                drills=report["recommendedPlan"]["drills"],
                plan=report["recommendedPlan"],
                results=[],
                created_at=now,
                updated_at=now,
            )
            db.add(loop)
        else:
            loop.goals = report["weakPatterns"]
            loop.drills = report["recommendedPlan"]["drills"]
            loop.plan = report["recommendedPlan"]
            loop.updated_at = now

        asset = await db.get(Asset, ASSET_ID)
        if asset is None:
            db.add(
                Asset(
                    id=ASSET_ID,
                    user_id=USER_ID,
                    course_id=COURSE_ID,
                    session_id=SESSION_ID,
                    asset_type="session_video",
                    object_key=f"fixtures/{SESSION_ID}/session_video.webm",
                    bucket="fixture",
                    mime_type="video/webm",
                    file_size_bytes=None,
                    duration_ms=850000,
                    status="pending",
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            asset.status = "pending"
            asset.duration_ms = 850000
            asset.updated_at = now

        await db.commit()

    meta = {
        "sessionId": SESSION_ID,
        "company": "테스트컴퍼니",
        "role": "백엔드 개발",
        "interviewType": "full",
        "sessionType": "full",
        "questionSetId": "full_12",
        "courseId": COURSE_ID,
        "status": "finished",
        "currentAnswerTurnId": "a_report_fixture_12",
        "currentQuestion": "마지막으로 직무 적합성을 정리해 주세요.",
        "currentQuestionMeta": {"questionId": "q12_closing_fit", "order": 12, "topic": "motivation", "phase": "closing", "analysisFocus": ["job_fit"]},
        "questionIndex": 12,
        "totalQuestions": 12,
        "phase": "closing",
        "reportId": REPORT_ID,
        "dbSessionId": SESSION_ID,
        "userId": USER_ID,
    }
    redis = await get_redis()
    await redis.set(f"session:{SESSION_ID}:meta", json.dumps(meta, ensure_ascii=False), ex=REDIS_TTL_SECONDS)
    await redis.set(f"session:{SESSION_ID}:report", json.dumps(report, ensure_ascii=False), ex=REDIS_TTL_SECONDS)
    await redis.rpush(f"session:{SESSION_ID}:turns", *[f"a_report_fixture_{i:02d}" for i in range(1, 13)])
    await redis.expire(f"session:{SESSION_ID}:turns", REDIS_TTL_SECONDS)

    print(f"seeded sessionId={SESSION_ID}")
    print(f"resultUrl=http://localhost:3000/result?sessionId={SESSION_ID}")
    print(f"courseId={COURSE_ID} reportId={REPORT_ID}")


if __name__ == "__main__":
    asyncio.run(upsert())
