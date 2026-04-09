from __future__ import annotations

import logging
from typing import Any

import httpx

from app.connectors.plugin_types import ConnectorFetchInput, ConnectorFetchedDocument
from app.connectors.slack.constants import (
    SKIP_SUBTYPES,
    SLACK_CONVERSATIONS_HISTORY,
    SLACK_CONVERSATIONS_REPLIES,
)

log = logging.getLogger("slack-connector")


def _bot_token(credentials: dict[str, Any]) -> str:
    return credentials.get("bot_token") or credentials.get("token", "")


def _format_message(msg: dict[str, Any]) -> str:
    """Return a plain-text representation of a single Slack message."""
    user = msg.get("user") or msg.get("username") or "unknown"
    text = (msg.get("text") or "").strip()
    ts = msg.get("ts", "")
    return f"[{user} @ {ts}]: {text}" if text else ""


async def fetch_slack_document(input: ConnectorFetchInput) -> ConnectorFetchedDocument:
    token = _bot_token(input.credentials)
    if not token:
        from app.types.sync_errors import SyncErrorCode, SyncPipelineError
        raise SyncPipelineError(
            code=SyncErrorCode.UNAUTHORIZED,
            stage="fetch",
            message="Slack bot token is missing from credentials",
            retriable=False,
        )

    metadata = input.ref.metadata or {}
    channel_id: str = metadata.get("channel_id", "")
    ts: str = metadata.get("ts", "")
    thread_ts: str | None = metadata.get("thread_ts")
    is_thread_root: bool = metadata.get("is_thread_root", False)
    channel_name: str = metadata.get("channel_name", channel_id)

    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        if is_thread_root and thread_ts:
            # Fetch the full thread (root + all replies)
            resp = await client.get(
                SLACK_CONVERSATIONS_REPLIES,
                headers=headers,
                params={"channel": channel_id, "ts": thread_ts, "limit": 200},
                timeout=30.0,
            )
            data = resp.json()

            if not data.get("ok"):
                error = data.get("error", "unknown")
                if error in ("invalid_auth", "not_authed", "token_revoked"):
                    from app.types.sync_errors import SyncErrorCode, SyncPipelineError
                    raise SyncPipelineError(
                        code=SyncErrorCode.UNAUTHORIZED,
                        stage="fetch",
                        message=f"Slack auth error: {error}",
                        retriable=False,
                    )
                if error in ("message_not_found", "channel_not_found"):
                    return ConnectorFetchedDocument(
                        content=None,
                        content_type="text/plain",
                        metadata={**metadata, "fetch_status": "not_found"},
                    )
                from app.types.sync_errors import SyncErrorCode, SyncPipelineError
                raise SyncPipelineError(
                    code=SyncErrorCode.FETCH_FAILED,
                    stage="fetch",
                    message=f"Slack API error: {error}",
                    retriable=error == "ratelimited",
                )

            messages = data.get("messages", [])
            lines = []
            for msg in messages:
                if msg.get("subtype") in SKIP_SUBTYPES:
                    continue
                line = _format_message(msg)
                if line:
                    lines.append(line)

            content = f"Thread in #{channel_name}\n\n" + "\n".join(lines) if lines else None

        else:
            # Single message — fetch it directly from channel history
            resp = await client.get(
                SLACK_CONVERSATIONS_HISTORY,
                headers=headers,
                params={"channel": channel_id, "latest": ts, "oldest": ts, "inclusive": True, "limit": 1},
                timeout=30.0,
            )
            data = resp.json()

            if not data.get("ok"):
                error = data.get("error", "unknown")
                if error in ("invalid_auth", "not_authed", "token_revoked"):
                    from app.types.sync_errors import SyncErrorCode, SyncPipelineError
                    raise SyncPipelineError(
                        code=SyncErrorCode.UNAUTHORIZED,
                        stage="fetch",
                        message=f"Slack auth error: {error}",
                        retriable=False,
                    )
                return ConnectorFetchedDocument(
                    content=None,
                    content_type="text/plain",
                    metadata={**metadata, "fetch_status": "not_found"},
                )

            messages = data.get("messages", [])
            if not messages:
                return ConnectorFetchedDocument(
                    content=None,
                    content_type="text/plain",
                    metadata={**metadata, "fetch_status": "not_found"},
                )

            msg = messages[0]
            line = _format_message(msg)
            content = f"#{channel_name}\n\n{line}" if line else None

    return ConnectorFetchedDocument(
        content=content,
        content_type="text/plain",
        metadata=metadata,
    )
