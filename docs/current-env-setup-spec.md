# InterviewIQ Current Setup Spec

## Current Branch

- Branch: `integration/5-flow-backend-merge`
- Latest setup commit: `aa413a7 Align frontend env handling`
- Backend env file: `.env`
- Frontend env file: `frontend/.env.local`
- Shared examples:
  - `.env.example`
  - `frontend/.env.example`

## Completed Local Settings

### Redis

Configured:

```env
REDIS_URL=redis://localhost:6379
```

Purpose:

- Runtime session state
- Vision/audio/speech chunks
- Session document summaries
- RAG document cache for session-specific resume/job posting text

Current expectation:

- Redis runs locally through Docker.
- Backend reads `REDIS_URL`.

### PostgreSQL Defaults

Configured locally:

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interviewiq
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=interviewiq
DB_TABLE_PREFIX=ii_test_
```

Purpose:

- Google login users
- Courses
- Course sessions
- DB reports
- R2 asset metadata

Current expectation:

- PostgreSQL must be running locally with database `interviewiq`.
- If DB is unavailable, app startup logs a warning, but DB-dependent APIs fail.

### Frontend Backend URL

Configured locally:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Purpose:

- Forces frontend to call FastAPI backend instead of internal mock API.

Important:

- If this is empty, frontend falls back to mock routes.
- Current intended flow requires this value.

### Frontend LLM Env Shape

Configured as empty placeholders:

```env
OPENROUTER_API_KEY=
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

Current behavior:

- Frontend build now passes even when these keys are empty.
- `/api/openai` and `/api/whisper` return `503` at request time if `OPENROUTER_API_KEY` is missing.

## Completed Code Setup

### PDF Document Intake

Added dependency:

```env
pypdf==6.4.1
```

Backend endpoints:

```http
POST /api/sessions/documents/pdf
POST /api/sessions/{sessionId}/documents/pdf
POST /api/sessions/{sessionId}/documents
GET  /api/sessions/{sessionId}/documents
```

Current flow:

1. Frontend uploads resume PDF and job posting PDF.
2. Backend extracts text with `pypdf`.
3. Frontend stores extracted text in `localStorage`.
4. Baseline runs.
5. Interview session starts.
6. Frontend sends stored text to `/api/sessions/{sessionId}/documents`.
7. Backend creates session-specific document summary and RAG documents.

### Frontend Flow

Current route flow:

```text
/ 
→ /documents
→ /baseline
→ /interview?autoStart=1
→ /result
```

Current first screen:

- One primary button: `시작하기`
- No direct interview-start button
- No baseline-skip branch

### Auth Callback

Added:

```text
frontend/app/auth/callback/page.tsx
```

Purpose:

- Receives Google OAuth redirect query params.
- Saves access token to localStorage.
- Redirects to `/documents`.

Stored keys:

```text
interviewiq-access-token
interviewiq-token-type
interviewiq-token-expires-in
```

Note:

- Token storage exists.
- Most current frontend session/document calls do not yet attach Bearer token by default.

## Required Values Still Missing

### OpenAI

Needed if using backend STT:

```env
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

Used for:

- Answer audio transcription
- More reliable answer text than browser transcript fallback

Without it:

- Backend falls back to browser transcript / speech chunks when available.

### OpenRouter

Needed if enabling LLM question generation:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_QUESTION_MODEL=openai/gpt-4o-mini
ENABLE_LLM_QUESTION_GENERATION=true
```

Current local setting:

```env
ENABLE_LLM_QUESTION_GENERATION=false
```

Behavior:

- Normal questions come from backend JSON question set.
- Deep-dive/follow-up questions use fallback unless LLM is enabled.

### Google OAuth

Needed for real login:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
AUTH_SECRET=
AUTH_TOKEN_TTL_SECONDS=604800
```

Google console redirect URI must include:

```text
http://localhost:8000/api/auth/google/callback
```

Without it:

- Login button exists.
- OAuth start fails with missing Google client config.

### Cloudflare R2

Needed for real asset upload/read URLs:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PRESIGN_EXPIRES_SECONDS=600
```

Used for:

- Session video
- Answer audio
- Full audio

Current asset types:

```text
session_video
answer_audio
full_audio
```

PDF intake does not currently use R2.

## Local Services Needed

### Redis

```powershell
docker run -d --name interviewiq-redis -p 6379:6379 redis
```

If already created:

```powershell
docker start interviewiq-redis
```

### PostgreSQL

Expected:

```text
host: localhost
port: 5432
user: postgres
password: password
database: interviewiq
```

Suggested Docker command:

```powershell
docker run -d --name interviewiq-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=interviewiq postgres:16
```

## Verification Commands

Backend tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Backend syntax:

```powershell
.\.venv\Scripts\python.exe -m py_compile app\api\sessions.py app\schemas\session.py
```

Frontend build:

```powershell
cd frontend
npm.cmd run build
```

Backend run:

```powershell
uvicorn app.main:app --reload
```

Frontend run:

```powershell
cd frontend
npm.cmd run dev
```

Health check:

```text
http://localhost:8000/health
```

Frontend:

```text
http://localhost:3000
```

## Current Risk Notes

- `.env` and `frontend/.env.local` are local-only and ignored by git.
- DB defaults are set, but PostgreSQL must actually be running.
- Login token is stored after callback, but current session flow is still mostly unauthenticated.
- PDF parsing works for text-based PDFs; scanned image-only PDFs need OCR, which is not implemented.
- LLM follow-up/deep-dive quality depends on OpenRouter key and `ENABLE_LLM_QUESTION_GENERATION=true`.
