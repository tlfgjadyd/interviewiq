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


# ── 2. 자기소개서/채용공고 문서 전송 ───────────────────────
step("2. 자기소개서/채용공고 전송  POST /api/sessions/{id}/documents")
documents_payload = {
    "resumeText": (
        "저는 팀 프로젝트에서 백엔드를 맡아 REST API 응답 속도를 개선했습니다. "
        "PostgreSQL 쿼리 병목을 분석하고 인덱스를 추가해 평균 응답 시간을 줄였습니다. "
        "팀원들과 협업하며 Redis 캐싱 전략도 함께 검토했습니다."
    ),
    "jobPostingText": (
        "백엔드 개발자 채용. 주요 업무는 REST API 설계, 데이터베이스 최적화, "
        "서비스 운영 안정성 개선입니다. PostgreSQL, Redis 경험과 협업 능력을 우대합니다."
    ),
    "company": "sk_hynix",
    "role": "backend",
}
r = requests.post(
    f"{BASE_URL}/api/sessions/{session_id}/documents",
    json=documents_payload,
)
r.raise_for_status()
documents_data = r.json()
pretty(documents_data)

step("2-1. 개인화 질문 확인  GET /api/sessions/{id}/next-question")
r = requests.get(f"{BASE_URL}/api/sessions/{session_id}/next-question")
r.raise_for_status()
pretty(r.json())


# ── 3. vision chunk 3개 전송 ───────────────────────────────
VISION_CHUNKS = [
    {
        "version": "vision_v2",
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_001",
        "t0": 0,
        "t1": 5000,
        "context": {"questionType": "project_experience", "answerPhase": "start"},
        "vision": {
            "behaviorRiskScore": 24,
            "nonverbalRiskScore": 24,
            "level": "good",
            "reasons": ["전반적으로 안정적인 구간입니다."],
            "events": [],
            "posture": {
                "postureCollapse": 16,
                "bodySway": 21,
                "isBadPosture": False,
                "isPostureCollapsed": False,
            },
            "gaze": {
                "isFacingForward": True,
                "isLookingAway": False,
                "eyeCentered": True,
                "headForward": True,
                "gazeStable": True,
                "gazeAwayDurationMs": 0,
                "gazePenalty": 12,
            },
            "gesture": {
                "fidgetScore": 22,
                "handMovement": 34,
                "handVelocity": 28,
                "handJerk": 15,
                "movementRepetition": 10,
                "handToFaceProximity": 4,
                "upperBodyMovement": 18,
                "legMovement": 14,
                "legShakingScore": 8,
            },
            "zScores": {
                "postureCollapseZ": 0.1,
                "handMovementZ": 0.2,
                "gazeAwayZ": 0.0,
                "bodySwayZ": 0.1,
                "fidgetZ": 0.1,
                "legMovementZ": 0.0,
            },
            "states": {
                "isBadPosture": False,
                "isFidgeting": False,
                "isFacingForward": True,
                "isGazeUnstable": False,
                "isGoodSegment": True,
                "isLegMovementHigh": False,
                "isLegShaking": False,
                "isPostureCollapsed": False,
                "isNervous": False,
                "isLookingAway": False,
            },
            "quality": {
                "frameCount": 145,
                "validFrameRatio": 0.89,
                "fullBodyDetectedRatio": 0.84,
                "lowerBodyDetectedRatio": 0.81,
                "faceResolutionLevel": "low",
                "confidence": 0.78,
            },
        },
        "realtimeAudioSignals": {
            "rmsVolume": 0.034,
            "peakVolume": 0.11,
            "isSpeakingRatio": 0.84,
            "silenceDurationMs": 800,
            "volumeWarning": "normal",
            "paceHint": "normal",
        },
    },
    {
        "version": "vision_v2",
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_002",
        "t0": 5000,
        "t1": 10000,
        "context": {"questionType": "project_experience", "answerPhase": "middle"},
        "vision": {
            "behaviorRiskScore": 38,
            "nonverbalRiskScore": 38,
            "level": "good",
            "reasons": ["손 움직임이 약간 증가했지만 안정적인 범위입니다."],
            "events": [],
            "posture": {
                "postureCollapse": 22,
                "bodySway": 31,
                "isBadPosture": False,
                "isPostureCollapsed": False,
            },
            "gaze": {
                "isFacingForward": True,
                "isLookingAway": False,
                "eyeCentered": True,
                "headForward": True,
                "gazeStable": True,
                "gazeAwayDurationMs": 300,
                "gazePenalty": 20,
            },
            "gesture": {
                "fidgetScore": 36,
                "handMovement": 48,
                "handVelocity": 45,
                "handJerk": 24,
                "movementRepetition": 18,
                "handToFaceProximity": 6,
                "upperBodyMovement": 29,
                "legMovement": 25,
                "legShakingScore": 18,
            },
            "zScores": {
                "postureCollapseZ": 0.3,
                "handMovementZ": 0.6,
                "gazeAwayZ": 0.2,
                "bodySwayZ": 0.4,
                "fidgetZ": 0.5,
                "legMovementZ": 0.2,
            },
            "states": {
                "isBadPosture": False,
                "isFidgeting": False,
                "isFacingForward": True,
                "isGazeUnstable": False,
                "isGoodSegment": True,
                "isLegMovementHigh": False,
                "isLegShaking": False,
                "isPostureCollapsed": False,
                "isNervous": False,
                "isLookingAway": False,
            },
            "quality": {
                "frameCount": 150,
                "validFrameRatio": 0.95,
                "fullBodyDetectedRatio": 0.91,
                "lowerBodyDetectedRatio": 0.88,
                "faceResolutionLevel": "medium",
                "confidence": 0.86,
            },
        },
        "realtimeAudioSignals": {
            "rmsVolume": 0.041,
            "peakVolume": 0.14,
            "isSpeakingRatio": 0.9,
            "silenceDurationMs": 500,
            "volumeWarning": "normal",
            "paceHint": "normal",
        },
    },
    {
        "version": "vision_v2",
        "sessionId": session_id,
        "answerTurnId": answer_turn_id,
        "chunkId": "c_003",
        "t0": 10000,
        "t1": 15000,
        "context": {"questionType": "project_experience", "answerPhase": "end"},
        "vision": {
            "behaviorRiskScore": 61,
            "nonverbalRiskScore": 61,
            "level": "warning",
            "reasons": [
                "시선 또는 얼굴 방향이 정면에서 벗어났습니다.",
                "다리 떨림으로 보이는 반복적인 하체 움직임이 감지되었습니다.",
            ],
            "events": [
                {
                    "type": "leg_shaking",
                    "startMs": 10000,
                    "endMs": 15000,
                    "severity": "medium",
                    "confidence": 0.72,
                    "reason": "다리 떨림으로 보이는 반복적인 하체 움직임이 감지되었습니다.",
                },
                {
                    "type": "gaze_away",
                    "startMs": 10000,
                    "endMs": 15000,
                    "severity": "medium",
                    "confidence": 0.55,
                    "reason": "시선 또는 얼굴 방향이 정면에서 벗어났습니다.",
                },
            ],
            "posture": {
                "postureCollapse": 28,
                "bodySway": 36,
                "isBadPosture": False,
                "isPostureCollapsed": False,
            },
            "gaze": {
                "isFacingForward": False,
                "isLookingAway": True,
                "eyeCentered": False,
                "headForward": False,
                "gazeStable": False,
                "gazeAwayDurationMs": 1800,
                "gazePenalty": 55,
            },
            "gesture": {
                "fidgetScore": 44,
                "handMovement": 49,
                "handVelocity": 54,
                "handJerk": 32,
                "movementRepetition": 18,
                "handToFaceProximity": 10,
                "upperBodyMovement": 36,
                "legMovement": 54,
                "kneeMovement": 42,
                "kneeVelocity": 64,
                "kneeVariance": 58,
                "kneeZeroCrossingRate": 7.2,
                "kneeZeroCrossingScore": 84,
                "legShakingScore": 72,
            },
            "zScores": {
                "postureCollapseZ": 0.4,
                "handMovementZ": 0.5,
                "gazeAwayZ": 2.1,
                "bodySwayZ": 0.3,
                "fidgetZ": 0.6,
                "legMovementZ": 0.4,
            },
            "states": {
                "isBadPosture": False,
                "isFidgeting": False,
                "isFacingForward": False,
                "isGazeUnstable": True,
                "isGoodSegment": False,
                "isLegMovementHigh": False,
                "isLegShaking": True,
                "isPostureCollapsed": False,
                "isNervous": False,
                "isLookingAway": True,
            },
            "quality": {
                "frameCount": 148,
                "validFrameRatio": 0.82,
                "fullBodyDetectedRatio": 0.79,
                "lowerBodyDetectedRatio": 0.8,
                "faceResolutionLevel": "low",
                "confidence": 0.77,
            },
        },
        "realtimeAudioSignals": {
            "rmsVolume": 0.022,
            "peakVolume": 0.08,
            "isSpeakingRatio": 0.7,
            "silenceDurationMs": 1200,
            "volumeWarning": "too_low",
            "paceHint": "slow",
        },
    },
]

step("3. vision chunk 3개 전송  POST /api/sessions/{id}/vision-chunks")
for vchunk in VISION_CHUNKS:
    r = requests.post(f"{BASE_URL}/api/sessions/{session_id}/vision-chunks", json=vchunk)
    r.raise_for_status()
    ack = r.json()
    print(f"\n[{vchunk['chunkId']}] 전송 완료")
    pretty(ack)


# ── 4. audio-chunk 3개 전송 ────────────────────────────────
step("4. audio chunk 3개 전송  POST /api/sessions/{id}/audio-chunks")
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


# ── 5. 답변 종료 ───────────────────────────────────────────
SPEECH_CHUNKS = [
    {
        "chunkId": "c_001",
        "answerTurnId": answer_turn_id,
        "text": "저는 팀 프로젝트에서 백엔드를 맡아 REST API 응답 속도를 개선했습니다.",
        "segments": [
            {
                "startMs": 0,
                "endMs": 4500,
                "text": "저는 팀 프로젝트에서 백엔드를 맡아 REST API 응답 속도를 개선했습니다.",
            }
        ],
        "source": "manual_test",
    },
    {
        "chunkId": "c_002",
        "answerTurnId": answer_turn_id,
        "text": "PostgreSQL 쿼리 실행 계획을 확인했고 병목이 되는 조회 조건에 인덱스를 추가했습니다.",
        "segments": [
            {
                "startMs": 5000,
                "endMs": 9500,
                "text": "PostgreSQL 쿼리 실행 계획을 확인했고 병목이 되는 조회 조건에 인덱스를 추가했습니다.",
            }
        ],
        "source": "manual_test",
    },
    {
        "chunkId": "c_003",
        "answerTurnId": answer_turn_id,
        "text": "그 결과 평균 응답 시간이 줄었고 Redis 캐싱 적용 범위도 팀원들과 함께 정리했습니다.",
        "segments": [
            {
                "startMs": 10000,
                "endMs": 14500,
                "text": "그 결과 평균 응답 시간이 줄었고 Redis 캐싱 적용 범위도 팀원들과 함께 정리했습니다.",
            }
        ],
        "source": "manual_test",
    },
]

step("5. speech chunk 3개 전송  POST /api/sessions/{id}/speech-chunks")
for schunk in SPEECH_CHUNKS:
    r = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/speech-chunks",
        json=schunk,
    )
    r.raise_for_status()
    ack = r.json()
    print(f"\n[{schunk['chunkId']}] speech 전송 완료")
    pretty(ack)


# ── 6. 답변 종료 ───────────────────────────────────────────
step("6. 답변 종료  POST /api/sessions/{id}/answers/{turn}/finish")
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


# ── 7. 답변 상태 확인 ─────────────────────────────────────
step("7. 답변 chunk 상태 확인  GET /api/sessions/{id}/answers/{turn}/status")
r = requests.get(
    f"{BASE_URL}/api/sessions/{session_id}/answers/{answer_turn_id}/status"
)
r.raise_for_status()
pretty(r.json())


# ── 8. 답변 분석 확인 ─────────────────────────────────────
step("8. 답변 분석 확인  GET /api/sessions/{id}/answers/{turn}/analysis")
r = requests.get(
    f"{BASE_URL}/api/sessions/{session_id}/answers/{answer_turn_id}/analysis"
)
r.raise_for_status()
pretty(r.json())


# ── 9. Redis 저장 chunk 전체 조회 ──────────────────────────
step("9. Redis 저장 chunk 전체 조회  GET /api/sessions/{id}/chunks")
r = requests.get(f"{BASE_URL}/api/sessions/{session_id}/chunks")
r.raise_for_status()
chunks_in_redis = r.json()
print(f"\n총 {len(chunks_in_redis)}개 chunk 저장됨")
for c in chunks_in_redis:
    print(f"\n  chunkId={c['chunkId']}  t0={c['t0']}~t1={c['t1']}ms")
    print(f"  visionReady={c['status']['visionReady']}  "
          f"audioReceived={c['status']['audioReceived']}  "
          f"speechReady={c['status']['speechReady']}")
    if c.get("speech"):
        print(f"  speechText={c['speech']['text']}")
    if c.get("audioPath"):
        print(f"  audioPath={c['audioPath']}")
    if c.get("vision"):
        v = c["vision"]
        print(f"  version={c.get('version')}  level={v['level']}  "
              f"behaviorRiskScore={v['behaviorRiskScore']}  "
              f"nonverbalRiskScore={v['nonverbalRiskScore']}")
        print(f"  gazePenalty={v['gaze']['gazePenalty']}  "
              f"legShakingScore={v['gesture']['legShakingScore']}  "
              f"events={len(v['events'])}")


# ── 10. Redis 직접 확인 안내 ───────────────────────────────
step("완료 — Redis 직접 확인하려면 아래 명령 실행")
print(f"  redis-cli GET \"session:{session_id}:chunk:c_001\"")
print(f"  redis-cli SMEMBERS \"session:{session_id}:answer:{answer_turn_id}:chunks\"")
print(f"  redis-cli GET \"session:{session_id}:meta\"")
print(f"  redis-cli GET \"session:{session_id}:documents\"")
print(f"  redis-cli LRANGE \"session:{session_id}:rag:documents\" 0 -1")
