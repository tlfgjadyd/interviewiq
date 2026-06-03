-- InterviewIQ test tables for a shared PostgreSQL database.
-- These tables intentionally use the ii_test_ prefix so they do not modify
-- production/shared InterviewIQ tables.
--
-- Run this file only in the agreed shared test database/schema.

create table if not exists ii_test_users (
    id text primary key,
    email text not null unique,
    name text not null,
    avatar_url text,
    google_sub text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_login_at timestamptz
);

create table if not exists ii_test_documents (
    id text primary key,
    user_id text not null references ii_test_users(id) on delete cascade,
    resume_text text,
    job_posting_text text,
    resume_summary jsonb not null default '{}'::jsonb,
    job_summary jsonb not null default '{}'::jsonb,
    match_keywords jsonb not null default '[]'::jsonb,
    source_file_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists ii_test_courses (
    id text primary key,
    user_id text not null references ii_test_users(id) on delete cascade,
    document_id text references ii_test_documents(id) on delete set null,
    company text,
    role text,
    interview_type text,
    status text not null default 'draft',
    current_stage text not null default 'document_upload',
    cycle_index integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint ii_test_courses_status_check check (
        status in ('draft', 'in_progress', 'completed', 'archived')
    ),
    constraint ii_test_courses_current_stage_check check (
        current_stage in (
            'document_upload',
            'baseline',
            'baseline_report',
            'drill',
            'drill_report',
            'full',
            'full_report',
            'final_report',
            'completed'
        )
    ),
    constraint ii_test_courses_cycle_index_check check (cycle_index >= 1)
);

create table if not exists ii_test_sessions (
    id text primary key,
    course_id text not null references ii_test_courses(id) on delete cascade,
    user_id text not null references ii_test_users(id) on delete cascade,
    session_type text not null,
    cycle_index integer not null default 1,
    drill_index integer,
    target_phase text,
    status text not null default 'created',
    question_index integer not null default 1,
    total_questions integer not null default 12,
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ii_test_sessions_type_check check (
        session_type in ('baseline', 'drill', 'full')
    ),
    constraint ii_test_sessions_status_check check (
        status in ('created', 'active', 'finished', 'failed', 'cancelled')
    ),
    constraint ii_test_sessions_target_phase_check check (
        target_phase is null
        or target_phase in (
            'opening',
            'project_competency',
            'collaboration_problem_solving',
            'fit_closing'
        )
    ),
    constraint ii_test_sessions_cycle_index_check check (cycle_index >= 1),
    constraint ii_test_sessions_drill_index_check check (
        drill_index is null or drill_index >= 1
    ),
    constraint ii_test_sessions_question_index_check check (question_index >= 1),
    constraint ii_test_sessions_total_questions_check check (
        total_questions between 1 and 30
    )
);

create table if not exists ii_test_reports (
    id text primary key,
    course_id text not null references ii_test_courses(id) on delete cascade,
    session_id text references ii_test_sessions(id) on delete set null,
    user_id text not null references ii_test_users(id) on delete cascade,
    report_type text not null,
    summary text,
    metrics jsonb not null default '{}'::jsonb,
    comparison jsonb not null default '{}'::jsonb,
    recommendations jsonb not null default '{}'::jsonb,
    status text not null default 'generating',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ii_test_reports_type_check check (
        report_type in (
            'baseline_report',
            'drill_report',
            'full_report',
            'final_report'
        )
    ),
    constraint ii_test_reports_status_check check (
        status in ('generating', 'ready', 'failed')
    )
);

create table if not exists ii_test_assets (
    id text primary key,
    user_id text not null references ii_test_users(id) on delete cascade,
    course_id text not null references ii_test_courses(id) on delete cascade,
    session_id text references ii_test_sessions(id) on delete cascade,
    answer_turn_id text,
    asset_type text not null,
    object_key text not null unique,
    bucket text,
    mime_type text,
    file_size_bytes bigint,
    duration_ms integer,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ii_test_assets_type_check check (
        asset_type in ('session_video', 'answer_audio', 'full_audio')
    ),
    constraint ii_test_assets_status_check check (
        status in ('pending', 'uploaded', 'processed', 'failed')
    ),
    constraint ii_test_assets_file_size_check check (
        file_size_bytes is null or file_size_bytes >= 0
    ),
    constraint ii_test_assets_duration_check check (
        duration_ms is null or duration_ms >= 0
    )
);

create index if not exists idx_ii_test_documents_user_id
    on ii_test_documents(user_id);

create index if not exists idx_ii_test_courses_user_id
    on ii_test_courses(user_id);

create index if not exists idx_ii_test_courses_document_id
    on ii_test_courses(document_id);

create index if not exists idx_ii_test_courses_status
    on ii_test_courses(status);

create index if not exists idx_ii_test_sessions_course_id
    on ii_test_sessions(course_id);

create index if not exists idx_ii_test_sessions_user_id
    on ii_test_sessions(user_id);

create index if not exists idx_ii_test_sessions_status
    on ii_test_sessions(status);

create index if not exists idx_ii_test_reports_course_id
    on ii_test_reports(course_id);

create index if not exists idx_ii_test_reports_session_id
    on ii_test_reports(session_id);

create index if not exists idx_ii_test_reports_user_id
    on ii_test_reports(user_id);

create index if not exists idx_ii_test_assets_course_id
    on ii_test_assets(course_id);

create index if not exists idx_ii_test_assets_session_id
    on ii_test_assets(session_id);

create index if not exists idx_ii_test_assets_user_id
    on ii_test_assets(user_id);
