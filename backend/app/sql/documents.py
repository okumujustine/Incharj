from __future__ import annotations

from sqlalchemy import delete, select

from app.db.tables import document_chunks, documents

_DOC_COLS = [
    documents.c.id,
    documents.c.org_id,
    documents.c.connector_id,
    documents.c.external_id,
    documents.c.url,
    documents.c.title,
    documents.c.kind,
    documents.c.ext,
    documents.c.author_name,
    documents.c.author_email,
    documents.c.content_hash,
    documents.c.checksum,
    documents.c.content_type,
    documents.c.source_path,
    documents.c.source_last_modified_at,
    documents.c.source_permissions,
    documents.c.extraction_status,
    documents.c.extraction_error_code,
    documents.c.extraction_version,
    documents.c.chunking_version,
    documents.c.indexing_version,
    documents.c.word_count,
    documents.c.mtime,
    documents.c.indexed_at,
    documents.c.metadata,
]


def select_document_by_id(document_id, org_id):
    return select(*_DOC_COLS).where(
        documents.c.id == document_id, documents.c.org_id == org_id
    )


def select_document_chunks(document_id):
    return (
        select(
            document_chunks.c.id,
            document_chunks.c.document_id,
            document_chunks.c.chunk_index,
            document_chunks.c.content,
            document_chunks.c.token_count,
            document_chunks.c.created_at,
        )
        .where(document_chunks.c.document_id == document_id)
        .order_by(document_chunks.c.chunk_index.asc())
    )


def delete_document(document_id, org_id):
    return (
        delete(documents)
        .where(documents.c.id == document_id, documents.c.org_id == org_id)
        .returning(documents.c.id)
    )
