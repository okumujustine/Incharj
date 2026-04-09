from __future__ import annotations

import re

from slack_bolt.async_app import AsyncApp


def register_source_action_handlers(app: AsyncApp) -> None:
    @app.action(re.compile(r"^source_\d+$"))
    async def handle_source_action(ack) -> None:
        await ack()
