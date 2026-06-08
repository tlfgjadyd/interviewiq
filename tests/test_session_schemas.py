from app.schemas.session import (
    QuestionMeta,
    SessionCreate,
    SessionCreateResponse,
    SessionDocumentsRequest,
)


def test_session_create_accepts_five_flow_runtime_fields():
    payload = SessionCreate(
        company="sample_company",
        role="backend",
        interviewType="full",
        sessionType="drill",
        questionSetId="full_12",
        courseId="course_1",
        drillId="drill_1",
        drillTarget="project_experience",
        maxAnswerSec=90,
        initialQuestion="프로젝트 경험을 설명해 주세요.",
    )

    assert payload.sessionType == "drill"
    assert payload.questionSetId == "full_12"
    assert payload.initialQuestion


def test_question_meta_keeps_backend_question_set_metadata():
    meta = QuestionMeta(
        questionId="q10_deep_tradeoff",
        order=10,
        flow="deep_dive",
        phase="deep_dive",
        topic="technical_knowledge",
        title="기술 선택 심층 질문",
        text="그 선택의 trade-off를 설명해 주세요.",
        intent="technical depth",
        analysisFocus=["decision_quality", "tradeoff_awareness"],
    )

    assert meta.analysisFocus == ["decision_quality", "tradeoff_awareness"]
    assert meta.order == 10


def test_session_create_response_exposes_question_meta_and_course_fields():
    response = SessionCreateResponse(
        sessionId="s_1",
        sessionType="full",
        questionSetId="full_12",
        courseId="course_1",
        answerTurnId="turn_1",
        firstQuestion="자기소개를 해 주세요.",
        firstQuestionSource="question_set",
        questionIndex=1,
        totalQuestions=13,
        phase="ice_breaking",
        phaseGoal="warm up",
        currentQuestionMeta=QuestionMeta(
            questionId="q01_intro_self",
            order=1,
            topic="self_introduction",
            analysisFocus="clarity",
        ),
    )

    assert response.courseId == "course_1"
    assert response.currentQuestionMeta.questionId == "q01_intro_self"


def test_session_documents_request_is_text_based_not_pdf_upload():
    payload = SessionDocumentsRequest(
        resumeText="이력서 텍스트",
        jobPostingText="채용공고 텍스트",
        company="sample_company",
        role="backend",
    )

    assert payload.resumeText
    assert payload.jobPostingText
