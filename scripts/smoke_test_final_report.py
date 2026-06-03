import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import asyncpg
from dotenv import load_dotenv


PREFIX_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
METRIC_PATHS = [
    "nonverbal.averageNonverbalRiskScore",
    "nonverbal.gazeAwayRatio",
    "nonverbal.badPostureRatio",
    "nonverbal.fidgetingRatio",
    "audio.averageSpeakingRatio",
    "audio.totalSilenceMs",
    "audio.longSilenceCount",
    "content.averageAnswerLengthChars",
]
LOWER_IS_BETTER = {
    "nonverbal.averageNonverbalRiskScore",
    "nonverbal.gazeAwayRatio",
    "nonverbal.badPostureRatio",
    "nonverbal.fidgetingRatio",
    "audio.totalSilenceMs",
    "audio.longSilenceCount",
}


def get_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if raw_url:
        return raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    user = os.getenv("POSTGRES_USER", "")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "")
    if not user or not database:
        raise RuntimeError("DATABASE_URL or POSTGRES_USER/POSTGRES_DB must be configured")

    auth = quote(user, safe="")
    if password:
        auth = f"{auth}:{quote(password, safe='')}"
    return f"postgresql://{auth}@{host}:{port}/{database}"


def table(name: str) -> str:
    prefix = os.getenv("DB_TABLE_PREFIX", "ii_test_")
    full_name = f"{prefix}{name}"
    if not PREFIX_PATTERN.match(full_name):
        raise RuntimeError(f"Unsafe table name: {full_name}")
    return full_name


def metric_value(metrics: dict, path: str) -> float | None:
    current = metrics
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    if isinstance(current, bool) or not isinstance(current, (int, float)):
        return None
    return float(current)


def metric_delta(current_metrics: dict, reference_metrics: dict, path: str) -> dict | None:
    current = metric_value(current_metrics, path)
    reference = metric_value(reference_metrics, path)
    if current is None or reference is None:
        return None
    delta = current - reference
    improved = delta < 0 if path in LOWER_IS_BETTER else delta > 0
    if delta == 0:
        improved = None
    return {
        "current": round(current, 4),
        "reference": round(reference, 4),
        "delta": round(delta, 4),
        "improved": improved,
        "lowerIsBetter": path in LOWER_IS_BETTER,
    }


def sample_metrics(session_type: str, *, risk: float, silence: int, speaking: float) -> dict:
    phase_scores = {
        "opening": risk,
        "project_competency": risk + 4,
        "collaboration_problem_solving": risk + 8,
        "fit_closing": max(risk - 4, 0),
    }
    return {
        "schemaVersion": "metrics_v1",
        "session": {
            "sessionType": session_type,
            "totalQuestions": 3,
            "answeredQuestions": 3,
            "chunkCount": 9,
        },
        "nonverbal": {
            "averageNonverbalRiskScore": risk,
            "gazeAwayRatio": risk / 100,
            "badPostureRatio": risk / 140,
            "fidgetingRatio": risk / 160,
        },
        "audio": {
            "averageSpeakingRatio": speaking,
            "totalSilenceMs": silence * 1000,
            "longSilenceCount": silence,
        },
        "content": {
            "answerCount": 3,
            "averageAnswerLengthChars": 150 + int(speaking * 100),
        },
        "drillRecommendation": {
            "targetPhase": max(phase_scores, key=phase_scores.get),
            "weaknessScore": max(phase_scores.values()),
            "phaseScores": phase_scores,
            "reasons": ["smoke test recommendation"],
        },
    }


async def main() -> None:
    load_dotenv()
    conn = await asyncpg.connect(get_database_url())
    try:
        now = datetime.now(timezone.utc)
        suffix = uuid.uuid4().hex[:8]
        user_id = f"u_final_smoke_{suffix}"
        course_id = f"course_final_smoke_{suffix}"
        baseline_session_id = f"s_base_{suffix}"
        full_session_id = f"s_full_{suffix}"
        baseline_report_id = f"report_base_{suffix}"
        full_report_id = f"report_full_{suffix}"
        final_report_id = f"report_final_{suffix}"

        await conn.execute(
            f"""
            insert into {table("users")} (
                id, email, name, avatar_url, google_sub, last_login_at
            )
            values ($1, $2, $3, $4, $5, $6)
            """,
            user_id,
            f"{user_id}@example.test",
            "Final Report Smoke User",
            None,
            f"google_{user_id}",
            now,
        )
        await conn.execute(
            f"""
            insert into {table("courses")} (
                id, user_id, company, role, interview_type, status, current_stage, cycle_index
            )
            values ($1, $2, $3, $4, $5, 'in_progress', 'full_report', 1)
            """,
            course_id,
            user_id,
            "Smoke Company",
            "Backend Engineer",
            "project_experience",
        )
        await conn.execute(
            f"""
            insert into {table("sessions")} (
                id, course_id, user_id, session_type, cycle_index, status, question_index, total_questions
            )
            values
                ($1, $2, $3, 'baseline', 1, 'finished', 3, 3),
                ($4, $2, $3, 'full', 1, 'finished', 3, 3)
            """,
            baseline_session_id,
            course_id,
            user_id,
            full_session_id,
        )

        baseline_metrics = sample_metrics("baseline", risk=54.0, silence=5, speaking=0.42)
        full_metrics = sample_metrics("full", risk=31.0, silence=2, speaking=0.64)
        await conn.execute(
            f"""
            insert into {table("reports")} (
                id, course_id, session_id, user_id, report_type, summary, metrics,
                comparison, recommendations, status
            )
            values
                ($1, $2, $3, $4, 'baseline_report', 'baseline smoke report', $5::jsonb, '{{}}'::jsonb, '{{}}'::jsonb, 'ready'),
                ($6, $2, $7, $4, 'full_report', 'full smoke report', $8::jsonb, '{{}}'::jsonb, '{{}}'::jsonb, 'ready')
            """,
            baseline_report_id,
            course_id,
            baseline_session_id,
            user_id,
            json.dumps(baseline_metrics),
            full_report_id,
            full_session_id,
            json.dumps(full_metrics),
        )

        deltas = {
            path: delta
            for path in METRIC_PATHS
            if (delta := metric_delta(full_metrics, baseline_metrics, path)) is not None
        }
        final_metrics = {
            "schemaVersion": "final_metrics_v1",
            "sourceReports": {
                "count": 2,
                "countsByType": {"baseline_report": 1, "full_report": 1},
                "reportIds": [baseline_report_id, full_report_id],
            },
            "baselineReportId": baseline_report_id,
            "latestFullReportId": full_report_id,
            "nextTargetPhase": full_metrics["drillRecommendation"]["targetPhase"],
        }
        final_comparison = {
            "schemaVersion": "final_comparison_v1",
            "baselineToLatest": {
                "baselineReportId": baseline_report_id,
                "latestReportId": full_report_id,
                "metrics": deltas,
            },
        }
        final_recommendations = {
            "schemaVersion": "final_recommendations_v1",
            "nextTargetPhase": full_metrics["drillRecommendation"]["targetPhase"],
            "reasons": full_metrics["drillRecommendation"]["reasons"],
        }

        await conn.execute(
            f"""
            insert into {table("reports")} (
                id, course_id, session_id, user_id, report_type, summary, metrics,
                comparison, recommendations, status
            )
            values ($1, $2, null, $3, 'final_report', $4, $5::jsonb, $6::jsonb, $7::jsonb, 'ready')
            """,
            final_report_id,
            course_id,
            user_id,
            "Smoke Company Backend Engineer 코스의 최종 리포트입니다.",
            json.dumps(final_metrics),
            json.dumps(final_comparison),
            json.dumps(final_recommendations),
        )
        await conn.execute(
            f"""
            update {table("courses")}
            set status = 'completed', current_stage = 'final_report', completed_at = $1
            where id = $2
            """,
            now,
            course_id,
        )

        final_row = await conn.fetchrow(
            f"""
            select r.id, r.report_type, r.status, r.metrics, r.comparison,
                   c.status as course_status, c.current_stage
            from {table("reports")} r
            join {table("courses")} c on c.id = r.course_id
            where r.id = $1
            """,
            final_report_id,
        )
        metrics = json.loads(final_row["metrics"])
        comparison = json.loads(final_row["comparison"])
        print("final_report_id=", final_row["id"])
        print("report_type=", final_row["report_type"])
        print("report_status=", final_row["status"])
        print("course_status=", final_row["course_status"])
        print("course_stage=", final_row["current_stage"])
        print("metric_schema=", metrics["schemaVersion"])
        print("comparison_schema=", comparison["schemaVersion"])
        print(
            "nonverbal_risk_delta=",
            comparison["baselineToLatest"]["metrics"]["nonverbal.averageNonverbalRiskScore"][
                "delta"
            ],
        )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
