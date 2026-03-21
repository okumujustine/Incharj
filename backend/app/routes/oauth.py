from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update

from app.connectors.registry import get_connector_provider
from app.db.pool import get_pool
from app.db.tables import connectors as connectors_t, memberships
from app.errors import BadRequestError, NotFoundError
from app.middleware.auth import get_current_user
from app.utils.security import encrypt_credentials

router = APIRouter()


@router.get("/oauth/{kind}/authorize")
async def oauth_authorize(
    kind: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        provider = get_connector_provider(kind)
    except KeyError:
        raise NotFoundError(f"Unknown connector kind: {kind}")

    if not provider.auth:
        raise BadRequestError(f"Connector {kind} does not support OAuth")

    connector_id = request.query_params.get("connector_id")
    state = f"{connector_id}:{os.urandom(16).hex()}" if connector_id else os.urandom(16).hex()
    redirect_uri = request.query_params.get(
        "redirect_uri",
        f"{request.base_url}api/v1/oauth/{kind}/callback",
    )

    authorization_url = provider.auth.authorize_url(state)
    return {"authorization_url": authorization_url, "state": state}


@router.get("/oauth/{kind}/callback")
async def oauth_callback(
    kind: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        provider = get_connector_provider(kind)
    except KeyError:
        raise NotFoundError(f"Unknown connector kind: {kind}")

    if not provider.auth:
        raise BadRequestError(f"Connector {kind} does not support OAuth")

    code = request.query_params.get("code")
    state = request.query_params.get("state", "")

    # Must match the redirect_uri used when building the authorization URL
    from app.core.config import settings as _settings
    redirect_uri = request.query_params.get(
        "redirect_uri",
        f"{_settings.frontend_url}/oauth/{kind}/callback",
    )

    if not code:
        raise BadRequestError("Missing authorization code")

    raw_creds = await provider.auth.exchange_code(code, redirect_uri)
    encrypted = encrypt_credentials(raw_creds)

    # Extract connector_id from state (format: "{connector_id}:{nonce}" or just nonce)
    connector_id = state.split(":")[0] if ":" in state else None

    if connector_id:
        pool = await get_pool()
        subq = select(memberships.c.org_id).where(
            memberships.c.user_id == current_user["id"]
        )
        stmt = (
            update(connectors_t)
            .where(
                connectors_t.c.id == connector_id,
                connectors_t.c.org_id.in_(subq),
            )
            .values(credentials=encrypted, status="idle", updated_at=func.now())
            .returning(connectors_t.c.id)
        )
        updated = await pool.fetchrow(stmt)
        if updated is None:
            raise NotFoundError("Connector not found or access denied")

    return {"success": True, "connector_id": connector_id}
