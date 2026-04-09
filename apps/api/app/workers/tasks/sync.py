from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.db.engine import use_null_pool
from app.workers.celery_app import celery_app
from app.connectors.registry import load_connectors

use_null_pool()   # Each Celery task runs its own asyncio.run(); NullPool avoids stale connections
load_connectors()

log = logging.getLogger("sync-tasks")


@celery_app.task(name="app.workers.tasks.sync.dispatch", bind=True)
def dispatch(self) -> dict[str, Any]:
    async def _run():
        import app.sql.sync_jobs as sql_jobs
        from app.db.pool import get_pool, reset_pool

        await reset_pool()
        pool = await get_pool()

        connector_rows = await pool.fetch(sql_jobs.dispatch_due_connectors())
        dispatched = 0
        for connector in connector_rows:
            running = await pool.fetchrow(sql_jobs.check_connector_active_job(connector["id"]))
            if running:
                continue
            job_row = await pool.fetchrow(
                sql_jobs.insert_scheduled_job(connector["id"], connector["org_id"])
            )
            sync_job_id = str(job_row["id"])
            sync_enumerate.apply_async(
                args=[sync_job_id, str(connector["id"])],
                task_id=f"sync-enumerate-{sync_job_id}",
            )
            dispatched += 1
        return {"status": "ok", "dispatched": dispatched}

    return asyncio.run(_run())


@celery_app.task(name="app.workers.tasks.sync.sync_enumerate", bind=True, max_retries=1)
def sync_enumerate(self, sync_job_id: str, connector_id: str) -> dict[str, Any]:
    async def _run():
        from app.db.pool import reset_pool
        from app.workers.processor import process_enumerate_job

        await reset_pool()
        await process_enumerate_job(sync_job_id, connector_id)
        return {"status": "ok", "sync_job_id": sync_job_id, "connector_id": connector_id}

    try:
        return asyncio.run(_run())
    except Exception as exc:
        log.error("sync_enumerate failed sync_job_id=%s error=%s", sync_job_id, exc)
        raise self.retry(exc=exc) from exc


@celery_app.task(name="app.workers.tasks.sync.sync_document", bind=True, max_retries=3)
def sync_document(
    self,
    sync_job_id: str,
    connector_id: str,
    ref: dict[str, Any],
) -> dict[str, Any]:
    async def _run():
        import app.sql.sync_jobs as sql_jobs
        from app.db.pool import get_pool, reset_pool
        from app.workers.processor import process_document_job

        await reset_pool()
        pool = await get_pool()
        job_row = await pool.fetchrow(sql_jobs.select_sync_job_progress(sync_job_id))
        if job_row and job_row["status"] in ("cancelled", "failed"):
            return {"status": "skipped", "reason": job_row["status"]}

        await process_document_job(
            sync_job_id,
            connector_id,
            ref,
            attempt=self.request.retries + 1,
            max_attempts=self.max_retries + 1,
        )
        return {"status": "ok", "sync_job_id": sync_job_id, "external_id": ref.get("externalId", "")}

    try:
        return asyncio.run(_run())
    except Exception as exc:
        log.error("sync_document failed sync_job_id=%s error=%s", sync_job_id, exc)
        raise self.retry(exc=exc) from exc


@celery_app.task(name="app.workers.tasks.sync.sync_finalize", bind=True)
def sync_finalize(
    self,
    sync_job_id: str,
    connector_id: str,
    checkpoint: dict[str, Any] | None = None,
    encrypted_credentials: str | None = None,
) -> dict[str, Any]:
    async def _run():
        import app.sql.sync_jobs as sql_jobs
        from app.db.pool import get_pool, reset_pool
        from app.workers.processor import process_finalize_job

        await reset_pool()
        try:
            await process_finalize_job(sync_job_id, connector_id, checkpoint, encrypted_credentials)
        except Exception as exc:
            log.error("sync_finalize failed sync_job_id=%s error=%s", sync_job_id, exc)
            try:
                pool = await get_pool()
                await pool.execute(sql_jobs.fail_sync_job(sync_job_id, str(exc)))
            except Exception:
                pass
            raise
        return {"status": "ok", "sync_job_id": sync_job_id}

    return asyncio.run(_run())
