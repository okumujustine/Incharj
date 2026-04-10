from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.connectors.plugin_types import (
    ConnectorCheckpoint,
    ConnectorDocumentRef,
    ConnectorEnumerateInput,
    ConnectorEnumerationResult,
)
from app.connectors.slack.constants import (
    PAGE_SIZE,
    SKIP_SUBTYPES,
    SLACK_CONVERSATIONS_HISTORY,
    SLACK_CONVERSATIONS_LIST,
)

log = logging.getLogger("slack-connector")


def _bot_token(credentials: dict[str, Any]) -> str:
    token = credentials.get("bot_token") or credentials.get("token", "")
    if not token:
        from app.types.sync_errors import SyncErrorCode, SyncPipelineError
        raise SyncPipelineError(
            code=SyncErrorCode.UNAUTHORIZED,
            stage="enumeration",
            message="Slack bot token is missing from credentials",
            retriable=False,
        )
    return token


def _check_slack_response(data: dict[str, Any], stage: str) -> None:
    if not data.get("ok"):
        error = data.get("error", "unknown")
        from app.types.sync_errors import SyncErrorCode, SyncPipelineError
        if error in ("invalid_auth", "not_authed", "token_revoked", "account_inactive"):
            raise SyncPipelineError(
                code=SyncErrorCode.UNAUTHORIZED,
                stage=stage,
                message=f"Slack auth error: {error}",
                retriable=False,
            )
        raise SyncPipelineError(
            code=SyncErrorCode.ENUMERATION_FAILED,
            stage=stage,
            message=f"Slack API error: {error}",
            retriable=error in ("ratelimited", "service_unavailable"),
        )


def _is_skippable(msg: dict[str, Any]) -> bool:
    """Return True for bot messages and system event messages."""
    if msg.get("bot_id"):
        return True
    subtype = msg.get("subtype")
    if subtype and subtype in SKIP_SUBTYPES:
        return True
    return False


def _make_ref(msg: dict[str, Any], channel_id: str, channel_name: str) -> ConnectorDocumentRef:
    ts = msg["ts"]
    thread_ts = msg.get("thread_ts")
    is_thread_root = thread_ts == ts and msg.get("reply_count", 0) > 0

    # external_id: channel:ts — unique per message
    external_id = f"{channel_id}:{ts}"
    url = None  # Slack deep links require team domain; omit for now

    # Use the first 120 chars of the message text as the title
    text = (msg.get("text") or "").strip()
    title = text[:120] + ("…" if len(text) > 120 else "") if text else f"Message {ts}"

    return ConnectorDocumentRef(
        external_id=external_id,
        title=title,
        url=url,
        kind="message",
        ext=None,
        author_name=msg.get("user") or msg.get("username"),
        author_email=None,
        content_type="text/plain",
        source_path=f"#{channel_name}",
        source_last_modified_at=ts,
        source_permissions=None,
        metadata={
            "channel_id": channel_id,
            "channel_name": channel_name,
            "ts": ts,
            "thread_ts": thread_ts,
            "is_thread_root": is_thread_root,
            "reply_count": msg.get("reply_count", 0),
        },
    )


async def enumerate_slack(input: ConnectorEnumerateInput) -> ConnectorEnumerationResult:
    token = _bot_token(input.credentials)
    config = input.config
    max_messages: int = config.get("max_messages", 10_000)
    page_limit = input.page_limit  # set by processor for incremental page-by-page enumeration

    # oldest = resume cursor from last checkpoint
    oldest: str | None = None
    cursor_channel: str | None = None  # channel to resume from when page_limit is set
    if input.checkpoint:
        oldest = input.checkpoint.cursor       # reuse cursor field as oldest timestamp
        cursor_channel = input.checkpoint.extra.get("channel_cursor")

    headers = {"Authorization": f"Bearer {token}"}
    refs: list[ConnectorDocumentRef] = []
    max_seen_ts: str | None = oldest
    reached_page_limit = False

    async with httpx.AsyncClient() as client:
        # 1. List all public channels the bot has access to
        channels: list[dict[str, Any]] = []
        next_cursor: str | None = None
        while True:
            params: dict[str, Any] = {
                "types": "public_channel",
                "exclude_archived": True,
                "limit": 200,
            }
            if next_cursor:
                params["cursor"] = next_cursor

            resp = await client.get(SLACK_CONVERSATIONS_LIST, headers=headers, params=params, timeout=30.0)
            data = resp.json()
            _check_slack_response(data, "enumeration")

            channels.extend(data.get("channels", []))
            next_cursor = data.get("response_metadata", {}).get("next_cursor") or None
            if not next_cursor:
                break

        log.debug("slack enumerate: found %d channels", len(channels))

        # Resume from the channel we were on if page_limit interrupted mid-channel
        resume_from = cursor_channel
        resume_active = resume_from is not None

        for channel in channels:
            channel_id: str = channel["id"]
            channel_name: str = channel.get("name", channel_id)

            # Skip channels until we reach the one we were interrupted on
            if resume_active:
                if channel_id != resume_from:
                    continue
                resume_active = False  # found the resume point, start processing

            history_cursor: str | None = None

            while True:
                remaining = max_messages - len(refs)
                if remaining <= 0:
                    break

                params = {
                    "channel": channel_id,
                    "limit": min(PAGE_SIZE, remaining),
                }
                if oldest:
                    params["oldest"] = oldest
                if history_cursor:
                    params["cursor"] = history_cursor

                resp = await client.get(
                    SLACK_CONVERSATIONS_HISTORY, headers=headers, params=params, timeout=30.0
                )
                data = resp.json()

                # Bot may not be in the channel — skip it gracefully
                if not data.get("ok") and data.get("error") in ("not_in_channel", "channel_not_found"):
                    log.debug("slack: skipping channel %s (%s)", channel_name, data.get("error"))
                    break

                _check_slack_response(data, "enumeration")

                messages: list[dict[str, Any]] = data.get("messages", [])
                for msg in messages:
                    if _is_skippable(msg):
                        continue
                    ref = _make_ref(msg, channel_id, channel_name)
                    refs.append(ref)

                    ts = msg["ts"]
                    if not max_seen_ts or ts > max_seen_ts:
                        max_seen_ts = ts

                    if len(refs) >= max_messages:
                        break

                history_cursor = data.get("response_metadata", {}).get("next_cursor") or None

                # If page_limit is set, return after processing one history page
                if page_limit is not None and len(refs) >= page_limit:
                    reached_page_limit = True
                    break

                if not history_cursor or len(refs) >= max_messages:
                    break

                await asyncio.sleep(1.0)  # avoid Slack rate limits between pages

            if reached_page_limit or len(refs) >= max_messages:
                break

            await asyncio.sleep(0.5)  # avoid Slack rate limits between channels

    # Build next checkpoint
    next_checkpoint: ConnectorCheckpoint | None = None
    if reached_page_limit and history_cursor:
        # Still more pages in the current channel — resume from same oldest
        next_checkpoint = ConnectorCheckpoint(
            cursor=oldest,
            extra={"channel_cursor": channel_id},
        )
    elif max_seen_ts and max_seen_ts != oldest:
        # Cursor advanced — there were new messages; save the new watermark
        next_checkpoint = ConnectorCheckpoint(
            cursor=max_seen_ts,
            extra={},
        )
    # else: no new messages — next_checkpoint stays None, enumeration is complete

    return ConnectorEnumerationResult(refs=refs, next_checkpoint=next_checkpoint)
