from __future__ import annotations

from typing import Any

import httpx

from app.connectors.google_drive.auth import read_access_token
from app.connectors.google_drive.config import validate_google_config
from app.connectors.google_drive.constants import (
    GOOGLE_AUTH_URL,
    GOOGLE_DRIVE_FILE_TYPES,
    GOOGLE_TOKEN_URL,
)
from app.connectors.google_drive.enumerate import enumerate_google_drive
from app.connectors.google_drive.fetch import fetch_google_document
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
from app.core.config import settings


class _GoogleDriveAuthProvider(ConnectorAuthProvider):
    def authorize_url(self, state: str) -> str:
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": f"{settings.frontend_url}/oauth/google_drive/callback",
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive.readonly openid email",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{GOOGLE_AUTH_URL}?{query}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=30.0,
            )
        if response.status_code != 200:
            raise RuntimeError(response.text)
        return response.json()

    async def refresh_credentials(
        self, credentials: dict[str, Any]
    ) -> dict[str, Any] | None:
        refresh_token = credentials.get("refresh_token")
        if not isinstance(refresh_token, str):
            return None
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=30.0,
            )
        if response.status_code != 200:
            return None
        refreshed = response.json()
        return {**credentials, **refreshed}


class _GoogleDrivePlugin(ConnectorPlugin):
    def validate_config(self, config: dict[str, Any] | None) -> dict[str, Any]:
        return validate_google_config(config or {})

    async def enumerate(self, input: ConnectorEnumerateInput):
        return await enumerate_google_drive(input)

    async def fetch_document(self, input: ConnectorFetchInput):
        return await fetch_google_document(input)


_google_drive_provider = ConnectorProvider(
    manifest=ConnectorManifest(
        key="google_drive",
        display_name="Google Drive",
        auth_type="oauth2",
        supports_incremental=True,
        supports_acl=False,
        supported_content_types=[t["mime_type"] for t in GOOGLE_DRIVE_FILE_TYPES],
        max_page_size=20,
        retry_policy=ConnectorRetryPolicy(
            max_attempts=3,
            backoff_ms=2000,
            strategy="exponential",
        ),
        capabilities={
            "supports_binary_content": True,
            "supports_delete_events": False,
            "supports_webhooks": False,
            "supports_per_document_permissions": False,
        },
    ),
    plugin=_GoogleDrivePlugin(),
    auth=_GoogleDriveAuthProvider(),
)

register_connector_provider(_google_drive_provider.manifest.key, _google_drive_provider)


def register_google_drive_connector() -> None:
    pass  # Already registered at module load time
