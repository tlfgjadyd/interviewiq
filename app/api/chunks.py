from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.core.redis import get_redis
from app.schemas.chunk import ChunkCreate, ChunkResponse
import uuid
import json

router = APIRouter(prefix="/api/chunks", tags=["chunks"])

@router.post("", response_model=ChunkResponse)
async def receive_chunk(chunk: ChunkCreate, db: AsyncSession = Depends(get_db)):
    chunk_id = str(uuid.uuid4())
    redis = await get_redis()

    # Redis에 임시 저장 (키: chunk:{sessionId}:{chunkId}, TTL 1시간)
    redis_key = f"chunk:{chunk.sessionId}:{chunk_id}"
    await redis.setex(
        redis_key,
        3600,
        json.dumps({
            "chunkId": chunk_id,
            "sessionId": chunk.sessionId,
            "t0": chunk.t0,
            "t1": chunk.t1,
            "speech": chunk.speech.model_dump(),
            "vision": chunk.vision.model_dump(),
            "mismatchScore": chunk.mismatchScore,
        })
    )

    return ChunkResponse(
        chunkId=chunk_id,
        sessionId=chunk.sessionId,
        status="received"
    )