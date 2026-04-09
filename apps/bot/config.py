from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from dotenv import load_dotenv

load_dotenv()

TransportKind = Literal["socket_mode", "events_api"]


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
        transport = os.getenv("SLACK_TRANSPORT", "socket_mode").strip().lower() or "socket_mode"
        if transport not in {"socket_mode", "events_api"}:
            raise RuntimeError(f"Unsupported SLACK_TRANSPORT value: {transport}")

        slack_app_token = os.getenv("SLACK_APP_TOKEN")
        slack_signing_secret = os.getenv("SLACK_SIGNING_SECRET")

        if transport == "socket_mode" and not slack_app_token:
            raise RuntimeError("SLACK_APP_TOKEN is required when SLACK_TRANSPORT=socket_mode")

        return cls(
            slack_bot_token=os.environ["SLACK_BOT_TOKEN"],
            slack_app_token=slack_app_token,
            slack_signing_secret=slack_signing_secret,
            incharj_api_url=os.getenv("INCHARJ_API_URL", "http://api:8000").rstrip("/"),
            incharj_org_id=os.environ["INCHARJ_ORG_ID"],
            transport=transport,
            port=int(os.getenv("PORT", "3001")),
            slack_events_path=os.getenv("SLACK_EVENTS_PATH", "/slack/events"),
        )
