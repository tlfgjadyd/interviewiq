"""
더미 vision chunk를 서버에 보내고 Redis 저장 결과를 확인하는 스크립트.

실행 전 준비:
  1. Redis 실행 중인지 확인
  2. .env 파일에 REDIS_URL 설정 (예: REDIS_URL=redis://localhost:6379)
  3. FastAPI 서버 실행: uvicorn app.main:app --reload
  4. pip install requests (없으면)

실행:
  python tests/send_dummy_chunk.py
"""

import io
import json
import sys

try:
    import requests
except ImportError:
    print("requests 패키지가 없습니다. pip install requests 실행 후 다시 시도하세요.")
    sys.exit(1)

BASE_URL = "http://localhost:8000"


# title print
def step(title: str) -> None:
    print(f"\n{'='*55}")
    print(f"  {title}")
    print(f"{'='*55}")


# json 보기 편하게
def pretty(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


# 서버 체크
def check_server() -> bool:
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=3)
        return r.status_code == 200
    except requests.exceptions.ConnectionError:
        return False


# ── 0. 서버 연결 확인 ─────────────────────────────────────
step("0. 서버 연결 확인")
if not check_server():
    print(f"서버에 연결할 수 없습니다: {BASE_URL}")
    print("uvicorn app.main:app --reload 로 서버를 먼저 실행하세요.")
    sys.exit(1)
print(f"서버 정상 응답: {BASE_URL}")


# ── 1. 세션 생성 ───────────────────────────────────────────

# 처음 회사, 역할 선택
step("1. 세션 생성  POST /api/sessions")
session_payload = {
    "company": "sk_hynix",
    "role": "backend",
    "interviewType": "project_experience",
    "chunkMs": 5000,
    "cluster": "large_manufacturing",
    "industry": "semiconductor",
}
r = requests.post(f"{BASE_URL}/api/sessions", json=session_payload)
r.raise_for_status()
session_data = r.json()

#---
pretty(session_data)
#---

session_id = session_data["sessionId"]
answer_turn_id = session_data["answerTurnId"]

#---
print(f"\nsessionId     : {session_id}")
print(f"answerTurnId  : {answer_turn_id}")
print(f"firstQuestion : {session_data['firstQuestion']}")
#---


# ── 2. vision chunk 3개 전송 ───────────────────────────────
VISION_CHUNKS = [
    {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_001",
        "t0": 0,
        "t1": 5000,
        "vision": {
            "posture": {"badPostureCount": 1, "badPostureDurationMs": 900, "postureStability": 0.78},
            "hands":   {"handVisibleRatio": 0.96, "handMovementIntensity": 0.42, "gestureCount": 2},
            "head":    {"faceDetectedRatio": 0.91, "headForwardRatio": 0.74, "lookingAwayCount": 1, "lookingAwayDurationMs": 1100},
            "quality": {"frameCount": 145, "validFrameRatio": 0.89, "fullBodyDetectedRatio": 0.84},
        },
    },
    {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_002",
        "t0": 5000,
        "t1": 10000,
        "vision": {
            "posture": {"badPostureCount": 0, "badPostureDurationMs": 0, "postureStability": 0.92},
            "hands":   {"handVisibleRatio": 0.88, "handMovementIntensity": 0.21, "gestureCount": 1},
            "head":    {"faceDetectedRatio": 0.95, "headForwardRatio": 0.89, "lookingAwayCount": 0, "lookingAwayDurationMs": 0},
            "quality": {"frameCount": 150, "validFrameRatio": 0.95, "fullBodyDetectedRatio": 0.91},
        },
    },
    {
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_003",
        "t0": 10000,
        "t1": 15000,
        "vision": {
            "posture": {"badPostureCount": 2, "badPostureDurationMs": 1800, "postureStability": 0.61},
            "hands":   {"handVisibleRatio": 0.72, "handMovementIntensity": 0.65, "gestureCount": 4},
            "head":    {"faceDetectedRatio": 0.83, "headForwardRatio": 0.58, "lookingAwayCount": 3, "lookingAwayDurationMs": 2400},
            "quality": {"frameCount": 148, "validFrameRatio": 0.82, "fullBodyDetectedRatio": 0.79},
        },
    },
]

step("2. vision chunk 3개 전송  POST /api/sessions/{id}/vision-chunks")
for vchunk in VISION_CHUNKS:
    r = requests.post(f"{BASE_URL}/api/sessions/{session_id}/vision-chunks", json=vchunk)
    r.raise_for_status()
    ack = r.json()
    print(f"\n[{vchunk['chunkId']}] 전송 완료")
    pretty(ack)


# ── 3. audio-chunk 3개 전송 ────────────────────────────────
step("3. audio chunk 3개 전송  POST /api/sessions/{id}/audio-chunks")
for vchunk in VISION_CHUNKS:
    metadata = {
        "chunkId": vchunk["chunkId"],
        "answerTurnId": answer_turn_id,
        "t0": vchunk["t0"],
        "t1": vchunk["t1"],
        "mimeType": "audio/webm",
    }
    dummy_audio = io.BytesIO(f"dummy audio bytes for {vchunk['chunkId']}".encode("utf-8"))
    files = {
        "audio": (f"{vchunk['chunkId']}.webm", dummy_audio, "audio/webm"),
    }
    data = {
        "metadata": json.dumps(metadata),
    }

    r = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/audio-chunks",
        files=files,
        data=data,
    )
    r.raise_for_status()
    ack = r.json()
    print(f"\n[{vchunk['chunkId']}] 오디오 전송 완료")
    pretty(ack)


# ── 4. 답변 종료 ───────────────────────────────────────────
step("4. 답변 종료  POST /api/sessions/{id}/answers/{turn}/finish")
finish_payload = {
    "endedBy": "voice_command",
    "endedAt": 15000,
    "endPhrase": "이상입니다",
}
r = requests.post(
    f"{BASE_URL}/api/sessions/{session_id}/answers/{answer_turn_id}/finish",
    json=finish_payload,
)
r.raise_for_status()
pretty(r.json())


# ── 5. 답변 상태 확인 ─────────────────────────────────────
step("5. 답변 chunk 상태 확인  GET /api/sessions/{id}/answers/{turn}/status")
r = requests.get(
    f"{BASE_URL}/api/sessions/{session_id}/answers/{answer_turn_id}/status"
)
r.raise_for_status()
pretty(r.json())


# ── 6. Redis 저장 chunk 전체 조회 ──────────────────────────
step("6. Redis 저장 chunk 전체 조회  GET /api/sessions/{id}/chunks")
r = requests.get(f"{BASE_URL}/api/sessions/{session_id}/chunks")
r.raise_for_status()
chunks_in_redis = r.json()
print(f"\n총 {len(chunks_in_redis)}개 chunk 저장됨")
for c in chunks_in_redis:
    print(f"\n  chunkId={c['chunkId']}  t0={c['t0']}~t1={c['t1']}ms")
    print(f"  visionReady={c['status']['visionReady']}  "
          f"audioReceived={c['status']['audioReceived']}  "
          f"speechReady={c['status']['speechReady']}")
    if c.get("audioPath"):
        print(f"  audioPath={c['audioPath']}")
    if c.get("vision"):
        v = c["vision"]
        print(f"  postureStability={v['posture']['postureStability']}  "
              f"headForwardRatio={v['head']['headForwardRatio']}  "
              f"handMovementIntensity={v['hands']['handMovementIntensity']}")


# ── 7. Redis 직접 확인 안내 ────────────────────────────────
step("완료 — Redis 직접 확인하려면 아래 명령 실행")
print(f"  redis-cli GET \"session:{session_id}:chunk:c_001\"")
print(f"  redis-cli SMEMBERS \"session:{session_id}:answer:{answer_turn_id}:chunks\"")
print(f"  redis-cli GET \"session:{session_id}:meta\"")
