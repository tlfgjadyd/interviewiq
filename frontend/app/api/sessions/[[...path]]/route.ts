import { NextResponse } from "next/server";
import type {
  DrillAttempt,
  DrillTarget,
  QuestionSetId,
  SessionType,
} from "@/lib/runtime-types";
import { getQuestionSet } from "@/lib/question-loader";
import type { InterviewQuestion } from "@/lib/question-types";
import { fallbackReport } from "@/lib/training";

type SessionRecord = {
  sessionId: string;
  sessionType: SessionType;
  questionSetId?: QuestionSetId;
  courseId?: string;
  baselineId?: string;
  sourceSessionId?: string;
  drillId?: string;
  drillTarget?: DrillTarget;
  maxAnswerSec?: number;
  answerTurnId: string;
  firstQuestion: string;
  currentQuestionMeta?: InterviewQuestion;
  chunkMs: number;
  questionIndex: number;
  totalQuestions: number;
  phase: string;
  phaseGoal: string;
  createdAt: string;
  status: "active" | "finished";
  reportId?: string;
  chunks: unknown[];
  attempts: DrillAttempt[];
  report?: unknown;
};

const sessions = new Map<string, SessionRecord>();

const PHASE_GOAL =
  "mock 질문 흐름입니다. 실제 백엔드 연결 시 flow/topic별 목표가 제공됩니다.";

const makeId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const getPath = async (context: RouteContext) => {
  const params = await context.params;
  return params.path ?? [];
};

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request: Request, context: RouteContext) {
  const path = await getPath(context);

  if (path.length === 0) {
    const body = await request.json().catch(() => ({}));
    const sessionId = makeId("session");
    const answerTurnId = makeId("answer");
    const sessionType: SessionType =
      body.sessionType === "drill" ? "drill" : "full";
    const questionSet = getQuestionSet(body.questionSetId);
    const questionSetId = questionSet.questionSetId;
    const currentQuestionMeta =
      sessionType === "drill" && typeof body.initialQuestion === "string"
        ? undefined
        : questionSet.questions[0];
    const firstQuestion =
      typeof body.initialQuestion === "string"
        ? body.initialQuestion
        : currentQuestionMeta?.text ?? "자기소개를 부탁드립니다.";
    const totalQuestions =
      sessionType === "drill"
        ? 1
        : Number(body.totalQuestions) || questionSet.questions.length;

    const record: SessionRecord = {
      sessionId,
      sessionType,
      questionSetId,
      courseId: body.courseId,
      baselineId: body.baselineId,
      sourceSessionId: body.sourceSessionId,
      drillId: body.drillId,
      drillTarget: body.drillTarget,
      maxAnswerSec: Number(body.maxAnswerSec) || undefined,
      answerTurnId,
      firstQuestion,
      currentQuestionMeta,
      chunkMs: Number(body.chunkMs) || 5000,
      questionIndex: 1,
      totalQuestions,
      phase: currentQuestionMeta?.flow ?? "ice_breaking",
      phaseGoal: currentQuestionMeta?.intent ?? PHASE_GOAL,
      createdAt: new Date().toISOString(),
      status: "active",
      chunks: [],
      attempts: [],
    };

    sessions.set(sessionId, record);

    return NextResponse.json({
      sessionId,
      sessionType,
      questionSetId,
      courseId: record.courseId,
      baselineId: record.baselineId,
      sourceSessionId: record.sourceSessionId,
      drillId: record.drillId,
      drillTarget: record.drillTarget,
      maxAnswerSec: record.maxAnswerSec,
      answerTurnId,
      firstQuestion,
      firstQuestionMeta: currentQuestionMeta,
      currentQuestion: currentQuestionMeta,
      firstQuestionSource: "mock",
      questionIndex: 1,
      totalQuestions,
      phase: record.phase,
      phaseGoal: record.phaseGoal,
    });
  }

  const [sessionId, action, answerTurnId, finishAction] = path;
  const session = sessions.get(sessionId);

  if (!session) {
    return jsonError("Session not found", 404);
  }

  if (action === "vision-chunks") {
    const chunk = await request.json().catch(() => null);
    session.chunks.push({
      type: "vision",
      receivedAt: new Date().toISOString(),
      chunk,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "audio-chunks") {
    const formData = await request.formData();
    const metadata = formData.get("metadata");

    session.chunks.push({
      type: "audio",
      receivedAt: new Date().toISOString(),
      metadata: typeof metadata === "string" ? JSON.parse(metadata) : null,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "drill-attempts") {
    const body = (await request.json().catch(() => null)) as DrillAttempt | null;
    if (!body?.attemptId) {
      return jsonError("Invalid drill attempt", 400);
    }

    session.attempts.push(body);
    return NextResponse.json(body);
  }

  if (action === "answers" && answerTurnId && finishAction === "audio") {
    const formData = await request.formData();
    const metadata = formData.get("metadata");

    session.chunks.push({
      type: "answer_audio",
      answerTurnId,
      receivedAt: new Date().toISOString(),
      metadata: typeof metadata === "string" ? JSON.parse(metadata) : null,
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
    session.report = buildMockReport(session, reportId);

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
      session.report = buildMockReport(
        session,
        reportId,
        body.browserTranscript
      );

      return NextResponse.json({
        answerTurnId,
        status: "analysis_ready",
        nextQuestionPending: false,
        nextAnswerTurnId: null,
        nextQuestion: null,
        nextQuestionMeta: null,
        currentQuestion: null,
        nextQuestionSource: null,
        questionIndex: session.questionIndex,
        totalQuestions: session.totalQuestions,
        phase: session.phase,
        phaseGoal: session.phaseGoal,
        sessionFinished: true,
        reportId,
      });
    }

    const questionSet = getQuestionSet(session.questionSetId);
    const nextQuestionMeta =
      questionSet.questions[session.questionIndex] ?? questionSet.questions[0];
    const nextQuestion = nextQuestionMeta.text;
    const nextAnswerTurnId = makeId("answer");

    session.answerTurnId = nextAnswerTurnId;
    session.firstQuestion = nextQuestion;
    session.currentQuestionMeta = nextQuestionMeta;
    session.questionIndex += 1;
    session.phase = nextQuestionMeta.flow;
    session.phaseGoal = nextQuestionMeta.intent;

    return NextResponse.json({
      answerTurnId,
      status: "analysis_ready",
      nextQuestionPending: false,
      nextAnswerTurnId,
      nextQuestion,
      nextQuestionMeta,
      currentQuestion: nextQuestionMeta,
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

export async function GET(_request: Request, context: RouteContext) {
  const path = await getPath(context);
  const [sessionId, action, answerTurnId, statusAction] = path;
  const session = sessions.get(sessionId);

  if (!session) {
    return jsonError("Session not found", 404);
  }

  if (action === "chunks") {
    return NextResponse.json({ sessionId, chunks: session.chunks });
  }

  if (action === "drill-attempts") {
    return NextResponse.json({ sessionId, attempts: session.attempts });
  }

  if (action === "report") {
    if (!session.reportId) {
      const reportId = makeId("report");
      session.reportId = reportId;
      session.report = buildMockReport(session, reportId);
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

const buildMockReport = (
  session: SessionRecord,
  reportId: string,
  summary?: string
) => ({
  ...fallbackReport,
  sessionId: session.sessionId,
  reportId,
  summary: summary || fallbackReport.summary,
  weakPatterns: fallbackReport.weakPatterns.map((pattern) => ({
    ...pattern,
    flow: session.currentQuestionMeta?.flow ?? pattern.flow,
    topic: session.currentQuestionMeta?.topic ?? pattern.topic,
    sourceQuestionIds:
      pattern.sourceQuestionIds ??
      (session.currentQuestionMeta ? [session.currentQuestionMeta.questionId] : []),
    analysisFocus:
      pattern.analysisFocus ?? session.currentQuestionMeta?.analysisFocus,
  })),
  recommendedPlan: {
    ...fallbackReport.recommendedPlan,
    sourceSessionId: session.sessionId,
  },
});
