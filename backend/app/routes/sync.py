from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select

import app.sql.sync_jobs as sql_jobs
from app.db.pool import get_pool
from app.db.tables import organizations, sync_jobs as sync_jobs_t
from app.errors import NotFoundError
from app.middleware.auth import get_current_membership, get_current_user

router = APIRouter()


def _map_sync_job(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "connector_id": str(row["connector_id"]),
        "org_id": str(row["org_id"]),
        "triggered_by": row.get("triggered_by"),
        "status": row["status"],
        "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
        "finished_at": row["finished_at"].isoformat() if row.get("finished_at") else None,
        "docs_enqueued": row.get("docs_enqueued"),
        "docs_processed": row.get("docs_processed"),
        "docs_indexed": row.get("docs_indexed"),
        "docs_skipped": row.get("docs_skipped"),
        "docs_errored": row.get("docs_errored"),
        "error_message": row.get("error_message"),
        "meta": row.get("meta"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


async def _get_org_id_for_user(slug: str, user_id: str) -> Any:
    membership = await get_current_membership(slug, user_id)
    return membership["org_id"]


@router.get("/sync/jobs")
async def sync_jobs_list(
    org: Optional[str] = Query(default=None),
    connector_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> list:
    if not org:
        return []

    membership = await get_current_membership(org, str(current_user["id"]))
    org_id = membership["org_id"]

    pool = await get_pool()

    if connector_id:
        from app.db.tables import sync_jobs as sj

        stmt = (
            select(
                sj.c.id,
                sj.c.connector_id,
                sj.c.org_id,
                sj.c.triggered_by,
                sj.c.status,
                sj.c.started_at,
                sj.c.finished_at,
                sj.c.docs_enqueued,
                sj.c.docs_processed,
                sj.c.docs_indexed,
                sj.c.docs_skipped,
                sj.c.docs_errored,
                sj.c.error_message,
                sj.c.meta,
                sj.c.created_at,
            )
            .where(sj.c.org_id == org_id, sj.c.connector_id == connector_id)
            .order_by(sj.c.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = await pool.fetch(stmt)
    else:
        rows = await pool.fetch(sql_jobs.select_sync_jobs_by_org(org_id, limit, offset))

    return [_map_sync_job(r) for r in rows]


@router.get("/sync/jobs/{job_id}")
async def sync_job_get(
    job_id: str,
    org_slug: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()

    if org_slug:
        membership = await get_current_membership(org_slug, str(current_user["id"]))
        org_id = membership["org_id"]
    else:
        raw = await pool.fetchrow(
            select(sync_jobs_t.c.org_id).where(sync_jobs_t.c.id == job_id)
        )
        if raw is None:
            raise NotFoundError("Sync job not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = membership["org_id"]

    row = await pool.fetchrow(sql_jobs.select_sync_job_by_id(job_id, org_id))
    if row is None:
        raise NotFoundError("Sync job not found")
    return _map_sync_job(row)


@router.get("/sync/jobs/{job_id}/stream")
async def sync_job_stream(
    job_id: str,
    org_slug: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    pool = await get_pool()

    if org_slug:
        membership = await get_current_membership(org_slug, str(current_user["id"]))
        org_id = membership["org_id"]
    else:
        raw = await pool.fetchrow(
            select(sync_jobs_t.c.org_id).where(sync_jobs_t.c.id == job_id)
        )
        if raw is None:
            raise NotFoundError("Sync job not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = membership["org_id"]

    async def event_generator() -> AsyncGenerator[str, None]:
        terminal = {"done", "failed", "cancelled"}
        while True:
            row = await pool.fetchrow(sql_jobs.select_sync_job_stream(job_id, org_id))
            if row is None:
                yield f"data: {json.dumps({'error': 'job not found'})}\n\n"
                break
            data = {
                "id": str(row["id"]),
                "status": row["status"],
                "docs_enqueued": row.get("docs_enqueued"),
                "docs_processed": row.get("docs_processed"),
                "docs_indexed": row.get("docs_indexed"),
                "docs_skipped": row.get("docs_skipped"),
                "docs_errored": row.get("docs_errored"),
                "error_message": row.get("error_message"),
                "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
                "finished_at": row["finished_at"].isoformat() if row.get("finished_at") else None,
            }
            yield f"data: {json.dumps(data)}\n\n"
            if row["status"] in terminal:
                break
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sync/jobs/{job_id}/cancel")
async def sync_job_cancel(
    job_id: str,
    org: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()

    if org:
        membership = await get_current_membership(org, str(current_user["id"]))
        org_id = membership["org_id"]
    else:
        raw = await pool.fetchrow(
            select(sync_jobs_t.c.org_id).where(sync_jobs_t.c.id == job_id)
        )
        if raw is None:
            raise NotFoundError("Sync job not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = membership["org_id"]

    row = await pool.fetchrow(sql_jobs.cancel_sync_job(job_id, org_id))
    if row is None:
        raise NotFoundError("Sync job not found or already finished")

    # Revoke associated Celery tasks so they stop if still queued/running
    from app.workers.celery_app import celery_app

    celery_app.control.revoke(f"sync-enumerate-{job_id}", terminate=True, signal="SIGTERM")
    celery_app.control.revoke(f"sync-finalize-{job_id}", terminate=True, signal="SIGTERM")

    return {"id": job_id, "status": "cancelled"}
