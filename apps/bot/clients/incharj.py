from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True, slots=True)
class AIAnswer:
    answer: str
    sources: list[dict[str, Any]]


class IncharjAIClient:
    def __init__(self, api_url: str, org_id: str, timeout: float = 60.0) -> None:
        self._api_url = api_url.rstrip("/")
        self._org_id = org_id
        self._timeout = timeout

    async def search(self, query: str) -> AIAnswer:
        url = f"{self._api_url}/api/v1/search/ai-stream"
        payload = {"query": query, "org_id": self._org_id}

        chunks: list[str] = []
        sources: list[dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        return AIAnswer(f":warning: Search failed (status {response.status_code}).", [])

                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue

                        data = line[len("data:"):].strip()
                        if data == "[DONE]":
                            break

                        try:
                            parsed = json.loads(data)
                        except json.JSONDecodeError:
                            continue

                        new_sources = parsed.get("sources")
                        if isinstance(new_sources, list):
                            sources = new_sources

                        delta = parsed.get("delta", "")
                        if delta:
                            chunks.append(delta)
        except httpx.HTTPError:
            return AIAnswer(":warning: Search failed because the bot could not reach the API.", [])

        answer = "".join(chunks) or "_No results found._"
        return AIAnswer(answer=answer, sources=sources)
