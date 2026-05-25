from urllib.parse import quote

import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis = None
REDIS_TTL_SECONDS = 60 * 60 * 6

def _get_redis_url() -> str:
    if settings.REDIS_URL.strip():
        return settings.REDIS_URL.strip()

    password = settings.REDIS_PASSWORD.strip() if settings.REDIS_PASSWORD else ""
    auth = f":{quote(password, safe='')}@" if password else ""
    return f"redis://{auth}{settings.REDIS_HOST}:{settings.REDIS_PORT}/0"

async def init_redis():
    global redis_client
    redis_client = aioredis.from_url(_get_redis_url(), decode_responses=True)
    await redis_client.ping()

async def get_redis() -> aioredis.Redis:
    return redis_client
