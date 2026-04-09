from __future__ import annotations

from typing import Any

from runtime import BotRuntime
from ..blocks import build_answer_blocks

_CLEAR_ERROR_TEXT = (
    ":warning: Could not clear messages. Make sure I have "
    "`channels:history` and `chat:write` permissions."
)


async def clear_bot_messages(*, client, channel: str) -> int:
    bot_info = await client.auth_test()
    bot_user_id = bot_info["user_id"]

    deleted = 0
    cursor = None
    while True:
        history_args: dict[str, Any] = {"channel": channel, "limit": 200}
        if cursor:
            history_args["cursor"] = cursor

        history = await client.conversations_history(**history_args)
        messages = history.get("messages", [])

        for message in messages:
            if message.get("user") == bot_user_id or message.get("bot_id"):
                try:
                    await client.chat_delete(channel=channel, ts=message["ts"])
                    deleted += 1
                except Exception:
                    pass

        cursor = history.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            return deleted


async def run_clear_flow(*, channel: str, say, client, logger) -> None:
    try:
        deleted = await clear_bot_messages(client=client, channel=channel)
    except Exception as exc:
        logger.error("clear_bot_messages error: %s", exc)
        await say(_CLEAR_ERROR_TEXT, channel=channel)
        return

    await say(f":white_check_mark: Cleared {deleted} message(s).", channel=channel)


def action_query(body: dict[str, Any]) -> str:
    actions = body.get("actions", [])
    if actions:
        value = actions[0].get("value", "")
        if value:
            return value
    return body.get("message", {}).get("text", "")


async def fetch_answer_payload(
    *,
    runtime: BotRuntime,
    query: str,
) -> tuple[str, list[dict[str, Any]]]:
    answer = await runtime.search_client.search(query)
    blocks = build_answer_blocks(query=query, answer=answer.answer, sources=answer.sources)
    return answer.answer, blocks


async def send_answer(
    *,
    runtime: BotRuntime,
    channel: str,
    query: str,
    say,
    thread_ts: str | None = None,
) -> None:
    answer, blocks = await fetch_answer_payload(runtime=runtime, query=query)
    await say(text=answer, blocks=blocks, channel=channel, thread_ts=thread_ts)
