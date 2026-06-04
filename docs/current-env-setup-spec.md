# InterviewIQ 현재 세팅 명세서

## 현재 브랜치

- 브랜치: `integration/5-flow-backend-merge`
- 백엔드 환경 파일: `.env`
- 프론트 환경 파일: `frontend/.env.local`
- 공유용 예시 파일:
  - `.env.example`
  - `frontend/.env.example`

## 현재 완료된 세팅

### Redis

현재 설정:

```env
REDIS_URL=redis://localhost:6379
```

사용 목적:

- 면접 런타임 세션 상태 저장
- vision/audio/speech chunk 저장
- 세션별 이력서/채용공고 요약 저장
- 세션별 RAG 문서 캐시 저장

현재 기준:

- Redis는 Docker로 로컬 실행한다.
- 백엔드는 `REDIS_URL`을 읽는다.

### PostgreSQL 기본값

현재 로컬 설정:

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interviewiq
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=interviewiq
DB_TABLE_PREFIX=ii_test_
```

사용 목적:

- Google 로그인 사용자 저장
- course 저장
- course session 저장
- DB report 저장
- R2 asset metadata 저장

현재 기준:

- 로컬 PostgreSQL에 `interviewiq` DB가 있어야 한다.
- DB가 없어도 서버 시작은 경고만 찍고 진행될 수 있다.
- 하지만 로그인, course, asset 등 DB 의존 API는 실패한다.

### 프론트 백엔드 URL

현재 설정:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

사용 목적:

- 프론트 요청을 Next mock API가 아니라 FastAPI 백엔드로 보낸다.

중요:

- 이 값이 비어 있으면 프론트가 내부 mock API로 요청할 수 있다.
- 현재 실제 백엔드 연동 흐름에서는 반드시 설정되어 있어야 한다.

### 프론트 LLM 관련 env

현재 빈 값으로 자리만 잡아둔 설정:

```env
OPENROUTER_API_KEY=
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

현재 동작:

- 키가 비어 있어도 프론트 빌드는 통과한다.
- `/api/openai`, `/api/whisper`는 실제 호출 시 `OPENROUTER_API_KEY`가 없으면 503을 반환한다.

## 현재 구현 완료된 기능 세팅

### PDF 문서 입력

추가된 백엔드 의존성:

```env
pypdf==6.4.1
```

추가된 백엔드 엔드포인트:

```http
POST /api/sessions/documents/pdf
POST /api/sessions/{sessionId}/documents/pdf
POST /api/sessions/{sessionId}/documents
GET  /api/sessions/{sessionId}/documents
```

현재 동작 흐름:

1. 프론트에서 이력서 PDF와 채용공고 PDF를 업로드한다.
2. 백엔드가 `pypdf`로 PDF 텍스트를 추출한다.
3. 프론트가 추출된 텍스트를 `localStorage`에 저장한다.
4. 사용자는 baseline 화면으로 이동한다.
5. baseline 완료 후 interview 세션이 시작된다.
6. 프론트가 저장된 문서 텍스트를 `/api/sessions/{sessionId}/documents`로 보낸다.
7. 백엔드가 세션별 문서 요약과 RAG 문서를 만든다.
8. 첫 질문은 문서 기반 개인화 질문으로 교체될 수 있다.

주의:

- 텍스트 기반 PDF는 처리 가능하다.
- 이미지 스캔 PDF는 OCR이 필요하지만, 현재 OCR은 구현되어 있지 않다.

### 프론트 시작 흐름

현재 라우트 흐름:

```text
/
→ /documents
→ /baseline
→ /interview?autoStart=1
→ /result
```

현재 첫 화면:

- 기본 CTA는 `시작하기` 하나만 있다.
- 기존처럼 `베이스라인 측정`과 `면접 바로가기`가 분리되어 있지 않다.
- baseline을 건너뛰는 흐름은 제거했다.

### Google OAuth callback

추가된 프론트 파일:

```text
frontend/app/auth/callback/page.tsx
```

역할:

- Google OAuth redirect query param을 받는다.
- access token을 `localStorage`에 저장한다.
- 저장 후 `/documents`로 이동한다.

저장되는 키:

```text
interviewiq-access-token
interviewiq-token-type
interviewiq-token-expires-in
```

주의:

- callback 저장 구조는 있다.
- 다만 현재 프론트의 세션/문서 요청은 대부분 Bearer token을 자동 첨부하지 않는다.
- 즉 로그인 UI와 토큰 저장은 준비됐지만, 전체 API 인증 연결은 아직 완성 단계가 아니다.

## 아직 필요한 설정값

### OpenAI

필요한 값:

```env
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

사용 목적:

- 답변 오디오 STT
- 브라우저 transcript보다 안정적인 answer text 확보

없을 때:

- 백엔드는 가능한 경우 browser transcript 또는 speech chunk를 fallback으로 사용한다.

### OpenRouter

필요한 값:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_QUESTION_MODEL=openai/gpt-4o-mini
ENABLE_LLM_QUESTION_GENERATION=true
```

현재 로컬 설정:

```env
ENABLE_LLM_QUESTION_GENERATION=false
```

현재 동작:

- 일반 질문은 백엔드 JSON question set에서 나온다.
- deep dive / follow-up 질문은 LLM 비활성 상태에서는 fallback 질문으로 나온다.
- LLM 질문을 쓰려면 `ENABLE_LLM_QUESTION_GENERATION=true`와 `OPENROUTER_API_KEY`가 필요하다.

### Google OAuth

필요한 값:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
AUTH_SECRET=
AUTH_TOKEN_TTL_SECONDS=604800
```

Google Console에 등록해야 하는 redirect URI:

```text
http://localhost:8000/api/auth/google/callback
```

없을 때:

- 로그인 버튼은 보인다.
- 하지만 OAuth 시작 단계에서 Google client 설정 누락으로 실패한다.

### Cloudflare R2

필요한 값:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PRESIGN_EXPIRES_SECONDS=600
```

사용 목적:

- session video 업로드
- answer audio 업로드
- full audio 업로드

현재 asset type:

```text
session_video
answer_audio
full_audio
```

주의:

- PDF 입력은 현재 R2를 사용하지 않는다.
- PDF는 백엔드로 직접 업로드해서 텍스트를 추출한다.

## 로컬 실행에 필요한 서비스

### Redis

새로 실행:

```powershell
docker run -d --name interviewiq-redis -p 6379:6379 redis
```

이미 만든 컨테이너 실행:

```powershell
docker start interviewiq-redis
```

### PostgreSQL

현재 env 기준:

```text
host: localhost
port: 5432
user: postgres
password: password
database: interviewiq
```

Docker 실행 예시:

```powershell
docker run -d --name interviewiq-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=interviewiq postgres:16
```

## 검증 명령

백엔드 테스트:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

백엔드 문법 확인:

```powershell
.\.venv\Scripts\python.exe -m py_compile app\api\sessions.py app\schemas\session.py
```

프론트 빌드:

```powershell
cd frontend
npm.cmd run build
```

백엔드 실행:

```powershell
uvicorn app.main:app --reload
```

프론트 실행:

```powershell
cd frontend
npm.cmd run dev
```

백엔드 health check:

```text
http://localhost:8000/health
```

프론트 접속:

```text
http://localhost:3000
```

## 현재 리스크 / 남은 작업

- `.env`, `frontend/.env.local`은 gitignore 대상이라 로컬에만 반영된다.
- PostgreSQL env는 맞췄지만 실제 DB 컨테이너 또는 로컬 DB가 떠 있어야 한다.
- Google OAuth env가 비어 있어 실제 로그인은 아직 동작하지 않는다.
- 로그인 토큰 저장은 되어 있지만, 모든 프론트 API 요청에 Bearer token을 붙이는 구조는 아직 완성되지 않았다.
- R2 env가 비어 있어 asset upload/read URL 기능은 아직 동작하지 않는다.
- PDF 파싱은 텍스트 기반 PDF만 가능하다. 이미지 스캔 PDF OCR은 미구현이다.
- LLM 질문 생성은 현재 꺼져 있다. deep dive/follow-up 품질을 보려면 OpenRouter key와 `ENABLE_LLM_QUESTION_GENERATION=true`가 필요하다.
