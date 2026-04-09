from __future__ import annotations

import json
from typing import AsyncIterator, Optional

import anthropic
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.db.pool import get_pool
from app.middleware.auth import get_current_membership, get_current_user
from app.services.search_service import full_text_search

router = APIRouter()


# ---------------------------------------------------------------------------
# AI streaming search
# ---------------------------------------------------------------------------

class AiSearchRequest(BaseModel):
    query: str
    org_id: str


def _build_context(results: list[dict]) -> str:
    if not results:
        return "No documents found."
    lines = []
    for i, r in enumerate(results, 1):
        title = r.get("title") or "Untitled"
        snippet = (r.get("snippet") or "").strip()
        url = r.get("url") or ""
        lines.append(f"[{i}] {title}\n{snippet}\nSource: {url}")
    return "\n\n".join(lines)


async def _stream_claude(query: str, context: str) -> AsyncIterator[str]:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = (
        "You are Incharj, an AI assistant that helps teams find information "
        "from their connected documents and Slack conversations. "
        "Answer concisely based on the provided context. "
        "If the context doesn't contain enough information, say so."
    )
    user_message = f"Context from search results:\n\n{context}\n\nQuestion: {query}"

    async with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        async for text in stream.text_stream:
            yield f"data: {json.dumps({'delta': text})}\n\n"

    yield "data: [DONE]\n\n"


@router.post("/search/ai-stream")
async def ai_search_stream(body: AiSearchRequest) -> StreamingResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await full_text_search(conn, {
            "org_id": body.org_id,
            "query": body.query,
            "limit": 5,
            "offset": 0,
        })

    context = _build_context(result.get("results", []))

    return StreamingResponse(
        _stream_claude(body.query, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/orgs/{org_slug}/search")
async def search(
    org_slug: str,
    q: str = Query(..., min_length=1),
    connector_id: Optional[str] = Query(default=None),
    kind: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> dict:
    membership = await get_current_membership(org_slug, str(current_user["id"]))

    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await full_text_search(conn, {
            "org_id": str(membership["org_id"]),
            "query": q,
            "connector_id": connector_id,
            "kind": kind,
            "from_date": date_from,
            "to_date": date_to,
            "limit": limit,
            "offset": offset,
        })

    return result
