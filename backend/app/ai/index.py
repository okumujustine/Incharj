from __future__ import annotations

from app.ai.types import EmbeddingProvider

_UNSET = object()
_cached_provider: object = _UNSET


def get_embedding_provider() -> EmbeddingProvider | None:
    global _cached_provider
    if _cached_provider is not _UNSET:
        return _cached_provider  # type: ignore[return-value]

    from app.core.config import settings

    if not settings.semantic_search_enabled:
        _cached_provider = None
        return None

    if settings.embedding_provider == "openai" and settings.openai_api_key:
        from app.ai.providers.openai import OpenAIEmbeddingProvider

        _cached_provider = OpenAIEmbeddingProvider(
            api_key=settings.openai_api_key,
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
            base_url=settings.openai_base_url,
            max_attempts=settings.embedding_request_max_attempts,
            retry_base_delay_ms=settings.embedding_retry_base_delay_ms,
            batch_size=settings.embedding_batch_size,
        )
        return _cached_provider  # type: ignore[return-value]

    _cached_provider = None
    return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
