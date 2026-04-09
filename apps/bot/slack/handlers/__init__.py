from __future__ import annotations

from slack_bolt.async_app import AsyncApp

from .app_mention import register_app_mention_handlers
from .clear_command import register_clear_command_handlers
from .followups import register_followup_handlers
from .source_actions import register_source_action_handlers
from runtime import BotRuntime


def register_handlers(app: AsyncApp, runtime: BotRuntime) -> None:
    register_clear_command_handlers(app, runtime)
    register_app_mention_handlers(app, runtime)
    register_followup_handlers(app, runtime)
    register_source_action_handlers(app)
