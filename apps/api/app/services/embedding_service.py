from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select, update

from app.ai.embedder import embed_batch_cached
from app.ai.index import get_embedding_provider
from app.db.tables import document_chunks, documents

log = logging.getLogger("embedding-service")


@dataclass
class EmbedDocumentResult:
    document_id: str
    total_chunks: int
    embedded_chunks: int
    skipped_chunks: int
    status: Literal["success", "no-chunks", "embeddings-disabled", "failed"]


async def embed_document(
    conn,
    document_id: str,
    org_id: str,
) -> EmbedDocumentResult:
    provider = get_embedding_provider()
    if provider is None:
        log.warning("Embeddings disabled, skipping document_id=%s", document_id)
        return EmbedDocumentResult(
            document_id=document_id,
            total_chunks=0,
            embedded_chunks=0,
            skipped_chunks=0,
            status="embeddings-disabled",
        )

    stmt = (
        select(
            document_chunks.c.id,
            document_chunks.c.content,
            document_chunks.c.embedding,
            document_chunks.c.chunk_index,
        )
        .where(
            document_chunks.c.document_id == document_id,
            document_chunks.c.org_id == org_id,
        )
        .order_by(document_chunks.c.chunk_index.asc())
    )
    chunks = await conn.fetch(stmt)

    if not chunks:
        log.info("No chunks found for document_id=%s", document_id)
        return EmbedDocumentResult(
            document_id=document_id,
            total_chunks=0,
            embedded_chunks=0,
            skipped_chunks=0,
            status="no-chunks",
        )

    unembed = [
        {"id": str(row["id"]), "content": row["content"], "index": row["chunk_index"]}
        for row in chunks
        if not row["embedding"]
    ]

    if not unembed:
        log.info("All chunks already embedded document_id=%s total=%d", document_id, len(chunks))
        return EmbedDocumentResult(
            document_id=document_id,
            total_chunks=len(chunks),
            embedded_chunks=0,
            skipped_chunks=len(chunks),
            status="success",
        )

    log.info(
        "Starting embedding batch document_id=%s total=%d unembedded=%d",
        document_id,
        len(chunks),
        len(unembed),
    )

    texts = [c["content"] for c in unembed]
    embeddings = await embed_batch_cached(texts, conn)

    for i, chunk in enumerate(unembed):
        embedding = embeddings[i] if i < len(embeddings) else []
        # Pass the Python list directly — SQLAlchemy handles JSONB serialisation.
        # Use None when there is no embedding so the column stays NULL.
        embedding_value = embedding if embedding else None
        await conn.execute(
            update(document_chunks)
            .where(document_chunks.c.id == chunk["id"])
            .values(embedding=embedding_value)
        )

    log.info(
        "Document embedding complete document_id=%s total=%d embedded=%d",
        document_id,
        len(chunks),
        len(unembed),
    )

    return EmbedDocumentResult(
        document_id=document_id,
        total_chunks=len(chunks),
        embedded_chunks=len(unembed),
        skipped_chunks=len(chunks) - len(unembed),
        status="success",
    )


async def embed_organization(
    conn,
    org_id: str,
) -> dict[str, Any]:
    log.info("Starting organization-wide embedding org_id=%s", org_id)

    doc_rows = await conn.fetch(
        select(documents.c.id)
        .where(documents.c.org_id == org_id)
        .order_by(documents.c.indexed_at.desc())
    )

    results: list[EmbedDocumentResult] = []
    total_chunks = 0
    failed_count = 0

    for row in doc_rows:
        doc_id = str(row["id"])
        try:
            result = await embed_document(conn, doc_id, org_id)
            results.append(result)
            total_chunks += result.total_chunks
        except Exception as exc:
            log.error("Failed to embed document doc_id=%s error=%s", doc_id, exc)
            failed_count += 1
            results.append(
                EmbedDocumentResult(
                    document_id=doc_id,
                    total_chunks=0,
                    embedded_chunks=0,
                    skipped_chunks=0,
                    status="failed",
                )
            )

    embedded_count = sum(1 for r in results if r.embedded_chunks > 0)
    return {
        "total_documents": len(doc_rows),
        "embedded_documents": embedded_count,
        "failed_documents": failed_count,
        "total_chunks": total_chunks,
        "embeddings": [vars(r) for r in results],
    }


async def embed_connector(
    conn,
    org_id: str,
    connector_id: str,
) -> dict[str, Any]:
    log.info("Starting connector embedding org_id=%s connector_id=%s", org_id, connector_id)

    doc_rows = await conn.fetch(
        select(documents.c.id)
        .where(documents.c.org_id == org_id, documents.c.connector_id == connector_id)
        .order_by(documents.c.indexed_at.desc())
    )

    results: list[EmbedDocumentResult] = []
    total_chunks = 0
    failed_count = 0

    for row in doc_rows:
        doc_id = str(row["id"])
        try:
            result = await embed_document(conn, doc_id, org_id)
            results.append(result)
            total_chunks += result.total_chunks
        except Exception as exc:
            log.error(
                "Failed to embed document doc_id=%s connector_id=%s error=%s",
                doc_id,
                connector_id,
                exc,
            )
            failed_count += 1
            results.append(
                EmbedDocumentResult(
                    document_id=doc_id,
                    total_chunks=0,
                    embedded_chunks=0,
                    skipped_chunks=0,
                    status="failed",
                )
            )

    embedded_count = sum(1 for r in results if r.embedded_chunks > 0)
    return {
        "total_documents": len(doc_rows),
        "embedded_documents": embedded_count,
        "failed_documents": failed_count,
        "total_chunks": total_chunks,
        "embeddings": [vars(r) for r in results],
    }
