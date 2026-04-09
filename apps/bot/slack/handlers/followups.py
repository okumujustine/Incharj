from __future__ import annotations

from slack_bolt.async_app import AsyncApp

from .common import action_query, send_answer
from runtime import BotRuntime


def register_followup_handlers(app: AsyncApp, runtime: BotRuntime) -> None:
    @app.action("followup_more")
    async def handle_followup_more(ack, body, say) -> None:
        await ack()
        query = action_query(body)
        if not query:
            return

        channel = body["channel"]["id"]
        await say(":mag: Sure! Let me expand on that...", channel=channel)
        await send_answer(
            runtime=runtime,
            channel=channel,
            query=f"Tell me more about: {query}",
            say=say,
        )

    @app.action("followup_breakdown")
    async def handle_followup_breakdown(ack, body, say) -> None:
        await ack()
        query = action_query(body)
        if not query:
            return

        channel = body["channel"]["id"]
        await say(":bar_chart: Breaking it down...", channel=channel)
        await send_answer(
            runtime=runtime,
            channel=channel,
            query=f"Show the detailed breakdown for: {query}",
            say=say,
        )
