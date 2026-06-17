from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "ALOS ML Service"
    version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # Groq LLM
    groq_api_key: str
    groq_model: str = "llama3-70b-8192"
    groq_max_tokens: int = 2048
    groq_temperature: float = 0.3

    # Database
    database_url: str = "postgresql://alos_user:alos_password@localhost:5432/alos_db"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Rate limiting for Groq (free tier: 30 req/min)
    groq_requests_per_minute: int = 25
    groq_retry_attempts: int = 3

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
