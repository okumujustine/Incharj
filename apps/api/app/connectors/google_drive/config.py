from __future__ import annotations

from typing import Any

from app.connectors.google_drive.constants import ABSOLUTE_CONNECTOR_DOC_CAP, GOOGLE_DRIVE_FILE_TYPES


def parse_max_documents(value: Any) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return min(int(value), ABSOLUTE_CONNECTOR_DOC_CAP)
    return ABSOLUTE_CONNECTOR_DOC_CAP


def normalize_file_types(value: Any) -> list[str]:
    all_ids = [t["id"] for t in GOOGLE_DRIVE_FILE_TYPES]
    if not isinstance(value, list):
        return all_ids
    allowed = set(all_ids)
    selected = [item for item in value if isinstance(item, str) and item in allowed]
    return selected if selected else all_ids


def build_mime_types(config_data: dict[str, Any]) -> list[str]:
    enabled_ids = normalize_file_types(config_data.get("file_types"))
    enabled_set = set(enabled_ids)
    return [t["mime_type"] for t in GOOGLE_DRIVE_FILE_TYPES if t["id"] in enabled_set]


def validate_google_config(config_data: dict[str, Any]) -> dict[str, Any]:
    return {
        **config_data,
        "file_types": normalize_file_types(config_data.get("file_types")),
        "max_documents": parse_max_documents(config_data.get("max_documents")),
    }
