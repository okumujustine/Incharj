from __future__ import annotations

from typing import Protocol


class EmbeddingProvider(Protocol):
    name: str
    model: str
    dimensions: int
    cache_namespace: str

    async def embed_one(self, text: str) -> list[float]: ...
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...
