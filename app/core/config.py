from pydantic_settings import BaseSettings
from urllib.parse import quote

class Settings(BaseSettings):
    DATABASE_URL: str = ""
    POSTGRES_USER: str = ""
    POSTGRES_PASSWORD: str = ""
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = ""
    DB_TABLE_PREFIX: str = "ii_test_"
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"
    FRONTEND_AUTH_REDIRECT_URL: str = "http://localhost:3000/auth/callback"
    AUTH_SECRET: str = "interviewiq-dev-auth-secret"
    AUTH_TOKEN_TTL_SECONDS: int = 60 * 60 * 24 * 7
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = ""
    R2_PRESIGN_EXPIRES_SECONDS: int = 60 * 10
    OPENAI_API_KEY: str = ""
    OPENAI_STT_MODEL: str = "gpt-4o-mini-transcribe"
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_QUESTION_MODEL: str = "openai/gpt-4o-mini"
    ENABLE_LLM_QUESTION_GENERATION: bool = True
    ENABLE_LLM_ANSWER_EVALUATION: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

def get_database_url() -> str:
    if settings.DATABASE_URL.strip():
        return settings.DATABASE_URL.strip()

    if not settings.POSTGRES_USER or not settings.POSTGRES_DB:
        return ""

    user = quote(settings.POSTGRES_USER, safe="")
    password = quote(settings.POSTGRES_PASSWORD, safe="")
    auth = f"{user}:{password}" if password else user
    return (
        f"postgresql+asyncpg://{auth}@"
        f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
