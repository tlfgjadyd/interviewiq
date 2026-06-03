# dev-thdwldnjs 브랜치 공유 정리

## 1. 문서 목적

이 문서는 현재 `dev-thdwldnjs` 브랜치가 기존 브랜치와 무엇이 다른지,
그리고 프론트가 어떤 기획 의도와 흐름으로 바뀌었는지 공유하기 위한 문서다.

기준 브랜치:

```text
origin/dev-thdwldnjs
```

현재 브랜치:

```text
dev-thdwldnjs
```

큰 방향:

```text
기존 mock 중심 면접 화면
-> 5-flow 기반 면접 세션
-> 세션 리포트 기반 드릴 추천
-> 드릴 반복도 별도 attempt가 아니라 새 drill session으로 기록
```

## 2. 현재 브랜치의 핵심 변경 요약

최근 주요 커밋:

```text
c4540c7 Trace interview transcript and vision transport
f7d7fc3 Log report material inputs
70ee839 Log session question sources
2381b85 Vary fallback followup questions by progress
482fabc Integrate five-flow backend course sessions
85f2370 Model drill repeats as drill sessions
35e177e Use drill session reports instead of drill attempts
e029e56 Align frontend with five-flow interview runtime
```

변경 파일 규모:

```text
44 files changed
약 7,100 lines 추가
```

핵심 변화:

```text
1. 기본 면접 흐름을 4phase/mock 구조에서 5-flow 구조로 이동
2. 질문마다 questionId, topic, analysisFocus 메타데이터를 붙임
3. 프론트 면접/드릴 화면을 공통 런타임으로 묶음
4. DrillAttempt 제거 방향으로 정리
5. 드릴 반복은 sessionType="drill" 세션과 drill_report로 기록
6. 레포트가 fallback처럼 보이는 이유를 추적할 수 있도록 로그 추가
7. 브라우저 transcript와 vision chunk 전송 여부를 확인할 수 있게 로그 추가
```

## 3. 프론트 기획 의도

프론트의 가장 큰 의도는 면접과 드릴을 별도 기능처럼 만들지 않고,
하나의 세션 런타임 위에서 다른 화면만 얹는 구조로 바꾸는 것이다.

공통 런타임:

```text
frontend/components/runtime/InterviewRuntimeProvider.tsx
```

이 런타임이 제공하는 값:

```text
session
isSessionActive
currentQuestion
currentQuestionMeta
answerState
metrics
drillResults
currentRunNo
startSession()
startAnswer()
endAnswer()
finishSession()
```

의도:

```text
/interview 화면과 /training/drill 화면은 UI는 다르지만,
세션 시작, 답변 시작, 답변 종료, 리포트 조회 흐름은 같은 구조를 사용한다.
```

이렇게 하면 백엔드 API가 mock에서 course session API로 바뀌어도
화면별로 중복 수정하지 않고 런타임만 조정할 수 있다.

## 4. 사용자 흐름

목표 사용자 흐름:

```text
시작
-> 사용자/면접 설정
-> baseline
-> full interview
-> result report
-> 약점 기반 drill plan
-> drill session
-> miniCheck
-> 같은 목표 재시도 또는 다음 목표 drill session 시작
```

현재 `/interview` 흐름:

```text
/interview?autoStart=1
-> startSession()
-> 백엔드 세션 생성
-> currentQuestion 표시
-> 답변 시작 클릭
-> 카메라 MediaPipe 분석 시작
-> 브라우저 음성 transcript 수집 시작
-> 답변 종료 클릭
-> browserTranscript와 함께 finish answer 호출
-> 백엔드가 다음 질문 또는 최종 report 생성
-> 세션 종료 시 /result?sessionId=... 이동
```

## 5. 5-flow 질문 구조

현재 기본 full interview는 13문항이다.

```text
questionSetId = full_13
totalQuestions = 13
```

5-flow:

```text
ice_breaking
basic_personality
job_competency
deep_dive
closing
```

개발/데모용 5문항 세트도 있다.

```text
questionSetId = demo_5
totalQuestions = 5
```

질문 메타데이터:

```text
questionId
topic
analysisFocus
```

백엔드 시작 응답에 추가된 값:

```text
currentQuestionMeta
```

답변 종료 응답에 추가된 값:

```text
nextQuestionMeta
```

세션 리포트의 `questions[]`에도 추가된 값:

```text
questionId
topic
analysisFocus
```

관련 파일:

```text
frontend/data/question-sets/full_13.json
frontend/data/question-sets/demo_5.json
frontend/lib/question-types.ts
frontend/lib/question-loader.ts
app/schemas/session.py
app/api/sessions.py
```

## 6. 드릴 구조 변경

기존 의도:

```text
DrillAttempt = 드릴 반복 시도 기록/비교용 모델
```

현재 브랜치의 대체 구조:

```text
각 드릴 수행 1회 = sessionType="drill" 세션 1개
각 수행 결과 = drill_report
반복/비교 = 여러 drill session report 비교
```

삭제/제거 방향:

```text
DrillAttempt
/drill-attempts
saveDrillAttempt
```

유지하는 프론트 상태:

```text
ready
countdown
answering
miniCheck
```

중요한 흐름:

```text
miniCheck 이후 같은 목표를 다시 하든 다음 목표로 넘어가든,
다음 수행은 새 drill session을 start한다.
```

관련 파일:

```text
frontend/components/training/DrillPlayer.tsx
frontend/app/training/drill/page.tsx
frontend/app/training/drill/[drillIndex]/page.tsx
frontend/lib/session-api.ts
frontend/lib/training.ts
```

## 7. 프론트-백엔드 런타임 데이터 흐름

### 세션 시작

```text
InterviewRuntimeProvider.startSession()
-> InterviewSessionContext.startSession()
-> POST /api/sessions
```

백엔드 응답:

```text
sessionId
answerTurnId
firstQuestion
currentQuestionMeta
questionIndex
phase
phaseGoal
```

### 답변 시작

```text
startAnswer()
-> isAnswerRecording = true
-> MediaPipe enabled
-> browser SpeechRecognition enabled
```

### 답변 중

프론트 MediaPipe:

```text
camera frame
-> posture/gaze/gesture 분석
-> chunkMs 단위로 aggregate
-> POST /api/sessions/{sessionId}/vision-chunks
```

브라우저 음성 인식:

```text
SpeechRecognition
-> latestTranscriptRef
```

### 답변 종료

```text
endAnswer()
-> finishAnswer("button", null, { browserTranscript, language: "ko-KR" })
-> POST /api/sessions/{sessionId}/answers/{answerTurnId}/finish
```

백엔드 처리:

```text
answerTurnId 기준 chunk 로드
answerText 결정
  1. 서버 transcription
  2. speech chunks
  3. browserTranscript
  4. answer audio metadata transcript
분석 저장
다음 질문 또는 최종 report 반환
```

## 8. 레포트 fallback 추적 구조

기존 문제:

```text
레포트가 fallback처럼 보이는데,
답변 텍스트가 없어서인지,
vision chunk가 없어서인지,
audio signal이 없어서인지 바로 알기 어려웠다.
```

현재 추가된 백엔드 로그:

```text
report.materials
```

확인 가능한 값:

```text
analysesCount
answeredTurns
nonEmptyAnswerTexts
answerTextSources
transcriptions
nonEmptyTranscriptions
chunkCount
visionChunkCount
audioSignalChunkCount
sampleQuestions
fallbackReasons
```

리포트 응답에도 추가:

```text
debugMaterials
```

확인 명령:

```powershell
Get-Content logs/backend.err.log -Tail 100
```

## 9. 전송/수집 디버그 로그

프론트 transcript 로그:

```text
[interview-transcript-started]
[interview-transcript-error]
[interview-transcript-unavailable]
[interview-finish-answer]
```

`[interview-finish-answer]`에서 확인할 값:

```text
sessionId
answerTurnId
browserTranscriptLength
```

프론트 vision 전송 로그:

```text
[vision-chunk-sent]
[vision-chunk-send-failed]
[vision-chunk-send-error]
[vision-chunk-skip]
```

백엔드 vision 저장 로그:

```text
session.vision_chunk
```

정상 수집 기대값:

```text
browserTranscriptLength > 0
report.materials.nonEmptyAnswerTexts > 0
report.materials.visionChunkCount > 0
answerTextSources includes browser_speech_recognition
```

## 10. 백엔드 연결 상태

현재 로컬 `.env` 기준:

```text
REDIS_URL=redis://localhost:6379
DATABASE_URL=
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
OPENAI_API_KEY=
ENABLE_LLM_QUESTION_GENERATION=false
```

현재 가능한 것:

```text
Redis 기반 세션 진행
Redis 기반 answer analysis 저장
Redis 기반 vision chunk 저장
Redis 기반 임시 report 생성/조회
```

아직 로컬에서 비활성인 것:

```text
DB 영속 저장
course/report history 비교
Cloudflare R2 asset upload
OpenAI STT
LLM 질문 생성
LLM 기반 고급 리포트 생성
```

따라서 지금 로컬 테스트의 우선순위는 DB/R2보다 먼저:

```text
1. browserTranscript가 finish answer로 넘어가는지
2. vision chunk가 백에 저장되는지
3. report.materials에 원재료가 잡히는지
```

## 11. 주요 파일 목록

프론트 런타임:

```text
frontend/components/runtime/InterviewRuntimeProvider.tsx
frontend/context/InterviewSessionContext.tsx
frontend/app/interview/page.tsx
```

카메라/비전:

```text
frontend/components/Camera/Camera.tsx
frontend/hooks/useMediaPipe.ts
```

드릴:

```text
frontend/components/training/DrillPlayer.tsx
frontend/app/training/drill/page.tsx
frontend/app/training/drill/[drillIndex]/page.tsx
frontend/lib/session-api.ts
frontend/lib/training.ts
```

질문 세트:

```text
frontend/data/question-sets/full_13.json
frontend/data/question-sets/demo_5.json
frontend/lib/question-types.ts
frontend/lib/question-loader.ts
```

백엔드 세션/리포트:

```text
app/api/sessions.py
app/schemas/session.py
```

백엔드 course/session 방향:

```text
app/api/courses.py
app/db/models.py
app/schemas/course.py
```

asset/R2 방향:

```text
app/api/assets.py
app/core/r2.py
app/schemas/asset.py
```

## 12. 로컬 테스트 방법

필요 서비스:

```text
Redis container: interviewiq-redis
Backend: http://127.0.0.1:8000
Frontend: http://127.0.0.1:3000
```

테스트 URL:

```text
http://127.0.0.1:3000/interview?autoStart=1
```

브라우저 콘솔에서 볼 것:

```text
[interview-transcript-started]
[interview-finish-answer]
[vision-chunk-sent]
```

백엔드 로그에서 볼 것:

```powershell
Get-Content logs/backend.err.log -Tail 100
```

확인할 로그:

```text
session.vision_chunk
report.materials
```

## 13. 다음 작업 제안

추천 순서:

```text
1. full interview 1회 실행해서 browserTranscriptLength와 visionChunkCount 확인
2. report.materials 기준으로 실제 원재료 수집 여부 확인
3. 프론트 result 화면에서 fallbackReport catch를 잠시 꺼서 API 실패를 숨기지 않게 테스트
4. course/report history 비교가 필요해지는 시점에 Postgres 연결
5. audio/document upload 테스트가 필요해지는 시점에 Cloudflare R2 연결
6. 런타임 원재료 수집이 안정된 뒤 LLM/STT 활성화
7. 남은 fallback 문구를 material-aware empty state로 정리
```

