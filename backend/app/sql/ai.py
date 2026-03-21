from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import array, insert as pg_insert

from app.db.tables import embedding_cache


def select_embeddings_by_keys(keys: list[str]):
    return select(embedding_cache.c.cache_key, embedding_cache.c.embedding).where(
        embedding_cache.c.cache_key.in_(keys)
    )


def upsert_embedding_cache(
    cache_key: str,
    provider: str,
    model: str,
    dimensions: int,
    embedding: list,
):
    stmt = pg_insert(embedding_cache).values(
        cache_key=cache_key,
        provider=provider,
        model=model,
        dimensions=dimensions,
        embedding=embedding,
        updated_at=func.now(),
    )
    return stmt.on_conflict_do_update(
        index_elements=[embedding_cache.c.cache_key],
        set_={
            "embedding": stmt.excluded.embedding,
            "updated_at": func.now(),
        },
    )
