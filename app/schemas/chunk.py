from pydantic import BaseModel

class SpeechData(BaseModel):
    text: str
    wordsPerSec: float
    pauseRatio: float
    fillerCount: int

class VisionData(BaseModel):
    eyeContact: float
    posture: float
    gesture: int
    legMovement: float

class ChunkCreate(BaseModel):
    sessionId: str
    t0: int
    t1: int
    speech: SpeechData
    vision: VisionData
    mismatchScore: float

class ChunkResponse(BaseModel):
    chunkId: str
    sessionId: str
    status: str