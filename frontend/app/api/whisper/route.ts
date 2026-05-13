import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-OpenRouter-Title": "AI Interview Coach",
  },
});

const parseJsonObject = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
};

export async function POST(req: Request) {
  try {
    const {
      transcription,
      history,
      language,
      speechMetrics,
      sessionId,
      answerTurnId,
      latestVision,
      mode,
    } = await req.json();

    if (!transcription) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const isKorean = language === "ko-KR";
    const speechMetricsText = speechMetrics
      ? JSON.stringify(speechMetrics, null, 2)
      : isKorean
      ? "제공된 음성 지표 없음"
      : "No speech metrics provided";
    const latestVisionText = latestVision
      ? JSON.stringify({ sessionId, answerTurnId, latestVision }, null, 2)
      : isKorean
      ? "제공된 비언어 행동 요약 없음"
      : "No nonverbal vision summary provided";

    const coachingPrompt = isKorean
      ? `
지원자의 면접 답변과 음성 관찰 지표를 바탕으로 테스트용 실시간 말하기 평가를 생성하세요.
의학적 진단이나 심리 상태 단정은 금지합니다.
관찰 가능한 말하기 신호와 단어 선택만 평가하세요.
반드시 아래 JSON 형식만 반환하세요.
{
  "overallStatus": "좋음 | 보통 | 개선 필요",
  "deliveryScore": 0부터 100 사이 숫자,
  "confidenceSignal": "안정적 | 약간 긴장 신호 | 긴장 신호 높음",
  "wordChoiceStatus": "적절함 | 다소 모호함 | 구체성 부족",
  "toneFeedback": "짧은 한국어 한 문장",
  "wordChoiceFeedback": "짧은 한국어 한 문장",
  "nextTip": "바로 적용할 수 있는 짧은 한국어 조언 한 문장"
}
`
      : `
Create a test real-time speaking evaluation from the candidate answer and speech observation metrics.
Do not make medical claims or assert psychological state.
Evaluate only observable speaking signals and word choice.
Return only JSON in this exact shape.
{
  "overallStatus": "Good | Fair | Needs work",
  "deliveryScore": number from 0 to 100,
  "confidenceSignal": "Stable | Slight tension signal | High tension signal",
  "wordChoiceStatus": "Appropriate | Somewhat vague | Lacks specificity",
  "toneFeedback": "one short English sentence",
  "wordChoiceFeedback": "one short English sentence",
  "nextTip": "one short actionable English sentence"
}
`;

    if (mode === "coaching_only") {
      const coachingResponse = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: coachingPrompt,
          },
          {
            role: "user",
            content: isKorean
              ? `지원자 답변:\n${transcription}\n\n음성 관찰 지표:\n${speechMetricsText}`
              : `Candidate response:\n${transcription}\n\nSpeech observation metrics:\n${speechMetricsText}`,
          },
        ],
      });

      const coachingAnalysis = parseJsonObject(
        coachingResponse.choices[0].message.content ?? ""
      );

      return NextResponse.json({
        coachingAnalysis,
      });
    }

    const systemPrompt = isKorean
      ? `
당신의 이름은 Alloy이며 전문 면접관입니다.

당신의 역할:
지원자의 답변에 자연스럽게 반응하고,
추가 질문을 이어가며 실제 면접처럼 대화를 진행하세요.

스타일:
자연스럽고 사람처럼 말하세요.
너무 딱딱하지 않게 하되 전문적인 톤을 유지하세요.
한 번에 하나의 질문만 하세요.

음성 지표 사용법:
음성 지표가 제공되면 말 속도, 침묵, 필러 표현, 볼륨 변화 같은 관찰 가능한 사실만 참고하세요.
지원자가 긴장했다고 단정하지 말고, 필요할 때만 부드럽게 답변 방식 개선을 유도하세요.
응답은 면접 흐름을 유지하는 후속 질문이어야 하며 피드백 리포트처럼 길게 설명하지 마세요.

중요:
항상 한국어로만 답변하세요.
마크다운, 리스트, 특수기호 사용 금지.
면접관이라고 말하기 금지.
`
      : `
Your name is Alloy, a professional interviewer conducting a mock interview.

Your role:
Ask follow-up questions, react naturally to the candidate’s answers,
and keep the conversation flowing like a real interview.

Style:
Natural and conversational.
Professional but not robotic.
Ask one question at a time.

How to use speech metrics:
If speech metrics are provided, use only observable signals such as speaking rate, pauses, filler words, and volume variation.
Do not claim the candidate is nervous. Gently guide answer delivery only when it helps the interview flow.
Your response should remain a follow-up interview question, not a long feedback report.

IMPORTANT:
Use plain text only.
No bullet points.
No markdown.
Always reply in English.
`;

    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: isKorean
            ? `대화 기록:\n${history}`
            : `Conversation History:\n${history}`,
        },
        {
          role: "user",
          content: isKorean
            ? `지원자 답변:\n${transcription}`
            : `Candidate response:\n${transcription}`,
        },
        {
          role: "user",
          content: isKorean
            ? `음성 관찰 지표:\n${speechMetricsText}`
            : `Speech observation metrics:\n${speechMetricsText}`,
        },
        {
          role: "user",
          content: isKorean
            ? `비언어 행동 요약:\n${latestVisionText}`
            : `Nonverbal vision summary:\n${latestVisionText}`,
        },
      ],
    });

    const replyText = response.choices[0].message.content ?? "";
    const coachingResponse = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: coachingPrompt,
        },
        {
          role: "user",
          content: isKorean
            ? `지원자 답변:\n${transcription}\n\n음성 관찰 지표:\n${speechMetricsText}`
            : `Candidate response:\n${transcription}\n\nSpeech observation metrics:\n${speechMetricsText}`,
        },
      ],
    });

    const coachingAnalysis = parseJsonObject(
      coachingResponse.choices[0].message.content ?? ""
    );

    return NextResponse.json({
      text: replyText,
      coachingAnalysis,
    });
  } catch (err) {
    console.error("Error generating interviewer response:", err);
    return NextResponse.json(
      { error: "Failed to generate interviewer response" },
      { status: 500 }
    );
  }
}
