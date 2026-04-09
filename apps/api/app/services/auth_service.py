from __future__ import annotations

import re
from typing import Any

from app.core.config import settings
from app.errors import ConflictError, UnauthorizedError
from app.sql import auth as sql_auth
from app.sql import orgs as sql_orgs
from app.utils.security import create_access_token, create_refresh_token, hash_password, verify_password


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:50] or "org"


async def _unique_slug(conn, base: str) -> str:
    slug = base
    counter = 1
    while True:
        row = await conn.fetchrow(sql_orgs.check_org_slug_exists(slug))
        if row is None:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


def _build_token_response(user_id: str) -> dict[str, Any]:
    return {
        "access_token": create_access_token({"sub": user_id}),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


async def register_user(
    conn,
    payload: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    existing = await conn.fetchrow(sql_auth.check_email_exists(payload["email"]))
    if existing:
        raise ConflictError("Email already registered")

    hashed = hash_password(payload["password"])
    user_row = await conn.fetchrow(
        sql_auth.insert_user(payload["email"], hashed, payload.get("full_name"))
    )
    user_id = str(user_row["id"])

    org_name = (
        payload.get("org_name")
        or f"{payload.get('full_name') or payload['email'].split('@')[0]}'s Organization"
    )
    org_slug = await _unique_slug(conn, _slugify(org_name))
    org_row = await conn.fetchrow(sql_orgs.insert_org(org_slug, org_name))
    org_id = str(org_row["id"])

    await conn.execute(sql_orgs.insert_membership(org_id, user_id, "owner"))

    refresh_token = create_refresh_token()
    await conn.execute(
        sql_auth.insert_session(
            user_id=user_id,
            refresh_token=refresh_token,
            user_agent=meta.get("user_agent"),
            ip_address=meta.get("ip_address"),
            expires_days=settings.refresh_token_expire_days,
        )
    )

    return {"token_response": _build_token_response(user_id), "refresh_token": refresh_token}


async def login_user(
    conn,
    payload: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    row = await conn.fetchrow(sql_auth.select_user_for_login(payload["email"]))
    if not row or not row["hashed_password"]:
        raise UnauthorizedError("Invalid credentials")
    if not verify_password(payload["password"], row["hashed_password"]):
        raise UnauthorizedError("Invalid credentials")
    if not row["is_active"]:
        raise UnauthorizedError("Account is disabled")

    user_id = str(row["id"])
    refresh_token = create_refresh_token()
    await conn.execute(
        sql_auth.insert_session(
            user_id=user_id,
            refresh_token=refresh_token,
            user_agent=meta.get("user_agent"),
            ip_address=meta.get("ip_address"),
            expires_days=settings.refresh_token_expire_days,
        )
    )

    return {"token_response": _build_token_response(user_id), "refresh_token": refresh_token}


async def refresh_session(
    conn,
    old_refresh_token: str,
    meta: dict[str, Any],
) -> dict[str, Any]:
    from datetime import datetime, timezone

    session = await conn.fetchrow(sql_auth.select_session_by_token(old_refresh_token))
    if not session:
        raise UnauthorizedError("Invalid or expired refresh token")

    expires_at = session["expires_at"]
    if hasattr(expires_at, "tzinfo") and expires_at.tzinfo:
        if expires_at < datetime.now(timezone.utc):
            raise UnauthorizedError("Invalid or expired refresh token")

    user = await conn.fetchrow(sql_auth.select_user_is_active(session["user_id"]))
    if not user or not user["is_active"]:
        raise UnauthorizedError("User not found or inactive")

    await conn.execute(sql_auth.delete_session_by_id(session["id"]))

    user_id = str(user["id"])
    refresh_token = create_refresh_token()
    await conn.execute(
        sql_auth.insert_session(
            user_id=user_id,
            refresh_token=refresh_token,
            user_agent=meta.get("user_agent"),
            ip_address=meta.get("ip_address"),
            expires_days=settings.refresh_token_expire_days,
        )
    )

    return {"token_response": _build_token_response(user_id), "refresh_token": refresh_token}


async def logout_session(conn, refresh_token: str) -> None:
    await conn.execute(sql_auth.delete_session_by_token(refresh_token))
