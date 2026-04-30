import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis = None
REDIS_TTL_SECONDS = 60 * 60 * 6

async def init_redis():
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

async def get_redis() -> aioredis.Redis:
    return redis_client
