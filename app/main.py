from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.db.database import init_db
from app.core.redis import init_redis
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.rag import router as rag_router
from app.api.sessions import router as sessions_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"[WARNING] DB init skipped: {e}")
    await init_redis()
    yield

app = FastAPI(title="InterviewIQ", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(sessions_router)
app.include_router(rag_router)
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(assets_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
