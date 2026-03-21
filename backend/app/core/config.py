from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    port: int = 8000
    environment: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://incharj:devpassword@localhost:5432/incharj_dev"
    redis_url: str = "redis://localhost:6379/0"

    app_secret: str = "change-me"
    encryption_key: str = "change-me-fernet-key"

    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    frontend_url: str = "http://localhost:5173"
    resend_api_key: str = ""

    google_client_id: str = ""
    google_client_secret: str = ""

    document_worker_concurrency: int = 4

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    semantic_search_enabled: bool = False
    embedding_provider: str = "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    embedding_batch_size: int = 64
    embedding_request_max_attempts: int = 4
    embedding_retry_base_delay_ms: int = 300


settings = Settings()
