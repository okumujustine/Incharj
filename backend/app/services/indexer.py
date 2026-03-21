from __future__ import annotations

from app.chunking.chunk_processor import process_chunks
from app.indexing.indexer import update_search_index
from app.normalization.normalizer import normalize_document
from app.types.document_envelope import (
    CHUNKING_VERSION,
    EXTRACTION_VERSION,
    INDEXING_VERSION,
    CanonicalDocumentEnvelope,
)
from app.utils.security import sha256


async def ingest_canonical_document(
    conn,
    document: CanonicalDocumentEnvelope,
) -> str:
    normalized = await normalize_document(conn, document)
    if normalized.was_skipped:
        return "skipped"

    content = (document.content or "").strip().replace("\x00", "")[:500_000]
    await process_chunks(conn, content, normalized.document_id, document.org_id)
    await update_search_index(conn, normalized.document_id)

    return "indexed"


async def ingest_document(
    conn,
    doc_data: dict,
    org_id: str,
    connector_id: str,
) -> str:
    title = doc_data.get("title") or ""
    content = doc_data.get("content") or ""
    metadata = doc_data.get("metadata") or {}
    mime_type = metadata.get("mime_type")

    return await ingest_canonical_document(
        conn,
        CanonicalDocumentEnvelope(
            org_id=org_id,
            connector_id=connector_id,
            connector_key="legacy",
            source_id=connector_id,
            external_id=doc_data.get("external_id", ""),
            url=doc_data.get("url"),
            title=title or None,
            kind=doc_data.get("kind"),
            ext=doc_data.get("ext"),
            content=content or None,
            content_type=str(mime_type) if mime_type else None,
            source_path=None,
            source_last_modified_at=(
                doc_data["mtime"].isoformat()
                if hasattr(doc_data.get("mtime"), "isoformat")
                else doc_data.get("mtime")
            ),
            author_name=doc_data.get("author_name"),
            author_email=doc_data.get("author_email"),
            checksum=sha256(f"{title}::{content}"),
            source_permissions=None,
            extraction_status="succeeded",
            extraction_error_code=None,
            extraction_version=EXTRACTION_VERSION,
            chunking_version=CHUNKING_VERSION,
            indexing_version=INDEXING_VERSION,
            metadata=metadata,
        ),
    )
