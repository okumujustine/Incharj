from __future__ import annotations

import json
from typing import Optional

from openai import AsyncOpenAI
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.db.pool import get_pool
from app.middleware.auth import get_current_membership, get_current_user
from app.services.search_service import full_text_search
from app.services import conversation_service

router = APIRouter()

class AiSearchRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str
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
def _build_sources(results: list[dict]) -> list[dict]:
    sources = []
    for i, r in enumerate(results, 1):
        sources.append({
            "ref": i,
            "title": r.get("title") or "Untitled",
            "url": r.get("url"),
            "snippet": r.get("snippet") or "",
            "connector": r.get("connector_kind") or "",
            "kind": r.get("kind") or "",
            "location": r.get("connector_name") or "",
        })
    return sources
async def _rewrite_query(
    message: str,
    history: list[dict],
    client: AsyncOpenAI,
) -> str:
    """
    Rewrite a follow-up question into a standalone search query.
    Only called when there is prior history (i.e. it's a follow-up).
    """
    if not history:
        return message

    context_lines = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in history[-4:]
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=80,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "Rewrite the user's latest question as a concise, self-contained "
                    "search query that captures the full intent, incorporating any "
                    "necessary context from the conversation. "
                    "Return ONLY the rewritten query — no explanation, no punctuation changes."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation so far:\n{context_lines}\n\n"
                    f"Latest question: {message}\n\n"
                    "Standalone search query:"
                ),
            },
        ],
    )
    rewritten = (response.choices[0].message.content or "").strip()
    return rewritten or message
def _build_messages(
    history: list[dict],
    context: str,
    message: str,
) -> list[dict]:
    system = (
        "You are Incharj, an AI assistant that helps teams find information "
        "from their connected documents and Slack conversations. "
        "Answer concisely based on the provided context. "
        "If the context doesn't contain enough information, say so clearly. "
        "Maintain conversation continuity when answering follow-up questions."
    )
    messages: list[dict] = [{"role": "system", "content": system}]

    # Include prior turns (exclude the very last user message — we inject it below with context)
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})

    # Current user message enriched with retrieved context
    messages.append({
        "role": "user",
        "content": f"Context from search results:\n\n{context}\n\nQuestion: {message}",
    })
    return messages

@router.post("/search/ai-stream")
async def ai_search_stream(
    body: AiSearchRequest,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    user_id = str(current_user["id"])
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1. Get or create conversation (backend owns state)
        conv_id = await conversation_service.get_or_create(
            conn, body.org_id, user_id, body.conversation_id
        )

        # 2. Load prior history from DB (never trust the frontend for this)
        history = await conversation_service.load_history(conn, conv_id, limit=10)

        # 3. Persist the incoming user message
        await conversation_service.add_message(conn, conv_id, "user", body.message)

        # 4. Rewrite query for retrieval if this is a follow-up
        search_query = await _rewrite_query(body.message, history, client)

        # 5. Retrieve relevant documents
        result = await full_text_search(conn, {
            "org_id": body.org_id,
            "query": search_query,
            "limit": 5,
            "offset": 0,
        })

    context = _build_context(result.get("results", []))
    sources = _build_sources(result.get("results", []))
    messages = _build_messages(history, context, body.message)

    async def generate():
        # First event: return the conversation ID so the frontend can track it
        yield f"data: {json.dumps({'conversation_id': conv_id})}\n\n"

        # Second event: sources (available immediately, before LLM starts)
        if sources:
            yield f"data: {json.dumps({'sources': sources})}\n\n"

        # Stream the LLM response, accumulating full text for persistence
        full_response = ""

        stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=1024,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                full_response += delta
                yield f"data: {json.dumps({'delta': delta})}\n\n"

        # Persist assistant message before signalling done
        async with (await get_pool()).acquire() as conn2:
            await conversation_service.add_message(
                conn2,
                conv_id,
                "assistant",
                full_response,
                retrieval_metadata={
                    "sources": sources,
                    "search_query": search_query,
                    "original_message": body.message,
                },
            )

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
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
