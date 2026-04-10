from __future__ import annotations

from typing import Any


def _build_source_button(index: int, source: dict[str, Any]) -> dict[str, Any]:
    title = source.get("title", "Source")[:40]
    ref = source.get("ref", str(index))
    label = f"[{ref}] {title}"

    button: dict[str, Any] = {
        "type": "button",
        "text": {"type": "plain_text", "text": label, "emoji": False},
        "action_id": f"source_{index}",
    }
    url = source.get("url")
    if url:
        button["url"] = url
    return button


def build_answer_blocks(query: str, answer: str, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = [{
        "type": "section",
        "text": {"type": "mrkdwn", "text": answer},
    }]

    if sources:
        source_buttons = [_build_source_button(index, source) for index, source in enumerate(sources[:5], start=1)]
        if source_buttons:
            blocks.append({"type": "divider"})
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "*Sources*"}],
            })
            blocks.append({"type": "actions", "elements": source_buttons})

    return blocks
