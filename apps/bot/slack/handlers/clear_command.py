from __future__ import annotations

from slack_bolt.async_app import AsyncApp

from .common import run_clear_flow
from runtime import BotRuntime


def register_clear_command_handlers(app: AsyncApp, runtime: BotRuntime) -> None:
    del runtime

    @app.command("/clear")
    async def handle_clear_command(ack, body, say, client, logger) -> None:
        await ack()
        await run_clear_flow(
            channel=body["channel_id"],
            say=say,
            client=client,
            logger=logger,
        )
