from __future__ import annotations

from app.connectors.plugin_types import ConnectorProvider

_registry: dict[str, ConnectorProvider] = {}


def register_connector_provider(kind: str, provider: ConnectorProvider) -> None:
    _registry[kind] = provider


def get_connector_provider(kind: str) -> ConnectorProvider:
    if kind not in _registry:
        raise KeyError(f"Unknown connector provider: {kind}")
    return _registry[kind]


def load_connectors() -> None:
    import app.connectors.google_drive.index  # noqa: F401
    import app.connectors.slack.index  # noqa: F401
