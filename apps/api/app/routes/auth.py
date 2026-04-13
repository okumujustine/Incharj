from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.pool import get_pool
from app.middleware.auth import get_current_user
from app.schemas.auth import LoginSchema
from app.services.auth_service import login_user, logout_session, refresh_session
from app.sql import orgs as sql_orgs

router = APIRouter()


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.refresh_cookie_name, path="/")


@router.post("/auth/login")
async def auth_login(body: LoginSchema, request: Request) -> JSONResponse:
    meta = {
        "user_agent": request.headers.get("user-agent"),
        "ip_address": request.client.host if request.client else None,
    }
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await login_user(conn, body.model_dump(), meta)

    response = JSONResponse(content=result["token_response"])
    _set_refresh_cookie(response, result["refresh_token"])
    return response


@router.post("/auth/refresh")
async def auth_refresh(
    request: Request,
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> JSONResponse:
    token = refresh_token or request.headers.get("x-refresh-token")
    if not token:
        return JSONResponse({"detail": "Missing refresh token"}, status_code=401)

    meta = {
        "user_agent": request.headers.get("user-agent"),
        "ip_address": request.client.host if request.client else None,
    }
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await refresh_session(conn, token, meta)

    response = JSONResponse(content=result["token_response"])
    _set_refresh_cookie(response, result["refresh_token"])
    return response


@router.post("/auth/logout", status_code=204)
async def auth_logout(
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> Response:
    if refresh_token:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await logout_session(conn, refresh_token)

    response = Response(status_code=204)
    _clear_refresh_cookie(response)
    return response


@router.get("/auth/me")
async def auth_me(current_user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()
    org_row = await pool.fetchrow(sql_orgs.select_user_primary_org(str(current_user["id"])))

    org = None
    if org_row:
        org = {
            "id": str(org_row["id"]),
            "slug": org_row["slug"],
            "name": org_row["name"],
            "plan": org_row.get("plan"),
        }

    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "avatar_url": current_user.get("avatar_url"),
        "is_verified": current_user.get("is_verified"),
        "is_active": current_user.get("is_active"),
        "created_at": current_user["created_at"].isoformat() if current_user.get("created_at") else None,
        "org": org,
    }
