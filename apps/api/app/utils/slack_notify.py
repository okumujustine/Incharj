from __future__ import annotations

import logging

log = logging.getLogger("slack-notify")

_CONNECTOR_LABELS = {
    "google_drive": "Google Drive",
    "slack": "Slack",
}

_STAGE_EMOJI = {
    "started": ":arrows_counterclockwise:",
    "done": ":white_check_mark:",
    "failed": ":x:",
    "cancelled": ":no_entry_sign:",
}


def _label(kind: str) -> str:
    return _CONNECTOR_LABELS.get(kind, kind.replace("_", " ").title())


async def notify_sync(
    kind: str,
    stage: str,
    *,
    docs_indexed: int | None = None,
    docs_skipped: int | None = None,
    docs_errored: int | None = None,
    error_message: str | None = None,
) -> None:
    """Post a sync lifecycle notification to the configured Slack channel.

    Silently no-ops if SLACK_BOT_TOKEN or SLACK_NOTIFY_CHANNEL is not set.
    """
    from app.core.config import settings

    token = settings.slack_bot_token
    channel = settings.slack_notify_channel
    if not token or not channel:
        return

    source = _label(kind)
    emoji = _STAGE_EMOJI.get(stage, ":information_source:")

    if stage == "started":
        text = f"{emoji} *Sync started* — syncing *{source}*"
    elif stage == "done":
        parts = []
        if docs_indexed:
            parts.append(f"{docs_indexed} indexed")
        if docs_skipped:
            parts.append(f"{docs_skipped} unchanged")
        if docs_errored:
            parts.append(f"{docs_errored} failed")
        summary = ", ".join(parts) if parts else "no new documents"
        text = f"{emoji} *Sync complete* — *{source}* — {summary}"
    elif stage == "failed":
        reason = error_message or "unknown error"
        text = f"{emoji} *Sync failed* — *{source}* — {reason}"
    elif stage == "cancelled":
        text = f"{emoji} *Sync cancelled* — *{source}*"
    else:
        text = f"{emoji} *{source}* sync: {stage}"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"channel": channel, "text": text, "mrkdwn": True},
            )
    except Exception as exc:
        log.warning("slack_notify failed: %s", exc)
