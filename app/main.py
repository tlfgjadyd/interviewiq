from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.db.database import init_db
from app.core.redis import init_redis
from app.api.chunks import router as chunks_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_redis()
    yield

app = FastAPI(title="InterviewIQ", lifespan=lifespan)
app.include_router(chunks_router)

@app.get("/health")
async def health():
    return {"status": "ok"}