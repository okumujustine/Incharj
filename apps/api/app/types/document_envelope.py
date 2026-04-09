from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

EXTRACTION_VERSION = 1
CHUNKING_VERSION = 1
INDEXING_VERSION = 1


@dataclass
class CanonicalDocumentEnvelope:
    org_id: str
    connector_id: str
    connector_key: str
    source_id: str
    external_id: str
    checksum: str
    extraction_status: Literal["succeeded", "failed", "empty"]
    extraction_version: int
    chunking_version: int
    indexing_version: int
    url: str | None = None
    title: str | None = None
    kind: str | None = None
    ext: str | None = None
    content: str | None = None
    content_type: str | None = None
    source_path: str | None = None
    source_last_modified_at: str | None = None
    author_name: str | None = None
    author_email: str | None = None
    source_permissions: dict[str, Any] | None = None
    extraction_error_code: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
