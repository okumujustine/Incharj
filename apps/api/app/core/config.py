from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    port: int
    environment: str
    api_prefix: str
    database_url: str
    redis_url: str

    app_secret: str
    encryption_key: str

    access_token_expire_minutes: int
    refresh_token_expire_days: int
    cookie_secure: bool
    cookie_samesite: str
    refresh_cookie_name: str

    frontend_url: str
    resend_api_key: str

    google_client_id: str
    google_client_secret: str

    slack_client_id: str
    slack_client_secret: str
    slack_signing_secret: str
    slack_bot_token: str
    slack_notify_channel: str

    document_worker_concurrency: int

    openai_api_key: str
    anthropic_api_key: str
    openai_base_url: str
    semantic_search_enabled: bool
    embedding_provider: str
    embedding_model: str
    embedding_dimensions: int
    embedding_batch_size: int
    embedding_request_max_attempts: int
    embedding_retry_base_delay_ms: int

settings = Settings.model_validate(dict(os.environ))
