from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

TransportKind = Literal["socket_mode", "events_api"]


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} is required")
    return value.strip()


def _optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


@dataclass(frozen=True, slots=True)
class BotSettings:
    slack_bot_token: str
    slack_app_token: str | None
    slack_signing_secret: str | None
    incharj_api_url: str
    incharj_org_id: str
    transport: TransportKind
    port: int
    slack_events_path: str

    @classmethod
    def from_env(cls) -> "BotSettings":
        transport = _required_env("SLACK_TRANSPORT").lower()
        if transport not in {"socket_mode", "events_api"}:
            raise RuntimeError(f"Unsupported SLACK_TRANSPORT value: {transport}")

        slack_app_token = _optional_env("SLACK_APP_TOKEN")
        slack_signing_secret = _optional_env("SLACK_SIGNING_SECRET")

        if transport == "socket_mode" and not slack_app_token:
            raise RuntimeError("SLACK_APP_TOKEN is required when SLACK_TRANSPORT=socket_mode")

        return cls(
            slack_bot_token=_required_env("SLACK_BOT_TOKEN"),
            slack_app_token=slack_app_token,
            slack_signing_secret=slack_signing_secret,
            incharj_api_url=_required_env("INCHARJ_API_URL").rstrip("/"),
            incharj_org_id=_required_env("INCHARJ_ORG_ID"),
            transport=transport,
            port=int(_required_env("PORT")),
            slack_events_path=_required_env("SLACK_EVENTS_PATH"),
        )
