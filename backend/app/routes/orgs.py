from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, update

import app.sql.orgs as sql_orgs
from app.db.pool import get_pool
from app.db.tables import organizations
from app.errors import NotFoundError
from app.middleware.auth import get_current_membership, get_current_user, require_role
from app.services.invitation_service import accept_invitation, create_invitation

router = APIRouter()

_ALLOWED_ORG_PATCH = {"name", "plan", "settings"}


def _map_org(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "slug": row["slug"],
        "name": row["name"],
        "plan": row.get("plan"),
        "settings": row.get("settings"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _map_member(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "user_id": str(row["user_id"]),
        "role": row["role"],
        "joined_at": row["joined_at"].isoformat() if row.get("joined_at") else None,
        "user": {
            "id": str(row["user_id"]),
            "email": row.get("email"),
            "full_name": row.get("full_name"),
            "avatar_url": row.get("avatar_url"),
        },
    }


def _map_invitation(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "invited_by": str(row["invited_by"]) if row.get("invited_by") else None,
        "email": row["email"],
        "role": row["role"],
        "token": row.get("token"),
        "accepted_at": row["accepted_at"].isoformat() if row.get("accepted_at") else None,
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


@router.get("/orgs")
async def orgs_list(current_user: dict = Depends(get_current_user)) -> list:
    pool = await get_pool()
    rows = await pool.fetch(sql_orgs.select_orgs_for_user(current_user["id"]))
    return [_map_org(r) for r in rows]


@router.post("/orgs", status_code=201)
async def orgs_create(
    request: Request, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    body = await request.json()

    name = body.get("name", "").strip()
    if not name:
        return JSONResponse({"detail": "name is required"}, status_code=400)

    def _slugify(v: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", v.lower()).strip("-")
        return slug[:50] or "org"

    pool = await get_pool()
    async with pool.acquire() as conn:
        base_slug = _slugify(name)
        slug = base_slug
        counter = 1
        while True:
            exists = await conn.fetchrow(sql_orgs.check_org_slug_exists(slug))
            if exists is None:
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        org_row = await conn.fetchrow(sql_orgs.insert_org(slug, name))
        await conn.execute(
            sql_orgs.insert_membership(org_row["id"], current_user["id"], "owner")
        )

    return JSONResponse(_map_org(org_row), status_code=201)


@router.get("/orgs/{slug}")
async def orgs_get(slug: str, current_user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow(sql_orgs.select_org_by_slug(slug))
    if row is None:
        raise NotFoundError("Organization not found")
    # Ensure user is a member
    await get_current_membership(slug, str(current_user["id"]))
    return _map_org(row)


@router.patch("/orgs/{slug}")
async def orgs_update(
    slug: str, request: Request, current_user: dict = Depends(get_current_user)
) -> dict:
    body = await request.json()
    membership = await get_current_membership(slug, str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    updates = {k: v for k, v in body.items() if k in _ALLOWED_ORG_PATCH}
    pool = await get_pool()
    if not updates:
        row = await pool.fetchrow(sql_orgs.select_org_by_slug(slug))
        return _map_org(row)

    stmt = (
        update(organizations)
        .where(organizations.c.slug == slug)
        .values(**updates, updated_at=func.now())
        .returning(
            organizations.c.id,
            organizations.c.slug,
            organizations.c.name,
            organizations.c.plan,
            organizations.c.settings,
            organizations.c.created_at,
        )
    )
    row = await pool.fetchrow(stmt)
    return _map_org(row)


@router.get("/orgs/{slug}/members")
async def org_members_list(
    slug: str, current_user: dict = Depends(get_current_user)
) -> list:
    membership = await get_current_membership(slug, str(current_user["id"]))
    pool = await get_pool()
    rows = await pool.fetch(sql_orgs.select_members(membership["org_id"]))
    return [_map_member(r) for r in rows]


@router.delete("/orgs/{slug}/members/{user_id}", status_code=204)
async def org_members_delete(
    slug: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    membership = await get_current_membership(slug, str(current_user["id"]))
    require_role(membership, ["owner", "admin"])
    pool = await get_pool()
    deleted = await pool.fetchrow(sql_orgs.delete_membership(membership["org_id"], user_id))
    if deleted is None:
        raise NotFoundError("Member not found")


@router.patch("/orgs/{slug}/members/{user_id}")
async def org_members_update(
    slug: str,
    user_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    body = await request.json()
    membership = await get_current_membership(slug, str(current_user["id"]))
    require_role(membership, ["owner"])
    role = body.get("role")
    if not role:
        return JSONResponse({"detail": "role is required"}, status_code=400)
    pool = await get_pool()
    row = await pool.fetchrow(
        sql_orgs.update_membership_role(membership["org_id"], user_id, role)
    )
    if row is None:
        raise NotFoundError("Member not found")
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "user_id": str(row["user_id"]),
        "role": row["role"],
        "joined_at": row["joined_at"].isoformat() if row.get("joined_at") else None,
    }


@router.post("/orgs/{slug}/invitations", status_code=201)
async def org_invitations_create(
    slug: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    body = await request.json()
    membership = await get_current_membership(slug, str(current_user["id"]))
    require_role(membership, ["owner", "admin"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await create_invitation(
            conn,
            org_id=str(membership["org_id"]),
            invited_by=str(current_user["id"]),
            email=body["email"],
            role=body.get("role", "member"),
        )
    return JSONResponse(_map_invitation(row), status_code=201)


@router.get("/orgs/{slug}/invitations")
async def org_invitations_list(
    slug: str, current_user: dict = Depends(get_current_user)
) -> list:
    membership = await get_current_membership(slug, str(current_user["id"]))
    pool = await get_pool()
    rows = await pool.fetch(sql_orgs.select_pending_invitations(membership["org_id"]))
    return [_map_invitation(r) for r in rows]


@router.post("/invitations/{token}/accept")
async def invitation_accept(
    token: str, current_user: dict = Depends(get_current_user)
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await accept_invitation(conn, token, current_user)
    return {
        "id": str(result["id"]),
        "org_id": str(result["org_id"]),
        "user_id": str(result["user_id"]),
        "role": result["role"],
    }
