from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from app.core.config import settings
from app.db.engine import get_engine
from app.db.pool import get_pool
from app.db.tables import organizations
from app.errors import ConflictError
from app.services.auth_service import register_user

router = APIRouter()


async def _is_initialized() -> bool:
    engine = get_engine()
    async with engine.connect() as conn:
        result = await conn.execute(select(func.count()).select_from(organizations))
        count = result.scalar()
        return (count or 0) > 0


@router.get("/setup/status")
async def setup_status() -> dict:
    return {"initialized": await _is_initialized()}


@router.post("/setup", status_code=201)
async def setup(request: Request) -> JSONResponse:
    if await _is_initialized():
        raise ConflictError("This instance is already set up")

    body = await request.json()

    missing = [f for f in ("org_name", "full_name", "email", "password") if not body.get(f)]
    if missing:
        return JSONResponse({"detail": f"Missing required fields: {', '.join(missing)}"}, status_code=422)

    meta = {
        "user_agent": request.headers.get("user-agent"),
        "ip_address": request.client.host if request.client else None,
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await register_user(conn, body, meta)

    response = JSONResponse(content=result["token_response"], status_code=201)
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=result["refresh_token"],
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/",
    )
    return response
