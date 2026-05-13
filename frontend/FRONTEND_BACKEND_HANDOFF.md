# Frontend to Backend Handoff

이 문서는 프론트엔드가 기대하는 백엔드 API 계약과 음성 처리 흐름을 정리한 것입니다.

## 목표

면접 세션 중 프론트는 사용자의 마이크 음성을 5초 단위로 잘라 백엔드에 저장합니다. 답변이 끝났을 때만 해당 답변의 audio chunks를 묶어 STT와 음성 지표 분석을 수행하고, 그 결과를 바탕으로 다음 질문 또는 최종 보고서를 생성합니다.

## 환경변수

```env
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-...
OPENAI_API_KEY=sk-proj-...
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

- `OPENROUTER_API_KEY`: 꼬리질문 생성, 답변 텍스트 평가, 최종 보고서 생성용 LLM 호출에 사용합니다.
- `OPENAI_API_KEY`: OpenAI Platform STT 호출에 사용합니다.
- `OPENAI_STT_MODEL`: 기본값은 `gpt-4o-mini-transcribe`입니다.

## 전체 흐름

1. 프론트가 `POST /api/sessions`로 세션을 생성합니다.
2. 사용자가 오디오 스트림을 시작하면 MediaRecorder가 5초마다 audio blob을 생성합니다.
3. 프론트가 각 audio blob을 `POST /api/sessions/{sessionId}/audio-chunks`로 보냅니다.
4. 사용자가 `답변 종료` 버튼을 누르거나 Chrome 계열 브라우저에서 종료 음성명령을 말하면 프론트가 마지막 chunk를 flush합니다.
5. 프론트가 `POST /api/sessions/{sessionId}/answers/{answerTurnId}/finish`를 호출합니다.
6. 백엔드는 해당 `answerTurnId`의 audio chunks를 순서대로 모읍니다.
7. 백엔드는 chunks를 하나의 답변 오디오로 병합하거나 순서대로 STT 처리합니다.
8. 백엔드는 STT 텍스트, 음성 지표, 기존 대화 맥락을 바탕으로 다음 질문을 생성합니다.
9. 백엔드는 다음 `answerTurnId`와 `nextQuestion`을 프론트에 반환합니다.

## API 계약

### Create Session

`POST /api/sessions`

Request:

```json
{
  "company": "sk_hynix",
  "role": "backend",
  "interviewType": "project_experience",
  "chunkMs": 5000,
  "cluster": "large_manufacturing",
  "industry": "semiconductor"
}
```

Response:

```json
{
  "sessionId": "session_xxxxxxxx",
  "answerTurnId": "answer_xxxxxxxx",
  "firstQuestion": "첫 질문 텍스트"
}
```

### Upload Audio Chunk

`POST /api/sessions/{sessionId}/audio-chunks`

Content-Type: `multipart/form-data`

Fields:

- `audio`: audio file blob. 현재 프론트는 `audio/webm`을 우선 사용합니다.
- `metadata`: JSON string.

`metadata` 예시:

```json
{
  "chunkId": "chunk_000001",
  "answerTurnId": "answer_xxxxxxxx",
  "t0": 0,
  "t1": 5000,
  "mimeType": "audio/webm"
}
```

Backend requirements:

- `sessionId`, `answerTurnId`, `chunkId` 기준으로 저장합니다.
- `t0`, `t1` 기준으로 정렬 가능해야 합니다.
- 이 endpoint에서는 OpenAI STT를 호출하지 않습니다. 저장만 합니다.
- Redis, object storage, local temp storage 중 어떤 방식이든 가능하지만, `finish` 시점에 answer 단위로 다시 읽을 수 있어야 합니다.

Response:

```json
{
  "ok": true
}
```

### Finish Answer

`POST /api/sessions/{sessionId}/answers/{answerTurnId}/finish`

Request:

```json
{
  "endedBy": "button",
  "endedAt": 73542,
  "endPhrase": null
}
```

`endedBy` values:

```txt
button | voice_command | silence | keyboard | manual
```

음성명령 종료 예시:

```json
{
  "endedBy": "voice_command",
  "endedAt": 73542,
  "endPhrase": "이상입니다"
}
```

Backend behavior:

1. 해당 `answerTurnId`의 audio chunks를 불러옵니다.
2. `t0` 기준으로 정렬합니다.
3. 가능하면 하나의 오디오 파일로 병합합니다.
4. `OPENAI_STT_MODEL=gpt-4o-mini-transcribe`로 STT를 수행합니다.
5. 백엔드에서 음성 지표를 계산합니다.
6. STT 결과와 음성 지표를 사용해 다음 질문을 생성합니다.
7. 다음 답변을 위한 새 `answerTurnId`를 발급합니다.

Response:

```json
{
  "answerTurnId": "answer_xxxxxxxx",
  "status": "analysis_ready",
  "nextQuestionPending": true,
  "nextAnswerTurnId": "answer_yyyyyyyy",
  "nextQuestion": "꼬리질문 텍스트"
}
```

## STT 처리 권장 방식

기본 모델:

```txt
gpt-4o-mini-transcribe
```

이유:

- 5초 chunk 기반 저장 구조와 잘 맞습니다.
- 답변 종료 후 answer 단위로 묶어 처리하면 비용이 낮습니다.
- 15분 면접 기준 STT 비용이 작아 개발/테스트에 부담이 적습니다.

권장 처리:

```txt
answerTurnId audio chunks
-> t0 기준 정렬
-> webm 병합 또는 순차 STT
-> transcript 생성
-> speech metrics 계산
-> next question 생성
```

주의:

- 5초 chunk마다 STT를 호출하지 마세요. 최종 리포트/꼬리질문 목적이면 answer 종료 시점에만 호출하는 것이 좋습니다.
- 파일 크기가 너무 크면 3~5분 단위로 묶어 여러 번 STT를 호출하고 transcript를 합치면 됩니다.

## 음성 분석 지표

STT 모델은 기본적으로 speech-to-text 모델입니다. 긴장도나 떨림을 직접 단정하는 모델로 사용하지 말고, 백엔드에서 관찰 가능한 오디오 지표를 계산한 뒤 LLM에 전달하는 방식을 권장합니다.

권장 지표:

- `durationSec`
- `speechRateWpm`
- `pauseRatio`
- `longPauseCount`
- `averagePauseSec`
- `volumeMean`
- `volumeVariance`
- `pitchMean`
- `pitchVariance`
- `jitter`
- `shimmer`
- `fillerCount`

LLM에 전달할 때는 다음 원칙을 지켜주세요.

- "지원자가 긴장했다"처럼 심리 상태를 단정하지 않습니다.
- "말 속도 변화가 큼", "긴 침묵이 잦음", "볼륨 변동이 큼"처럼 관찰 가능한 신호로 표현합니다.
- 면접 피드백 문장에서는 개선 가능한 행동으로 연결합니다.

## 프론트 종료 방식

프론트는 두 가지 종료 방식을 지원합니다.

1. 버튼 종료
   - 모든 브라우저에서 사용 가능한 기본 경로입니다.
   - 사용자가 `답변 종료` 버튼을 누르면 마지막 MediaRecorder chunk를 flush한 뒤 `finish` API를 호출합니다.

2. 음성명령 종료
   - Chrome/Edge 계열에서만 안정적입니다.
   - 브라우저 SpeechRecognition을 종료 키워드 감지용으로만 사용합니다.
   - 실제 STT는 백엔드에서 OpenAI STT로 수행해야 합니다.

현재 프론트 종료 키워드:

```txt
ko-KR: 답변 끝, 답변 마치겠습니다, 이상입니다, 여기까지입니다
en-US: end answer, answer complete, that's my answer, i am done
```

## 저장 데이터 제안

Answer turn 단위로 다음 구조를 저장하면 프론트/리포트 연동이 쉽습니다.

```json
{
  "sessionId": "session_xxxxxxxx",
  "answerTurnId": "answer_xxxxxxxx",
  "question": "질문 텍스트",
  "transcript": "사용자 답변 STT 텍스트",
  "audioChunks": [
    {
      "chunkId": "chunk_000001",
      "t0": 0,
      "t1": 5000,
      "mimeType": "audio/webm",
      "storagePath": "..."
    }
  ],
  "speechMetrics": {
    "durationSec": 83.2,
    "speechRateWpm": 132,
    "longPauseCount": 3,
    "volumeVariance": 0.0021
  },
  "endedBy": "button",
  "endPhrase": null,
  "finishedAt": "2026-05-12T00:00:00.000Z"
}
```

## 프론트 연동 체크리스트

- `POST /api/sessions`가 `sessionId`, `answerTurnId`, `firstQuestion`을 반환해야 합니다.
- `POST /audio-chunks`는 STT를 하지 말고 빠르게 저장 응답을 반환해야 합니다.
- `POST /answers/{answerTurnId}/finish`에서만 STT와 꼬리질문 생성을 수행해야 합니다.
- `finish` 응답에는 반드시 `nextAnswerTurnId`, `nextQuestion`이 포함되어야 합니다.
- 프론트는 `nextAnswerTurnId`를 받은 뒤 다음 답변의 audio chunks를 그 turn에 매핑합니다.
