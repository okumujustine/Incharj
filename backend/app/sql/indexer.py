from __future__ import annotations

from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.tables import document_chunks, documents


def select_document_hash(connector_id, external_id: str):
    return select(documents.c.content_hash).where(
        documents.c.connector_id == connector_id,
        documents.c.external_id == external_id,
    )


def upsert_document(
    org_id,
    connector_id,
    external_id: str,
    url: str | None,
    title: str | None,
    kind: str | None,
    ext: str | None,
    author_name: str | None,
    author_email: str | None,
    checksum: str | None,
    word_count: int | None,
    mtime,
    content_type: str | None,
    source_path: str | None,
    source_permissions: dict | None,
    extraction_status: str,
    extraction_error_code: str | None,
    extraction_version: int,
    chunking_version: int,
    indexing_version: int,
    metadata: dict | None,
):
    stmt = pg_insert(documents).values(
        org_id=org_id,
        connector_id=connector_id,
        external_id=external_id,
        url=url,
        title=title,
        kind=kind,
        ext=ext,
        author_name=author_name,
        author_email=author_email,
        content_hash=checksum,
        checksum=checksum,
        word_count=word_count,
        mtime=mtime,
        source_last_modified_at=mtime,
        content_type=content_type,
        source_path=source_path,
        source_permissions=source_permissions,
        extraction_status=extraction_status,
        extraction_error_code=extraction_error_code,
        extraction_version=extraction_version,
        chunking_version=chunking_version,
        indexing_version=indexing_version,
        metadata=metadata,
        indexed_at=func.now(),
    )
    return stmt.on_conflict_do_update(
        constraint="uq_document_connector_external",
        set_={
            "url": stmt.excluded.url,
            "title": stmt.excluded.title,
            "kind": stmt.excluded.kind,
            "ext": stmt.excluded.ext,
            "author_name": stmt.excluded.author_name,
            "author_email": stmt.excluded.author_email,
            "content_hash": stmt.excluded.content_hash,
            "checksum": stmt.excluded.checksum,
            "word_count": stmt.excluded.word_count,
            "mtime": stmt.excluded.mtime,
            "source_last_modified_at": stmt.excluded.source_last_modified_at,
            "content_type": stmt.excluded.content_type,
            "source_path": stmt.excluded.source_path,
            "source_permissions": stmt.excluded.source_permissions,
            "extraction_status": stmt.excluded.extraction_status,
            "extraction_error_code": stmt.excluded.extraction_error_code,
            "extraction_version": stmt.excluded.extraction_version,
            "chunking_version": stmt.excluded.chunking_version,
            "indexing_version": stmt.excluded.indexing_version,
            "metadata": stmt.excluded.metadata,
            "indexed_at": func.now(),
        },
    ).returning(documents.c.id)


def delete_document_chunks(document_id):
    return delete(document_chunks).where(document_chunks.c.document_id == document_id)


def insert_document_chunk(
    document_id,
    org_id,
    chunk_index: int,
    content: str,
    token_count: int | None,
    embedding: list | None,
):
    return insert(document_chunks).values(
        document_id=document_id,
        org_id=org_id,
        chunk_index=chunk_index,
        content=content,
        token_count=token_count,
        embedding=embedding,
        search_vector=func.to_tsvector("english", func.left(content, 50000)),
    )


def update_document_search_vector(document_id):
    return (
        update(documents)
        .where(documents.c.id == document_id)
        .values(
            search_vector=text("setweight(to_tsvector('english', coalesce(title, '')), 'A'::\"char\")")
        )
    )
