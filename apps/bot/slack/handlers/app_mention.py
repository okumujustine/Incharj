from __future__ import annotations

import random

from slack_bolt.async_app import AsyncApp

from .common import fetch_answer_payload, run_clear_flow
from runtime import BotRuntime
from ..constants import CLEAR_COMMANDS, THINKING_MESSAGES
from ..parsing import extract_query


def register_app_mention_handlers(app: AsyncApp, runtime: BotRuntime) -> None:
    @app.event("app_mention")
    async def handle_mention(body: dict, say, client, logger) -> None:
        event = body["event"]
        raw_text: str = event.get("text", "")
        thread_ts: str = event["ts"]
        channel: str = event["channel"]

        query = extract_query(raw_text)
        if not query:
            await say("Please include a question after mentioning me.", thread_ts=thread_ts)
            return

        if query.lower() in CLEAR_COMMANDS:
            await run_clear_flow(channel=channel, say=say, client=client, logger=logger)
            return

        logger.info("ai_search query=%r channel=%s", query, channel)

        thinking = random.choice(THINKING_MESSAGES)
        loading_response = await say(thinking, thread_ts=thread_ts)
        loading_ts = loading_response.get("ts")

        answer, blocks = await fetch_answer_payload(runtime=runtime, query=query)

        if loading_ts:
            try:
                await client.chat_update(
                    channel=channel,
                    ts=loading_ts,
                    text=answer,
                    blocks=blocks,
                )
                return
            except Exception as exc:
                logger.warning("chat_update failed: %s - falling back to say()", exc)

        await say(text=answer, blocks=blocks, thread_ts=thread_ts)
