from __future__ import annotations

from typing import Any

import app.sql.ai as sql_ai
from app.ai.index import get_embedding_provider
from app.utils.security import sha256


def _build_cache_key(namespace: str, text: str) -> str:
    return f"{namespace}:{sha256(text)}"


async def embed_batch_cached(texts: list[str], conn) -> list[list[float]]:
    if not texts:
        return []

    provider = get_embedding_provider()
    if provider is None:
        return [[] for _ in texts]

    keys = [_build_cache_key(provider.cache_namespace, t) for t in texts]

    cached_rows = await conn.fetch(sql_ai.select_embeddings_by_keys(keys))
    cached_map: dict[str, list[float]] = {}
    for row in cached_rows:
        embedding = list(row["embedding"]) if row["embedding"] is not None else []
        if len(embedding) == provider.dimensions:
            cached_map[row["cache_key"]] = embedding

    missing_indices: list[int] = []
    missing_texts: list[str] = []
    for i, key in enumerate(keys):
        if key not in cached_map:
            missing_indices.append(i)
            missing_texts.append(texts[i])

    result: list[list[float]] = [[] for _ in texts]

    if missing_texts:
        fresh_embeddings = await provider.embed_batch(missing_texts)
        for miss_idx, orig_idx in enumerate(missing_indices):
            embedding = fresh_embeddings[miss_idx] if miss_idx < len(fresh_embeddings) else []
            if len(embedding) != provider.dimensions:
                raise ValueError(
                    f"Embedding dimension mismatch. Expected {provider.dimensions}, got {len(embedding)}"
                )
            result[orig_idx] = embedding
            # Pass the Python list directly — SQLAlchemy serialises it to JSONB
            await conn.execute(
                sql_ai.upsert_embedding_cache(
                    cache_key=keys[orig_idx],
                    provider=provider.name,
                    model=provider.model,
                    dimensions=provider.dimensions,
                    embedding=embedding,
                )
            )

    for i, key in enumerate(keys):
        if result[i]:
            continue
        result[i] = cached_map.get(key, [])

    return result


async def embed_one_cached(text: str, conn) -> list[float]:
    results = await embed_batch_cached([text], conn)
    return results[0] if results else []
