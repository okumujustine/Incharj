from __future__ import annotations

from typing import Any

from app.connectors.plugin_types import (
    ConnectorAuthProvider,
    ConnectorEnumerateInput,
    ConnectorFetchInput,
    ConnectorManifest,
    ConnectorPlugin,
    ConnectorProvider,
    ConnectorRetryPolicy,
)
from app.connectors.registry import register_connector_provider
from app.connectors.slack.config import validate_slack_config
from app.connectors.slack.enumerate import enumerate_slack
from app.connectors.slack.fetch import fetch_slack_document


class _SlackAuthProvider(ConnectorAuthProvider):
    """Slack uses a pre-supplied bot token (xoxb-...) — no OAuth flow."""

    def authorize_url(self, state: str) -> str:
        raise NotImplementedError("Slack connector uses api_key auth; no OAuth URL")

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        raise NotImplementedError("Slack connector uses api_key auth; no code exchange")

    async def refresh_credentials(
        self, credentials: dict[str, Any]
    ) -> dict[str, Any] | None:
        # Bot tokens don't expire; nothing to refresh.
        return None


class _SlackPlugin(ConnectorPlugin):
    def validate_config(self, config: dict[str, Any] | None) -> dict[str, Any]:
        return validate_slack_config(config or {})

    async def enumerate(self, input: ConnectorEnumerateInput):
        return await enumerate_slack(input)

    async def fetch_document(self, input: ConnectorFetchInput):
        return await fetch_slack_document(input)


_slack_provider = ConnectorProvider(
    manifest=ConnectorManifest(
        key="slack",
        display_name="Slack",
        auth_type="api_key",
        supports_incremental=True,
        supports_acl=False,
        supported_content_types=["text/plain"],
        max_page_size=200,
        retry_policy=ConnectorRetryPolicy(
            max_attempts=3,
            backoff_ms=2000,
            strategy="exponential",
        ),
        capabilities={
            "supports_binary_content": False,
            "supports_delete_events": False,
            "supports_webhooks": False,
            "supports_per_document_permissions": False,
        },
    ),
    plugin=_SlackPlugin(),
    auth=_SlackAuthProvider(),
)

register_connector_provider(_slack_provider.manifest.key, _slack_provider)


def register_slack_connector() -> None:
    pass  # Already registered at module load time
