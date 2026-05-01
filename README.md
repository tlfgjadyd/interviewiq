# InterviewIQ — Backend

---

## 실행 환경

- Python 3.11+
- Redis
- PostgreSQL (선택 — 없으면 경고 출력 후 계속 실행됨)
  - 아직 postgreSQL 영구저장은 구현 안함

---

## 1. 클론

```bash
git clone https://github.com/tlfgjadyd/interviewiq.git
cd interviewiq/backend
```

---

## 2. 가상환경 생성 및 패키지 설치

```bash
python -m venv .venv
```

**Windows**
```bash
.venv\Scripts\activate
```

**Mac / Linux**
```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
pip install requests   # 테스트 스크립트용
```

---

## 3. 환경변수 설정

.env파일 만들어서 아래처럼 생성

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/ExampleDB
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
```

> PostgreSQL이 없으면 `DATABASE_URL`은 아무 값이나 넣어도 상관 없음  
> 서버 실행 시 경고만 출력되고 Redis 기반 기능은 정상 동작

---

## 4. Redis 실행

**Windows (Docker)**
```bash
docker run -d -p 6379:6379 redis
```

**Mac**
```bash
brew install redis
brew services start redis
```

**Linux**
```bash
sudo apt install redis-server
sudo systemctl start redis
```

---

## 5. 서버 실행

```bash
uvicorn app.main:app --reload
```

브라우저에서 확인:
- API 문서: http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

---

## 6. 더미 데이터로 Redis 저장 테스트

서버가 실행 중인 상태에서 다른 터미널을 열고:

```bash
python tests/send_dummy_chunk.py
```

아래 순서로 동작합니다.

1. 세션 생성 → `sessionId`, `answerTurnId` 발급
2. 5초 단위 vision chunk 3개 전송 (0~5s, 5~10s, 10~15s)
3. audio chunk 3개 전송 (더미 바이트)
4. 답변 종료 신호 전송
5. Redis에 저장된 chunk 목록 출력

정상 결과 예시:
```
총 3개 chunk 저장됨

  chunkId=c_001  t0=0~t1=5000ms
  visionReady=True  audioReceived=True  speechReady=False
  postureStability=0.78  headForwardRatio=0.74  handMovementIntensity=0.42
```

Redis에서 직접 확인하려면:
```bash
redis-cli GET "session:{sessionId}:chunk:c_001"
redis-cli SMEMBERS "session:{sessionId}:answer:{answerTurnId}:chunks"
```

---

## API 목록

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/sessions` | 세션 생성, 첫 질문 반환 |
| POST | `/api/sessions/{id}/vision-chunks` | vision chunk 수신 |
| POST | `/api/sessions/{id}/audio-chunks` | audio chunk 수신 |
| POST | `/api/sessions/{id}/answers/{turn}/finish` | 답변 종료 |
| GET  | `/api/sessions/{id}/answers/{turn}/status` | chunk 수집 상태 확인 |
| GET  | `/api/sessions/{id}/next-question` | 다음 질문 조회 |
| GET  | `/api/sessions/{id}/chunks` | 세션 내 전체 chunk 조회 |
| POST | `/api/sessions/{id}/finish` | 면접 종료 |
