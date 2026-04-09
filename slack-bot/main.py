from __future__ import annotations

import asyncio
import os
import re

import httpx
from dotenv import load_dotenv
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler

load_dotenv()

SLACK_APP_TOKEN = os.environ["SLACK_APP_TOKEN"]
SLACK_BOT_TOKEN = os.environ["SLACK_BOT_TOKEN"]
INCHARJ_API_URL = os.environ.get("INCHARJ_API_URL", "http://api:8000")
INCHARJ_ORG_ID = os.environ["INCHARJ_ORG_ID"]

app = AsyncApp(token=SLACK_BOT_TOKEN)


def _extract_query(text: str) -> str:
    """Strip the @bot mention from the message text."""
    return re.sub(r"<@[A-Z0-9]+>", "", text).strip()


async def _ai_search(query: str) -> str:
    """Call the incharj streaming AI search endpoint and accumulate the full answer."""
    url = f"{INCHARJ_API_URL}/api/v1/search/ai-stream"
    payload = {"query": query, "org_id": INCHARJ_ORG_ID}

    chunks: list[str] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, json=payload) as response:
            if response.status_code != 200:
                return f":warning: Search failed (status {response.status_code})."
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    break
                import json
                try:
                    parsed = json.loads(data)
                    delta = parsed.get("delta", "")
                    if delta:
                        chunks.append(delta)
                except (json.JSONDecodeError, KeyError):
                    continue

    return "".join(chunks) or "_No results found._"


@app.event("app_mention")
async def handle_mention(body: dict, say, logger) -> None:
    event = body["event"]
    raw_text: str = event.get("text", "")
    thread_ts: str = event["ts"]
    channel: str = event["channel"]

    query = _extract_query(raw_text)
    if not query:
        await say("Please include a question after mentioning me.", thread_ts=thread_ts)
        return

    logger.info("ai_search query=%r channel=%s", query, channel)

    # Post a "thinking" message immediately so the user knows the bot is working
    await say(":hourglass_flowing_sand: Searching...", thread_ts=thread_ts)

    answer = await _ai_search(query)
    await say(answer, thread_ts=thread_ts)


async def main() -> None:
    handler = AsyncSocketModeHandler(app, SLACK_APP_TOKEN)
    await handler.start_async()


if __name__ == "__main__":
    asyncio.run(main())
