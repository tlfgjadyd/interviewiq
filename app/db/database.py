from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import get_database_url
from app.db.models import Base

database_url = get_database_url()
engine = create_async_engine(database_url, echo=True) if database_url else None
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False) if engine else None

async def init_db():
    if engine is None:
        raise RuntimeError("PostgreSQL is not configured")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    if AsyncSessionLocal is None:
        raise RuntimeError("PostgreSQL is not configured")
    async with AsyncSessionLocal() as session:
        yield session
