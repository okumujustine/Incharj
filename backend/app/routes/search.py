from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.db.pool import get_pool
from app.errors import NotFoundError
from app.middleware.auth import get_current_membership, get_current_user
from app.services.search_service import full_text_search

router = APIRouter()


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
