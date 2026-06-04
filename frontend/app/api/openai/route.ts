import { NextResponse } from "next/server";
import OpenAI from "openai";

const createOpenRouterClient = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-OpenRouter-Title": "AI Interview Coach",
    },
  });
};

export async function POST(req: Request) {
  try {
    const openai = createOpenRouterClient();
    if (!openai) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const { content, history, language } = await req.json();
    const isKorean = language === "ko-KR";

    const systemPrompt = isKorean
      ? `
당신은 모의 면접 영상을 리뷰하는 전문 면접관이자 인터뷰 코치입니다.
면접자의 답변 내용과 비언어적 요소(자세, 시선, 손동작)를 함께 평가하세요.

다음 항목을 자연스러운 문단 형태로 포함하세요.
답변 구조와 전달력
내용의 깊이와 설득력
자세, 시선, 손동작에 대한 평가
전반적인 인상과 자신감
가장 중요한 개선점 3~5개
실행 가능한 개선 계획

중요:
항상 한국어로만 답변하세요.
마크다운, 리스트, 특수기호 사용 금지.
완전한 문장과 문단으로만 작성하세요.
`
      : `
You are a professional recruiter and interview coach reviewing a recorded mock interview session.
Evaluate both verbal answers and non-verbal communication.

Include:
Communication and structure
Content quality and depth
Body language
Confidence and overall impression
Top 3-5 improvement points
A practical improvement plan

IMPORTANT:
Use complete sentences and paragraphs only.
Do not use Markdown, bullet points, or special symbols.
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
            ? `대화 기록: ${history}`
            : `Conversation History: ${history}`,
        },
        {
          role: "user",
          content: isKorean
            ? `면접 바디랭귀지 결과: ${content}`
            : `Interview Body Language Results: ${content}`,
        },
      ],
    });

    return NextResponse.json({
      message: response.choices[0].message.content,
      status: 200,
    });
  } catch (err) {
    console.error("Error generating summary:", err);
    return NextResponse.json(
      { error: "Error generating summary" },
      { status: 500 }
    );
  }
}
