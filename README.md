# InterviewIQ

InterviewIQ는 AI 모의 면접 코칭 프로젝트다. 프론트엔드는 면접 중 웹캠 데이터를 답변 중 5초 단위로 전송하고, 마이크 녹음은 답변 단위 audio 파일로 백엔드에 업로드한다. 백엔드는 이 데이터를 `sessionId + answerTurnId` 기준으로 Redis에 저장하고, 답변 단위로 분석한다.

현재 목표는 다음과 같다.

- 프론트엔드의 `vision_v2` chunk 수신
- `MediaRecorder` 기반 answer audio 수신
- Redis에 chunk 데이터 병합 저장
- OpenAI STT 결과를 최종 답변 텍스트로 우선 활용
- 브라우저 `SpeechRecognition` 결과를 fallback 답변 텍스트로 활용
- 답변 종료 후 다음 질문 또는 꼬리질문 생성
- 이후 음성 정밀 분석과 최종 리포트 고도화를 붙일 수 있는 구조 유지

## 프로젝트 구조

```text
backend/
  app/                 FastAPI 백엔드
  rag_data/            JSONL 기반 경량 RAG 데이터
  tests/               백엔드 테스트 스크립트
  frontend/            Next.js 프론트엔드
  ref/                 프로젝트 인수인계/설계 문서, Git에서는 제외
```

## 현재 면접 흐름

```text
Start Session
-> 답변 시작
-> 프론트가 답변 중 vision chunk 수집
-> 답변 종료 시 answer audio 업로드
-> 백엔드가 STT 후 다음 질문 생성
-> 반복
-> End Interview
-> 백엔드 세션 종료
```

UI에서 헷갈리기 쉬운 구분:

- `Finish Answer`: 현재 답변을 종료하고 다음 질문을 요청한다.
- `Stop Streaming`: 마이크, MediaRecorder, SpeechRecognition만 정지한다. 백엔드 세션 종료가 아니다.
- `End Interview`: 전체 면접 세션을 종료한다.

## 백엔드 실행 방법

### 요구사항

- Python 3.11+
- Redis
- PostgreSQL은 현재 선택 사항이다. 없어도 서버는 경고만 출력하고 계속 실행된다.

### 설치

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS/Linux:

```bash
source .venv/bin/activate
```

패키지 설치:

```bash
pip install -r requirements.txt
```

### 환경변수

`backend/.env` 파일을 만들고 `.env.example`을 참고해 값을 채운다.

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interviewiq
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_QUESTION_MODEL=openai/gpt-4o-mini
ENABLE_LLM_QUESTION_GENERATION=false
```

참고:

- `ENABLE_LLM_QUESTION_GENERATION=false`이면 비용을 쓰지 않고 fallback 질문을 생성한다.
- 현재 질문 생성은 OpenAI 호환 클라이언트로 OpenRouter를 호출하는 구조다.
- 답변 단위 오디오가 업로드된 경우 `OPENAI_STT_MODEL`로 OpenAI STT를 수행하고, 실패하면 브라우저 전사 또는 기존 speech chunk를 fallback으로 사용한다.

### Redis 실행

Windows Docker:

```bash
docker run -d -p 6379:6379 redis
```

macOS:

```bash
brew install redis
brew services start redis
```

Linux:

```bash
sudo apt install redis-server
sudo systemctl start redis
```

### 백엔드 서버 실행

```bash
uvicorn app.main:app --reload
```

확인 URL:

- API 문서: http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

## 프론트엔드 실행 방법

```bash
cd frontend
npm install
```

`frontend/.env` 파일을 만든다.

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

실행:

```bash
npm run dev
```

브라우저에서 접속:

```text
http://localhost:3000
```

주의:

```text
NEXT_PUBLIC_BACKEND_URL이 비어 있으면 FastAPI 백엔드가 아니라 프론트 내부 mock API로 요청이 간다.
실제 백엔드와 연동하려면 NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 으로 설정해야 한다.
```

## API 목록

| Method | Path                                                        | 설명                             |
| ------ | ----------------------------------------------------------- | -------------------------------- |
| GET    | `/health`                                                   | 백엔드 헬스체크                  |
| POST   | `/api/sessions`                                             | 면접 세션 생성                   |
| POST   | `/api/sessions/{sessionId}/documents`                       | 자기소개서/채용공고 텍스트 등록  |
| GET    | `/api/sessions/{sessionId}/documents`                       | 세션 문서 조회                   |
| GET    | `/api/sessions/{sessionId}/next-question`                   | 현재 질문 조회                   |
| POST   | `/api/sessions/{sessionId}/vision-chunks`                   | `vision_v2` chunk 수신           |
| POST   | `/api/sessions/{sessionId}/answers/{answerTurnId}/audio`    | answer audio 수신                |
| POST   | `/api/sessions/{sessionId}/audio-chunks`                    | 호환용 audio chunk 수신          |
| POST   | `/api/sessions/{sessionId}/speech-chunks`                   | 개발용 speech chunk 입력         |
| POST   | `/api/sessions/{sessionId}/answers/{answerTurnId}/finish`   | 현재 답변 종료 및 다음 질문 생성 |
| GET    | `/api/sessions/{sessionId}/answers/{answerTurnId}/status`   | 답변 chunk 수집 상태 조회        |
| GET    | `/api/sessions/{sessionId}/answers/{answerTurnId}/analysis` | 답변 분석 결과 조회              |
| GET    | `/api/sessions/{sessionId}/chunks`                          | 세션 전체 chunk 조회             |
| GET    | `/api/sessions/{sessionId}/report`                          | 최종 리포트 조회                 |
| POST   | `/api/sessions/{sessionId}/finish`                          | 전체 면접 세션 종료              |
| POST   | `/api/rag/search`                                           | RAG 검색 디버깅                  |
| POST   | `/api/rag/reload`                                           | RAG 데이터 다시 로드             |

## Chunk 저장 구조

Vision chunk와 호환용 audio chunk는 다음 key로 저장된다.

```text
session:{sessionId}:answer:{answerTurnId}:chunk:{chunkId}
```

답변 하나에 속한 chunk 목록은 다음 set에 저장된다.

```text
session:{sessionId}:answer:{answerTurnId}:chunks
```

오디오 파일 자체는 Redis에 넣지 않는다. 백엔드는 로컬 temp 폴더에 audio 파일을 저장하고, Redis에는 파일 경로만 저장한다.

```text
%TEMP%/interviewiq_audio/{sessionId}_{answerTurnId}_{chunkId}.webm
%TEMP%/interviewiq_audio/answers/{sessionId}_{answerTurnId}.webm
```

백엔드에 병합 저장되는 chunk 예시:

```json
{
  "sessionId": "s_xxx",
  "answerTurnId": "a_xxx",
  "chunkId": "c_001",
  "t0": 0,
  "t1": 5000,
  "version": "vision_v2",
  "context": {},
  "vision": {},
  "speech": null,
  "audioFeatures": null,
  "realtimeAudioSignals": null,
  "audioPath": "C:\\Users\\...\\Temp\\interviewiq_audio\\s_xxx_a_xxx_c_001.webm",
  "audioMimeType": "audio/webm",
  "audioMetadata": {
    "language": "ko-KR",
    "browserTranscript": "...",
    "browserLatestText": "..."
  },
  "status": {
    "visionReady": true,
    "audioReceived": true,
    "speechReady": false,
    "audioFeatureReady": false,
    "analysisReady": false
  }
}
```

## 현재 STT 정책

답변 종료 시 저장된 answer audio가 있으면 OpenAI STT를 먼저 호출한다.
기본 모델은 `gpt-4o-mini-transcribe`다.

현재는 다음 우선순위로 답변 텍스트를 만든다.

```text
1. answer audio OpenAI STT 성공 결과
2. 개발용 speech chunk가 있으면 speech.text 사용
3. finish 요청의 browserTranscript
4. answer audio metadata의 browserTranscript
```

저장되는 대표 source:

```text
OpenAI STT 성공:
answerTextSource = openai_transcription

OpenAI STT 실패 + browser text 있음:
answerTextSource = browser_speech_recognition

OpenAI STT 실패 + speech chunk 있음:
answerTextSource = speech_chunks
```

## 백엔드 원안과 현재 프론트 chunk 차이

백엔드 원안:

- `vision.level`: `good | warning | danger`
- event 시간 필드: `startMs/endMs`
- `vision.quality` 포함
- `realtimeAudioSignals` 포함 가능
- 백엔드 STT 결과를 answer analysis의 `transcription`과 `answerText`에 저장

현재 프론트 실제 전송:

- `vision.level`: `good | caution | warning | bad`
- event 시간 필드: `t0/t1`
- `vision.quality`는 아직 없음
- `realtimeAudioSignals`는 vision chunk에 아직 붙지 않음
- browser transcript를 audio metadata와 answer finish body에 fallback 용도로 전송

현재 백엔드는 가능한 범위에서 원안과 프론트 실제 구조를 모두 받을 수 있게 열어둔 상태다.

## 프론트엔드 참고사항

- `SpeechRecognition`은 실시간 표시, 디버그, fallback transcript 용도로 유용하다.
- `SpeechRecognition` 결과를 최종 transcript로 보지 않는다.
- Firefox에서는 브라우저 `SpeechRecognition`이 안정적으로 동작하지 않는다.
- Web Audio API는 Firefox에서도 사용할 수 있으므로 침묵 감지에 활용할 수 있다.
- 전신 면접 UX에서는 사용자 답변 전체 자막 표시가 필수는 아니다.
- 답변 종료 fallback으로 키보드 단축키와 침묵 카운트다운을 권장한다.
- `vision.quality`는 프론트에서 계산해 백엔드로 보내는 것이 맞다.

## 남은 작업

- 실제 녹음 파일로 OpenAI STT E2E 테스트
- answer 단위 audio 정밀 feature 분석
- 백엔드 음성 feature 분석
- 프론트 `vision.quality` 추가
- 침묵 기반 답변 종료 UX 추가
- 키보드 단축키 기반 답변 종료 UX 추가
- TTS를 질문 읽어주기에 연결
- 최종 리포트 내용 고도화

## 검증 명령

백엔드 문법 확인:

```bash
python -m compileall app tests
```

프론트 타입 확인:

```bash
cd frontend
npx tsc --noEmit
```

백엔드 더미 흐름 테스트:

```bash
python tests/send_dummy_chunk.py
```

Redis 확인:

```bash
redis-cli GET "session:{sessionId}:answer:{answerTurnId}:chunk:c_001"
redis-cli SMEMBERS "session:{sessionId}:answer:{answerTurnId}:chunks"
```
