from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import app.sql.indexer as sql_indexer
from app.types.document_envelope import CanonicalDocumentEnvelope
from app.utils.security import sha256


@dataclass
class NormalizedDocument:
    document_id: str
    checksum: str
    word_count: int
    was_skipped: bool


async def normalize_document(
    conn,
    envelope: CanonicalDocumentEnvelope,
) -> NormalizedDocument:
    content = (envelope.content or "").strip().replace("\x00", "")[:500_000]
    checksum = envelope.checksum or sha256(f"{envelope.title or ''}::{content}")

    existing = await conn.fetchrow(
        sql_indexer.select_document_hash(envelope.connector_id, envelope.external_id)
    )
    if existing and existing["content_hash"] == checksum:
        return NormalizedDocument(document_id="", checksum=checksum, word_count=0, was_skipped=True)

    word_count = len([w for w in re.split(r"\s+", content) if w]) if content else 0

    # Prepare metadata dict — SQLAlchemy handles JSONB serialization automatically
    metadata = {
        **envelope.metadata,
        "connector_key": envelope.connector_key,
        "source_id": envelope.source_id,
    }

    # source_last_modified_at may arrive as ISO string or datetime; normalise to datetime
    mtime = _parse_dt(envelope.source_last_modified_at)

    row = await conn.fetchrow(
        sql_indexer.upsert_document(
            org_id=envelope.org_id,
            connector_id=envelope.connector_id,
            external_id=envelope.external_id,
            url=envelope.url,
            title=envelope.title,
            kind=envelope.kind,
            ext=envelope.ext,
            author_name=envelope.author_name,
            author_email=envelope.author_email,
            checksum=checksum,
            word_count=word_count,
            mtime=mtime,
            content_type=envelope.content_type,
            source_path=envelope.source_path,
            source_permissions=envelope.source_permissions,
            extraction_status=envelope.extraction_status,
            extraction_error_code=envelope.extraction_error_code,
            extraction_version=envelope.extraction_version,
            chunking_version=envelope.chunking_version,
            indexing_version=envelope.indexing_version,
            metadata=metadata,
        )
    )

    return NormalizedDocument(
        document_id=str(row["id"]),
        checksum=checksum,
        word_count=word_count,
        was_skipped=False,
    )


def _parse_dt(value: str | datetime | None) -> datetime | None:
    """Coerce ISO string or datetime to an aware datetime, or return None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
