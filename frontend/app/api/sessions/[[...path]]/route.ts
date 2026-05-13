import { NextResponse } from "next/server";

type SessionRecord = {
  sessionId: string;
  answerTurnId: string;
  firstQuestion: string;
  chunkMs: number;
  createdAt: string;
  status: "active" | "finished";
  reportId?: string;
  chunks: unknown[];
};

const sessions = new Map<string, SessionRecord>();

const QUESTIONS = [
  "Please introduce yourself and describe a backend project you are proud of.",
  "What was the most difficult technical problem in that project, and how did you solve it?",
  "How did you verify that your solution worked well in production?",
  "Tell me about a time you had to collaborate under pressure.",
];

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
      createdAt: new Date().toISOString(),
      status: "active",
      chunks: [],
    });

    return NextResponse.json({
      sessionId,
      answerTurnId,
      firstQuestion,
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
    const currentQuestionIndex = Math.max(
      QUESTIONS.findIndex((question) => question === session.firstQuestion),
      0
    );
    const nextQuestion = QUESTIONS[(currentQuestionIndex + 1) % QUESTIONS.length];
    const nextAnswerTurnId = makeId("answer");

    session.answerTurnId = nextAnswerTurnId;
    session.firstQuestion = nextQuestion;

    return NextResponse.json({
      answerTurnId,
      status: "analysis_ready",
      nextQuestionPending: true,
      nextAnswerTurnId,
      nextQuestion,
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
