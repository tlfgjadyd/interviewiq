import { NextResponse } from "next/server";

type SessionRecord = {
  sessionId: string;
  answerTurnId: string;
  firstQuestion: string;
  chunkMs: number;
  questionIndex: number;
  totalQuestions: number;
  phase: string;
  phaseGoal: string;
  createdAt: string;
  status: "active" | "finished";
  reportId?: string;
  chunks: unknown[];
  report?: unknown;
};

const sessions = new Map<string, SessionRecord>();

const QUESTIONS = [
  "Please introduce yourself and describe a backend project you are proud of.",
  "What was the most difficult technical problem in that project, and how did you solve it?",
  "How did you verify that your solution worked well in production?",
  "Tell me about a time you had to collaborate under pressure.",
];
const PHASE_GOAL = "로컬 mock 질문 흐름입니다. 실제 백엔드 연결 시 phase별 목표가 제공됩니다.";

const makeId = (prefix: string) => {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
};

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const getPath = async (context: RouteContext) => {
  const params = await context.params;
  return params.path ?? [];
};

const jsonError = (message: string, status: number) => {
  return NextResponse.json({ error: message }, { status });
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  const path = await getPath(context);

  if (path.length === 0) {
    const body = await request.json().catch(() => ({}));
    const sessionId = makeId("session");
    const answerTurnId = makeId("answer");
    const firstQuestion = QUESTIONS[0];

    sessions.set(sessionId, {
      sessionId,
      answerTurnId,
      firstQuestion,
      chunkMs: Number(body.chunkMs) || 5000,
      questionIndex: 1,
      totalQuestions: Number(body.totalQuestions) || 4,
      phase: "opening",
      phaseGoal: PHASE_GOAL,
      createdAt: new Date().toISOString(),
      status: "active",
      chunks: [],
    });

    return NextResponse.json({
      sessionId,
      answerTurnId,
      firstQuestion,
      firstQuestionSource: "mock",
      questionIndex: 1,
      totalQuestions: Number(body.totalQuestions) || 4,
      phase: "opening",
      phaseGoal: PHASE_GOAL,
    });
  }

  const [sessionId, action, answerTurnId, finishAction] = path;
  const session = sessions.get(sessionId);

  if (!session) {
    return jsonError("Session not found", 404);
  }

  if (action === "vision-chunks") {
    const chunk = await request.json().catch(() => null);
    session.chunks.push({ type: "vision", receivedAt: new Date().toISOString(), chunk });

    return NextResponse.json({ ok: true });
  }

  if (action === "audio-chunks") {
    const formData = await request.formData();
    const metadata = formData.get("metadata");

    session.chunks.push({
      type: "audio",
      receivedAt: new Date().toISOString(),
      metadata:
        typeof metadata === "string"
          ? JSON.parse(metadata)
          : null,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "answers" && answerTurnId && finishAction === "audio") {
    const formData = await request.formData();
    const metadata = formData.get("metadata");

    session.chunks.push({
      type: "answer_audio",
      answerTurnId,
      receivedAt: new Date().toISOString(),
      metadata:
        typeof metadata === "string"
          ? JSON.parse(metadata)
          : null,
    });

    return NextResponse.json({
      sessionId,
      answerTurnId,
      status: "received",
      audioPath: "mock://answer.webm",
      mimeType: "audio/webm",
      durationMs: 1000,
    });
  }

  if (action === "finish") {
    const reportId = makeId("report");
    session.status = "finished";
    session.reportId = reportId;

    return NextResponse.json({
      sessionId,
      status: "finished",
      reportId,
    });
  }

  if (action === "answers" && answerTurnId && finishAction === "finish") {
    const body = await request.json().catch(() => ({}));
    const isFinal = session.questionIndex >= session.totalQuestions;

    if (isFinal) {
      const reportId = makeId("report");
      session.status = "finished";
      session.reportId = reportId;
      session.report = {
        sessionId,
        reportId,
        status: "ready",
        totalQuestions: session.totalQuestions,
        answeredQuestions: session.questionIndex,
        overallSummary: [body.browserTranscript || "mock transcript"],
        overallFeedback: {
          content: "mock content feedback",
          nonverbal: "mock nonverbal feedback",
          improvementPoints: ["역할", "근거", "결과를 함께 말해보세요."],
        },
        questions: [],
        nextPractice: {
          recommendedQuestion: "대표 프로젝트를 STAR 구조로 다시 설명해 보세요.",
        },
      };

      return NextResponse.json({
        answerTurnId,
        status: "analysis_ready",
        nextQuestionPending: false,
        nextAnswerTurnId: null,
        nextQuestion: null,
        nextQuestionSource: null,
        questionIndex: session.questionIndex,
        totalQuestions: session.totalQuestions,
        phase: session.phase,
        phaseGoal: session.phaseGoal,
        sessionFinished: true,
        reportId,
      });
    }

    const nextQuestion = QUESTIONS[session.questionIndex % QUESTIONS.length];
    const nextAnswerTurnId = makeId("answer");

    session.answerTurnId = nextAnswerTurnId;
    session.firstQuestion = nextQuestion;
    session.questionIndex += 1;

    return NextResponse.json({
      answerTurnId,
      status: "analysis_ready",
      nextQuestionPending: false,
      nextAnswerTurnId,
      nextQuestion,
      nextQuestionSource: "mock",
      questionIndex: session.questionIndex,
      totalQuestions: session.totalQuestions,
      phase: session.phase,
      phaseGoal: session.phaseGoal,
      sessionFinished: false,
      reportId: null,
      answerText: body.browserTranscript ?? "",
      transcriptionSource: "browser_mock",
    });
  }

  return jsonError("Unsupported session endpoint", 404);
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  const path = await getPath(context);
  const [sessionId, action, answerTurnId, statusAction] = path;
  const session = sessions.get(sessionId);

  if (!session) {
    return jsonError("Session not found", 404);
  }

  if (action === "chunks") {
    return NextResponse.json({ sessionId, chunks: session.chunks });
  }

  if (action === "report") {
    if (!session.reportId) {
      return jsonError("Session report not ready", 404);
    }

    return NextResponse.json({
      sessionId,
      reportId: session.reportId,
      status: "ready",
      report: session.report,
    });
  }

  if (action === "answers" && answerTurnId && statusAction === "status") {
    return NextResponse.json({
      sessionId,
      answerTurnId,
      status: "analysis_ready",
      chunkCount: session.chunks.length,
    });
  }

  return NextResponse.json(session);
}
