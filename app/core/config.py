from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None
    OPENAI_API_KEY: str = ""
    OPENAI_STT_MODEL: str = "gpt-4o-mini-transcribe"
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_QUESTION_MODEL: str = "openai/gpt-4o-mini"
    ENABLE_LLM_QUESTION_GENERATION: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
