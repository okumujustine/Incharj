from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.utils.security import decode_access_token


async def require_current_user(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")

    token = auth_header[len("Bearer "):]
    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    from app.db.pool import get_pool
    from app.sql import auth as sql_auth

    pool = await get_pool()
    row = await pool.fetchrow(sql_auth.select_user_by_id(user_id))
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return dict(row)


def get_current_user(user: dict = Depends(require_current_user)) -> dict:
    return user


async def get_current_membership(org_slug: str, user_id: str) -> dict:
    from app.db.pool import get_pool
    from app.errors import ForbiddenError, NotFoundError
    from app.sql import auth as sql_auth

    pool = await get_pool()
    org_row = await pool.fetchrow(sql_auth.select_org_id_by_slug(org_slug))
    if org_row is None:
        raise NotFoundError("Organization not found")

    membership_row = await pool.fetchrow(
        sql_auth.select_membership_by_org_user(org_row["id"], user_id)
    )
    if membership_row is None:
        raise ForbiddenError("Not a member of this organization")

    return dict(membership_row)


def require_role(membership: dict, roles: list[str]) -> None:
    from app.errors import ForbiddenError

    if membership["role"] not in roles:
        raise ForbiddenError(
            f"Required role: {', '.join(roles)}. Current role: {membership['role']}"
        )
