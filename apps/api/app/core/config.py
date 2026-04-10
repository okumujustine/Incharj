from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    port: int = 8000
    environment: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str
    redis_url: str

    app_secret: str
    encryption_key: str

    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    refresh_cookie_name: str = "refresh_token"

    frontend_url: str = "http://localhost:3000"

    google_client_id: str = ""
    google_client_secret: str = ""

    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_signing_secret: str = ""
    slack_bot_token: str = ""
    slack_notify_channel: str = ""

    document_worker_concurrency: int = 4

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    semantic_search_enabled: bool = False
    embedding_provider: str = "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    embedding_batch_size: int = 64
    embedding_request_max_attempts: int = 4
    embedding_retry_base_delay_ms: int = 300

settings = Settings.model_validate({k.lower(): v for k, v in os.environ.items()})
