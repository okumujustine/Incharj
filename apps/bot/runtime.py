from __future__ import annotations

from dataclasses import dataclass

from clients.incharj import IncharjAIClient
from config import BotSettings


@dataclass(frozen=True, slots=True)
class BotRuntime:
    settings: BotSettings
    search_client: IncharjAIClient

    @classmethod
    def from_settings(cls, settings: BotSettings) -> "BotRuntime":
        return cls(
            settings=settings,
            search_client=IncharjAIClient(
                api_url=settings.incharj_api_url,
                org_id=settings.incharj_org_id,
            ),
        )
