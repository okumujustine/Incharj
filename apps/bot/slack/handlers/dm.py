from __future__ import annotations

import asyncio
import random
from typing import Any, Literal

from openai import AsyncOpenAI
from slack_bolt.async_app import AsyncApp

from .common import fetch_answer_payload
from runtime import BotRuntime
from ..constants import CLEAR_COMMANDS, SESSION_TIMEOUT_SECONDS, THINKING_MESSAGES

# In-memory session store: channel -> {thread_ts, awaiting_close, timer}
_sessions: dict[str, dict[str, Any]] = {}

Intent = Literal["closing", "confirm_done", "question"]


async def _classify_intent(text: str, awaiting_close: bool, openai_api_key: str) -> Intent:
    """Ask OpenAI to classify the user's intent as closing, confirm_done, or question."""
    client = AsyncOpenAI(api_key=openai_api_key)

    context = (
        "The bot just asked the user if they are done with their session."
        if awaiting_close
        else "The user is in an active Q&A session with an AI assistant."
    )

    prompt = (
        f"{context}\n\n"
        f'User message: "{text}"\n\n'
        "Classify the intent as exactly one of:\n"
        "- closing: the user is wrapping up, expressing satisfaction, or saying goodbye "
        "(e.g. 'thanks', 'that helps', 'great', 'cheers', 'all good')\n"
        "- confirm_done: the user is explicitly confirming they are done when asked "
        "(e.g. 'yes', 'yep', 'done', 'correct', 'close it')\n"
        "- question: the user wants more information or has a follow-up question\n\n"
        "Reply with only one word: closing, confirm_done, or question."
    )

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=5,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        result = response.choices[0].message.content.strip().lower()
        if result in ("closing", "confirm_done", "question"):
            return result  # type: ignore[return-value]
        return "question"
    except Exception:
        return "question"


async def _close_session(channel: str, client, thread_ts: str) -> None:
    _sessions.pop(channel, None)
    try:
        await client.chat_postMessage(
            channel=channel,
            thread_ts=thread_ts,
            text=":wave: Happy to help! Feel free to ask anything anytime.",
        )
    except Exception:
        pass


def _cancel_timer(channel: str) -> None:
    session = _sessions.get(channel)
    if session and session.get("timer"):
        session["timer"].cancel()
        session["timer"] = None


def _start_timer(channel: str, client, loop: asyncio.AbstractEventLoop) -> None:
    _cancel_timer(channel)

    async def _auto_close() -> None:
        await asyncio.sleep(SESSION_TIMEOUT_SECONDS)
        session = _sessions.pop(channel, None)
        if session:
            try:
                await client.chat_postMessage(
                    channel=channel,
                    thread_ts=session["thread_ts"],
                    text=":zzz: Closing this session due to inactivity. Feel free to start a new one anytime!",
                )
            except Exception:
                pass

    task = loop.create_task(_auto_close())
    if channel in _sessions:
        _sessions[channel]["timer"] = task


def register_dm_handlers(app: AsyncApp, runtime: BotRuntime) -> None:
    openai_api_key = runtime.settings.openai_api_key

    @app.event("message")
    async def handle_dm(body: dict, say, client, logger) -> None:
        event = body.get("event", {})

        # Only handle DMs; ignore bot messages and subtypes (edits, deletes, etc.)
        if event.get("channel_type") != "im":
            return
        if event.get("bot_id") or event.get("subtype"):
            return

        text: str = event.get("text", "").strip()
        if not text:
            return

        channel: str = event["channel"]
        message_ts: str = event["ts"]
        thread_ts: str = event.get("thread_ts", message_ts)

        loop = asyncio.get_event_loop()

        # --- CLEAR command (keep as explicit keyword) ---
        if text.lower().strip() in CLEAR_COMMANDS:
            _cancel_timer(channel)
            _sessions.pop(channel, None)
            from .common import run_clear_flow
            await run_clear_flow(channel=channel, say=say, client=client, logger=logger)
            return

        session = _sessions.get(channel)
        awaiting_close = bool(session and session.get("awaiting_close"))

        # Use existing thread if session is active
        if session:
            thread_ts = session["thread_ts"]

        # Classify intent via AI
        intent = await _classify_intent(text, awaiting_close, openai_api_key)
        logger.info("dm intent=%s awaiting_close=%s text=%r", intent, awaiting_close, text)

        # --- Confirm done: user said yes after bot asked ---
        if intent == "confirm_done" and awaiting_close:
            _cancel_timer(channel)
            await _close_session(channel, client, thread_ts)
            return

        # --- Closing tone: user is wrapping up ---
        if intent == "closing":
            if session:
                session["awaiting_close"] = True
                _cancel_timer(channel)
                _start_timer(channel, client, loop)
            await say(
                text="Glad I could help! :slightly_smiling_face: Are you done, or is there anything else?",
                thread_ts=thread_ts,
            )
            return

        # --- Question: answer it ---
        if not session:
            _sessions[channel] = {
                "thread_ts": thread_ts,
                "awaiting_close": False,
                "timer": None,
            }
            session = _sessions[channel]
        else:
            session["awaiting_close"] = False

        _start_timer(channel, client, loop)

        logger.info("dm query=%r channel=%s thread=%s", text, channel, thread_ts)

        thinking = random.choice(THINKING_MESSAGES)
        loading_response = await say(thinking, thread_ts=thread_ts)
        loading_ts = loading_response.get("ts")

        answer, blocks = await fetch_answer_payload(runtime=runtime, query=text)

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
                logger.warning("chat_update failed: %s", exc)

        await say(text=answer, blocks=blocks, thread_ts=thread_ts)
