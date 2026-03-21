from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal


ConnectorAuthType = Literal["oauth2", "api_key", "none"]


@dataclass
class ConnectorRetryPolicy:
    max_attempts: int
    backoff_ms: int
    strategy: Literal["fixed", "exponential"]


@dataclass
class ConnectorManifest:
    key: str
    display_name: str
    auth_type: ConnectorAuthType
    supports_incremental: bool
    supports_acl: bool
    supported_content_types: list[str]
    max_page_size: int
    retry_policy: ConnectorRetryPolicy
    capabilities: dict[str, bool] = field(default_factory=dict)


@dataclass
class ConnectorCheckpoint:
    cursor: str | None = None
    modified_after: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorDocumentRef:
    external_id: str
    title: str | None = None
    url: str | None = None
    kind: str | None = None
    ext: str | None = None
    author_name: str | None = None
    author_email: str | None = None
    content_type: str | None = None
    source_path: str | None = None
    source_last_modified_at: str | None = None
    source_permissions: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorFetchedDocument:
    content: str | None
    content_type: str | None = None
    source_path: str | None = None
    source_permissions: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorPluginContext:
    org_id: str
    connector_id: str
    credentials: dict[str, Any]


@dataclass
class ConnectorEnumerateInput(ConnectorPluginContext):
    config: dict[str, Any] = field(default_factory=dict)
    checkpoint: ConnectorCheckpoint | None = None


@dataclass
class ConnectorFetchInput(ConnectorPluginContext):
    config: dict[str, Any] = field(default_factory=dict)
    ref: ConnectorDocumentRef = field(default_factory=lambda: ConnectorDocumentRef(""))


@dataclass
class ConnectorEnumerationResult:
    refs: list[ConnectorDocumentRef]
    next_checkpoint: ConnectorCheckpoint | None


class ConnectorPlugin:
    def validate_config(self, config: dict[str, Any] | None) -> dict[str, Any]:
        raise NotImplementedError

    async def enumerate(self, input: ConnectorEnumerateInput) -> ConnectorEnumerationResult:
        raise NotImplementedError

    async def fetch_document(self, input: ConnectorFetchInput) -> ConnectorFetchedDocument:
        raise NotImplementedError


class ConnectorAuthProvider:
    def authorize_url(self, state: str) -> str:
        raise NotImplementedError

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        raise NotImplementedError

    async def refresh_credentials(
        self, credentials: dict[str, Any]
    ) -> dict[str, Any] | None:
        return None


@dataclass
class ConnectorProvider:
    manifest: ConnectorManifest
    plugin: ConnectorPlugin
    auth: ConnectorAuthProvider
