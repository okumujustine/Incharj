from __future__ import annotations

from typing import Any

from app.connectors.slack.constants import ABSOLUTE_MESSAGE_CAP


def parse_max_messages(value: Any) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return min(int(value), ABSOLUTE_MESSAGE_CAP)
    return ABSOLUTE_MESSAGE_CAP


def validate_slack_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        **config,
        "max_messages": parse_max_messages(config.get("max_messages")),
    }
