from __future__ import annotations

import httpx


async def get_json(url: str, headers: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()