from __future__ import annotations

from slack_bolt.async_app import AsyncApp

from config import BotSettings
from .handlers import register_handlers
from runtime import BotRuntime


def create_slack_app(settings: BotSettings) -> AsyncApp:
    app = AsyncApp(token=settings.slack_bot_token)
    runtime = BotRuntime.from_settings(settings)
    register_handlers(app, runtime=runtime)
    return app
