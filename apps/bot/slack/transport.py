from __future__ import annotations

from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler
from slack_bolt.async_app import AsyncApp

from config import BotSettings


async def run_transport(app: AsyncApp, settings: BotSettings) -> None:
    if settings.transport == "socket_mode":
        handler = AsyncSocketModeHandler(app, settings.slack_app_token)
        await handler.start_async()
        return

    if settings.transport == "events_api":
        raise RuntimeError(
            "SLACK_TRANSPORT=events_api is not wired yet. "
            "The bot logic now lives in slack.app.create_slack_app(), so you can plug that same app "
            "into an HTTP adapter without changing the handlers."
        )

    raise RuntimeError(f"Unsupported SLACK_TRANSPORT value: {settings.transport}")
