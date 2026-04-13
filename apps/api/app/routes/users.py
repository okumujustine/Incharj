from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, update

from app.db.pool import get_pool
from app.db.tables import users as users_t
from app.middleware.auth import get_current_user
from app.schemas.org import OrgSummarySchema
from app.sql import orgs as sql_orgs
from app.utils.serialization import serialize_org_for_user

router = APIRouter()

_ALLOWED_PATCH_FIELDS = {"full_name", "avatar_url"}


def _map_user(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "full_name": row.get("full_name"),
        "avatar_url": row.get("avatar_url"),
        "is_verified": row.get("is_verified"),
        "is_active": row.get("is_active"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


@router.get("/users/me")
async def users_me(current_user: dict = Depends(get_current_user)) -> dict:
    return _map_user(current_user)


@router.get("/users/me/orgs", response_model=list[OrgSummarySchema])
async def users_me_orgs(current_user: dict = Depends(get_current_user)) -> list:
    pool = await get_pool()
    rows = await pool.fetch(sql_orgs.select_orgs_for_user(str(current_user["id"])))
    return [serialize_org_for_user(row) for row in rows]


@router.patch("/users/me")
async def users_me_update(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    body = await request.json()
    updates = {k: v for k, v in body.items() if k in _ALLOWED_PATCH_FIELDS}
    if not updates:
        return JSONResponse(_map_user(current_user))

    pool = await get_pool()
    stmt = (
        update(users_t)
        .where(users_t.c.id == current_user["id"])
        .values(**updates, updated_at=func.now())
        .returning(
            users_t.c.id, users_t.c.email, users_t.c.full_name,
            users_t.c.avatar_url, users_t.c.is_verified, users_t.c.is_active,
            users_t.c.created_at,
        )
    )
    row = await pool.fetchrow(stmt)
    return JSONResponse(_map_user(row))
