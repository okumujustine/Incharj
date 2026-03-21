from __future__ import annotations

from dataclasses import dataclass

import app.sql.indexer as sql_indexer
from app.ai.embedder import embed_batch_cached
from app.utils.chunker import approximate_token_count, chunk_text


@dataclass
class ProcessedChunk:
    index: int
    text: str
    token_count: int


async def process_chunks(
    conn,
    content: str | None,
    document_id: str,
    org_id: str,
) -> list[ProcessedChunk]:
    await conn.execute(sql_indexer.delete_document_chunks(document_id))

    chunks = chunk_text(content, 800, 100) if content else []
    processed: list[ProcessedChunk] = []

    embeddings = await embed_batch_cached(chunks, conn) if chunks else []

    for index, text in enumerate(chunks):
        token_count = approximate_token_count(text)
        # Pass the Python list directly — SQLAlchemy handles JSONB serialisation.
        # None is passed when there is no embedding so the column stays NULL.
        embedding = embeddings[index] if index < len(embeddings) else None
        # Treat an empty list the same as None
        embedding_value = embedding if embedding else None

        await conn.execute(
            sql_indexer.insert_document_chunk(
                document_id=document_id,
                org_id=org_id,
                chunk_index=index,
                content=text,
                token_count=token_count,
                embedding=embedding_value,
            )
        )
        processed.append(ProcessedChunk(index=index, text=text, token_count=token_count))

    return processed
