# 팀 공유용 세팅 확인 요청

아래 항목들 현재 누가 가지고 있는지 / 어떤 값으로 맞출지 확인 부탁드립니다.

## 1. PostgreSQL 로컬/공용 DB

현재 로컬 기준 env는 아래처럼 맞춰둔 상태입니다.

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interviewiq
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=interviewiq
DB_TABLE_PREFIX=ii_test_
```

확인 필요:

- 각자 로컬 Docker PostgreSQL로 갈지, 공용 DB로 갈지
- 공용 DB를 쓴다면 `DATABASE_URL` 공유 필요
- `DB_TABLE_PREFIX=ii_test_` 유지할지 확정 필요

## 2. Google OAuth 로그인

현재 백/프론트 callback 구조는 붙어 있습니다.

필요 env:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
AUTH_SECRET=
AUTH_TOKEN_TTL_SECONDS=604800
```

Google Console에 등록할 redirect URI:

```text
http://localhost:8000/api/auth/google/callback
```

확인 필요:

- Google OAuth client를 누가 생성/관리할지
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 공유 방식
- 개발용 callback URL을 localhost 기준으로 둘지
- 배포 URL이 있으면 배포 callback도 추가할지

## 3. OpenAI STT

답변 오디오 STT용입니다.

필요 env:

```env
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
```

확인 필요:

- OpenAI API key를 누가 제공할지
- STT 비용을 감안해서 실제 테스트 범위를 어디까지 할지
- key 없을 때는 browser transcript / speech chunk fallback으로 진행

## 4. OpenRouter LLM 질문 생성

현재 일반 질문은 백엔드 JSON question set에서 나오고, deep dive / follow-up만 LLM 사용 대상으로 잡혀 있습니다.

필요 env:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_QUESTION_MODEL=openai/gpt-4o-mini
ENABLE_LLM_QUESTION_GENERATION=true
```

현재 로컬 기본값:

```env
ENABLE_LLM_QUESTION_GENERATION=false
```

확인 필요:

- LLM 질문 생성을 실제로 켤지
- 켠다면 OpenRouter key 제공자
- 비용 때문에 deep dive / follow-up만 호출하는 현재 정책 유지할지

## 5. Cloudflare R2

영상/오디오 asset 업로드용입니다. PDF 문서 입력은 R2를 쓰지 않고 백으로 직접 업로드합니다.

필요 env:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PRESIGN_EXPIRES_SECONDS=600
```

현재 asset type:

```text
session_video
answer_audio
full_audio
```

확인 필요:

- R2 계정/버킷을 누가 관리할지
- 개발용 bucket과 배포용 bucket을 나눌지
- access key 공유 방식

## 6. PDF 입력 관련

현재 구현:

```http
POST /api/sessions/documents/pdf
POST /api/sessions/{sessionId}/documents/pdf
POST /api/sessions/{sessionId}/documents
```

현재 가능:

- 텍스트 기반 PDF에서 이력서/채용공고 텍스트 추출
- 추출 텍스트를 면접 세션 문서 재료로 저장

현재 불가:

- 이미지 스캔 PDF OCR

확인 필요:

- OCR까지 이번 범위에 넣을지
- 아니면 텍스트 기반 PDF만 지원한다고 제한할지

## 7. 현재 실행 기준

로컬 서비스:

```powershell
docker start interviewiq-redis
docker run -d --name interviewiq-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=interviewiq postgres:16
```

백엔드:

```powershell
uvicorn app.main:app --reload
```

프론트:

```powershell
cd frontend
npm.cmd run dev
```

접속:

```text
백엔드: http://localhost:8000/health
프론트: http://localhost:3000
```

## 단톡에 바로 보낼 요약

현재 Redis/PDF 입력/프론트 시작 흐름은 붙어 있고, 남은 건 외부 키/DB 세팅 확인입니다.

확인 필요한 것:

1. PostgreSQL은 각자 로컬 Docker로 갈지, 공용 DB 쓸지
2. Google OAuth client 누가 만들고 `GOOGLE_CLIENT_ID/SECRET` 공유할지
3. OpenAI key 누가 제공할지. STT 테스트 범위 어디까지 할지
4. OpenRouter key 제공 여부. LLM 질문 생성 켤지
5. Cloudflare R2 bucket/key 누가 관리할지
6. PDF는 텍스트 기반만 지원할지, 스캔 PDF OCR도 넣을지

현재 기본 URL:

```text
백엔드 http://localhost:8000
프론트 http://localhost:3000
Google callback http://localhost:8000/api/auth/google/callback
```
