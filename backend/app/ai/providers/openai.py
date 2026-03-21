from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger("ai-openai")


class OpenAIEmbeddingProvider:
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        dimensions: int,
        base_url: str = "https://api.openai.com/v1",
        max_attempts: int = 4,
        retry_base_delay_ms: int = 300,
        batch_size: int = 64,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions
        self.cache_namespace = f"{self.name}:{model}:{dimensions}"
        self.base_url = base_url.rstrip("/")
        self.max_attempts = max(1, max_attempts)
        self.retry_base_delay_ms = max(50, retry_base_delay_ms)
        self.batch_size = max(1, batch_size)

    async def embed_one(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0] if results else []

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        all_embeddings: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            embeddings = await self._embed_batch_with_retry(batch)
            all_embeddings.extend(embeddings)
        return all_embeddings

    async def _embed_batch_with_retry(self, texts: list[str]) -> list[list[float]]:
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                return await self._embed_batch_once(texts)
            except Exception as exc:
                last_error = exc
                if attempt >= self.max_attempts:
                    break
                status = getattr(exc, "status_code", None)
                retriable = status is None or status == 429 or status >= 500
                if not retriable:
                    break
                delay_s = self.retry_base_delay_ms * (2 ** (attempt - 1)) / 1000
                log.warning(
                    "embedding batch retrying attempt=%d max=%d delay=%.2fs err=%s",
                    attempt,
                    self.max_attempts,
                    delay_s,
                    exc,
                )
                await asyncio.sleep(delay_s)
        raise last_error or RuntimeError("Embedding request failed")

    async def _embed_batch_once(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/embeddings",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                json={"model": self.model, "input": texts, "dimensions": self.dimensions},
                timeout=60.0,
            )
        if response.status_code != 200:
            err = RuntimeError(
                f"Embedding API failed ({response.status_code}): {response.text}"
            )
            err.status_code = response.status_code  # type: ignore[attr-defined]
            raise err
        payload = response.json()
        items = sorted(payload["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in items]
