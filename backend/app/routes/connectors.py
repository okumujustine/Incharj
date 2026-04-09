from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, update

import app.sql.checkpoints as sql_checkpoints
import app.sql.connectors as sql_c
import app.sql.sync_jobs as sql_jobs
from app.db.pool import get_pool
from app.db.tables import connectors as connectors_t, documents as documents_t
from app.errors import BadRequestError, NotFoundError
from app.middleware.auth import get_current_membership, get_current_user, require_role

router = APIRouter()

_CONNECTOR_COLS = [
    connectors_t.c.id,
    connectors_t.c.org_id,
    connectors_t.c.created_by,
    connectors_t.c.kind,
    connectors_t.c.name,
    connectors_t.c.status,
    connectors_t.c.credentials,
    connectors_t.c.config,
    connectors_t.c.sync_cursor,
    connectors_t.c.last_synced_at,
    connectors_t.c.last_error,
    connectors_t.c.sync_frequency,
    connectors_t.c.doc_count,
    connectors_t.c.created_at,
]

_ALLOWED_PATCH = {"name", "config", "sync_frequency"}


def _map_connector(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "created_by": str(row["created_by"]) if row.get("created_by") else None,
        "kind": row["kind"],
        "name": row["name"],
        "status": row["status"],
        "has_credentials": bool(row.get("credentials")),
        "config": row.get("config"),
        "sync_cursor": row.get("sync_cursor"),
        "last_synced_at": row["last_synced_at"].isoformat() if row.get("last_synced_at") else None,
        "last_error": row.get("last_error"),
        "sync_frequency": row.get("sync_frequency"),
        "doc_count": row.get("doc_count"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


async def _get_connector_or_404(pool: Any, connector_id: str, org_id: Any) -> dict:
    row = await pool.fetchrow(sql_c.select_connector_by_id(connector_id, org_id))
    if row is None:
        raise NotFoundError("Connector not found")
    return row


@router.get("/orgs/{slug}/connectors")
async def connectors_list(slug: str, current_user: dict = Depends(get_current_user)) -> list:
    membership = await get_current_membership(slug, str(current_user["id"]))
    pool = await get_pool()
    rows = await pool.fetch(sql_c.select_connectors_by_org(membership["org_id"]))
    return [_map_connector(r) for r in rows]


@router.post("/orgs/{slug}/connectors", status_code=201)
async def connectors_create(
    slug: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    body = await request.json()
    membership = await get_current_membership(slug, str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    kind = body.get("kind", "").strip()
    name = body.get("name", "").strip()
    if not kind or not name:
        raise BadRequestError("kind and name are required")

    from app.connectors.registry import get_connector_provider

    try:
        provider = get_connector_provider(kind)
    except KeyError:
        raise BadRequestError(f"Unknown connector kind: {kind}")

    config = provider.plugin.validate_config(body.get("config") or {})
    sync_frequency = body.get("sync_frequency", "1 hour")

    pool = await get_pool()
    row = await pool.fetchrow(
        sql_c.insert_connector(
            org_id=membership["org_id"],
            created_by=current_user["id"],
            kind=kind,
            name=name,
            config=config,
            sync_frequency=sync_frequency,
        )
    )
    return JSONResponse(_map_connector(row), status_code=201)


@router.get("/connectors/{connector_id}")
async def connectors_get(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    # Fetch connector without org filter first to determine org, then check membership
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    if org_row is None:
        raise NotFoundError("Connector not found")
    await get_current_membership(org_row["slug"], str(current_user["id"]))
    return _map_connector(row)


@router.patch("/connectors/{connector_id}")
async def connectors_update(
    connector_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    body = await request.json()
    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    updates = {k: v for k, v in body.items() if k in _ALLOWED_PATCH}
    if not updates:
        return _map_connector(row)

    stmt = (
        update(connectors_t)
        .where(connectors_t.c.id == connector_id, connectors_t.c.org_id == membership["org_id"])
        .values(**updates, updated_at=func.now())
        .returning(*_CONNECTOR_COLS)
    )
    updated = await pool.fetchrow(stmt)
    return _map_connector(updated)


def _get_server_credentials(kind: str) -> dict | None:
    """Return env-configured credentials for a connector kind, or None if not set."""
    from app.core.config import settings

    if kind == "slack":
        token = settings.slack_bot_token
        return {"bot_token": token} if token else None
    # Future connectors: add new elif branches here
    return None


@router.post("/connectors/{connector_id}/connect")
async def connectors_connect(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Activate a connector by loading its credentials from server-side environment variables.

    Used for non-OAuth connectors (e.g. Slack). No credentials are accepted from
    the client — the token must be configured via the server's environment.
    """
    from sqlalchemy import select as sa_select
    from app.utils.security import encrypt_credentials

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")

    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    kind = row["kind"]
    credentials = _get_server_credentials(kind)
    if not credentials:
        raise BadRequestError(
            f"No server-side credentials configured for '{kind}'. "
            f"Ask your administrator to set the required environment variable."
        )

    encrypted = encrypt_credentials(credentials)
    stmt = (
        update(connectors_t)
        .where(connectors_t.c.id == connector_id, connectors_t.c.org_id == membership["org_id"])
        .values(credentials=encrypted, status="idle", updated_at=func.now())
        .returning(*_CONNECTOR_COLS)
    )
    updated = await pool.fetchrow(stmt)
    return _map_connector(updated)


@router.delete("/connectors/{connector_id}", status_code=204)
async def connectors_delete(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    deleted = await pool.fetchrow(
        sql_c.delete_connector(connector_id, membership["org_id"])
    )
    if deleted is None:
        raise NotFoundError("Connector not found")


@router.post("/connectors/{connector_id}/sync", status_code=202)
async def connectors_sync(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))

    # Expire jobs stuck in pending/running for more than 10 minutes
    await pool.execute(sql_jobs.expire_stale_jobs(connector_id))
    # Check for active job
    active = await pool.fetchrow(sql_jobs.check_connector_active_job(connector_id))
    if active:
        return JSONResponse({"detail": "Sync already in progress"}, status_code=409)

    job_row = await pool.fetchrow(
        sql_jobs.insert_sync_job(connector_id, membership["org_id"], str(current_user["id"]))
    )
    sync_job_id = str(job_row["id"])

    from app.workers.tasks.sync import sync_enumerate

    sync_enumerate.apply_async(
        args=[sync_job_id, connector_id],
        task_id=f"sync-enumerate-{sync_job_id}",
    )

    return JSONResponse({"sync_job_id": sync_job_id, "status": "pending"}, status_code=202)


@router.post("/connectors/{connector_id}/pause")
async def connectors_pause(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    updated = await pool.fetchrow(sql_c.pause_connector(connector_id, membership["org_id"]))
    return _map_connector(updated)


@router.post("/connectors/{connector_id}/resume")
async def connectors_resume(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    updated = await pool.fetchrow(sql_c.resume_connector(connector_id, membership["org_id"]))
    return _map_connector(updated)


@router.post("/connectors/{connector_id}/embed")
async def connectors_embed(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))

    from app.services.embedding_service import embed_connector

    async with pool.acquire() as conn:
        result = await embed_connector(conn, str(membership["org_id"]), connector_id)
    return result


@router.post("/connectors/{connector_id}/reset-sync")
async def connectors_reset_sync(
    connector_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select as sa_select

    pool = await get_pool()
    row = await pool.fetchrow(
        sa_select(*_CONNECTOR_COLS).where(connectors_t.c.id == connector_id)
    )
    if row is None:
        raise NotFoundError("Connector not found")
    from app.db.tables import organizations

    org_row = await pool.fetchrow(
        sa_select(organizations.c.slug).where(organizations.c.id == row["org_id"])
    )
    membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
    require_role(membership, ["owner", "admin"])

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(sql_checkpoints.delete_connector_checkpoint(connector_id))
            await conn.execute(
                delete(documents_t).where(documents_t.c.connector_id == connector_id)
            )
            updated = await conn.fetchrow(
                update(connectors_t)
                .where(connectors_t.c.id == connector_id)
                .values(doc_count=0, last_synced_at=None, last_error=None, updated_at=func.now())
                .returning(*_CONNECTOR_COLS)
            )
    return _map_connector(updated)
