from __future__ import annotations

from sqlalchemy import cast, func, insert, literal_column, not_, select, update
from sqlalchemy.dialects.postgresql import INTERVAL, insert as pg_insert

from app.db.tables import connectors, documents, sync_jobs

_FIELDS = [
    sync_jobs.c.id,
    sync_jobs.c.connector_id,
    sync_jobs.c.org_id,
    sync_jobs.c.triggered_by,
    sync_jobs.c.status,
    sync_jobs.c.started_at,
    sync_jobs.c.finished_at,
    sync_jobs.c.docs_enqueued,
    sync_jobs.c.docs_processed,
    sync_jobs.c.docs_indexed,
    sync_jobs.c.docs_skipped,
    sync_jobs.c.docs_errored,
    sync_jobs.c.error_message,
    sync_jobs.c.meta,
    sync_jobs.c.created_at,
]


def insert_sync_job(connector_id, org_id, triggered_by: str):
    return (
        insert(sync_jobs)
        .values(
            connector_id=connector_id,
            org_id=org_id,
            triggered_by=triggered_by,
            status="pending",
        )
        .returning(*_FIELDS)
    )


def select_sync_jobs_by_org(org_id, limit: int, offset: int):
    return (
        select(*_FIELDS)
        .where(sync_jobs.c.org_id == org_id)
        .order_by(sync_jobs.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )


def select_sync_job_by_id(job_id, org_id):
    return select(*_FIELDS).where(
        sync_jobs.c.id == job_id, sync_jobs.c.org_id == org_id
    )


def select_sync_job_stream(job_id, org_id):
    return select(
        sync_jobs.c.id,
        sync_jobs.c.status,
        sync_jobs.c.docs_enqueued,
        sync_jobs.c.docs_processed,
        sync_jobs.c.docs_indexed,
        sync_jobs.c.docs_skipped,
        sync_jobs.c.docs_errored,
        sync_jobs.c.error_message,
        sync_jobs.c.started_at,
        sync_jobs.c.finished_at,
    ).where(sync_jobs.c.id == job_id, sync_jobs.c.org_id == org_id)


def count_connector_docs(connector_id):
    return select(func.count().label("count")).select_from(documents).where(
        documents.c.connector_id == connector_id
    )


def start_sync_job(sync_job_id):
    # Reset all doc counters when the job starts so page-by-page enumeration
    # can safely accumulate increments from early pages before the total is known.
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(
            status="running",
            started_at=func.now(),
            error_message=None,
            docs_enqueued=0,
            docs_processed=0,
            docs_indexed=0,
            docs_skipped=0,
            docs_errored=0,
        )
    )


def set_sync_job_enqueued(sync_job_id, docs_enqueued: int, meta_dict: dict | None):
    # Legacy: used when all refs are collected up front before any tasks are dispatched.
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(
            docs_enqueued=docs_enqueued,
            docs_processed=0,
            docs_indexed=0,
            docs_skipped=0,
            docs_errored=0,
            meta=meta_dict,
        )
    )


def set_docs_enqueued(sync_job_id, total: int, meta_dict: dict | None):
    # Used after page-by-page enumeration completes: sets the final total without
    # resetting counters that running document tasks have already incremented.
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(docs_enqueued=total, meta=meta_dict)
    )


def increment_sync_job_doc_result(sync_job_id, indexed: int, skipped: int, errored: int):
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(
            docs_processed=sync_jobs.c.docs_processed + 1,
            docs_indexed=sync_jobs.c.docs_indexed + indexed,
            docs_skipped=sync_jobs.c.docs_skipped + skipped,
            docs_errored=sync_jobs.c.docs_errored + errored,
        )
    )


def select_sync_job_progress(sync_job_id):
    return select(
        sync_jobs.c.id,
        sync_jobs.c.status,
        sync_jobs.c.docs_enqueued,
        sync_jobs.c.docs_processed,
        sync_jobs.c.docs_indexed,
        sync_jobs.c.docs_skipped,
        sync_jobs.c.docs_errored,
    ).where(sync_jobs.c.id == sync_job_id)


def complete_sync_job_if_finished(sync_job_id):
    return (
        update(sync_jobs)
        .where(
            sync_jobs.c.id == sync_job_id,
            sync_jobs.c.status == "running",
            sync_jobs.c.docs_processed >= sync_jobs.c.docs_enqueued,
        )
        .values(status="done", finished_at=func.now(), error_message=None)
    )


def complete_sync_job(sync_job_id, indexed: int, skipped: int, errored: int):
    total = indexed + skipped + errored
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(
            status="done",
            docs_indexed=indexed,
            docs_skipped=skipped,
            docs_errored=errored,
            docs_processed=total,
            docs_enqueued=total,
            finished_at=func.now(),
        )
    )


def fail_sync_job(sync_job_id, error_message: str):
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(status="failed", error_message=error_message, finished_at=func.now())
    )


def cancel_sync_job(sync_job_id, org_id):
    return (
        update(sync_jobs)
        .where(
            sync_jobs.c.id == sync_job_id,
            sync_jobs.c.org_id == org_id,
            sync_jobs.c.status.in_(["pending", "running"]),
        )
        .values(status="cancelled", finished_at=func.now())
        .returning(sync_jobs.c.id)
    )


def fail_sync_job_connector_not_found(sync_job_id):
    return (
        update(sync_jobs)
        .where(sync_jobs.c.id == sync_job_id)
        .values(
            status="failed",
            error_message="Connector not found",
            finished_at=func.now(),
        )
    )


def select_connector_for_sync(connector_id):
    return select(
        connectors.c.id,
        connectors.c.org_id,
        connectors.c.kind,
        connectors.c.credentials,
        connectors.c.config,
        connectors.c.last_synced_at,
        connectors.c.sync_cursor,
    ).where(connectors.c.id == connector_id)


def dispatch_due_connectors():
    # Subquery: any sync_job created in the last 5 minutes for this connector
    recent_job = (
        select(literal_column("1"))
        .select_from(sync_jobs)
        .where(
            sync_jobs.c.connector_id == connectors.c.id,
            sync_jobs.c.created_at > func.now() - literal_column("interval '5 minutes'"),
        )
        .correlate(connectors)
    )
    return select(connectors.c.id, connectors.c.org_id).where(
        connectors.c.status != "paused",
        connectors.c.credentials.isnot(None),
        # Only auto-sync connectors that have been manually synced at least once.
        # New connectors (last_synced_at IS NULL) must be started manually.
        connectors.c.last_synced_at.isnot(None),
        connectors.c.last_synced_at + cast(connectors.c.sync_frequency, INTERVAL) < func.now(),
        not_(recent_job.exists()),
    )


def check_connector_active_job(connector_id):
    return (
        select(sync_jobs.c.id)
        .where(
            sync_jobs.c.connector_id == connector_id,
            sync_jobs.c.status.in_(["pending", "running"]),
            sync_jobs.c.created_at > func.now() - literal_column("interval '10 minutes'"),
        )
        .limit(1)
    )


def expire_stale_jobs(connector_id):
    return (
        update(sync_jobs)
        .where(
            sync_jobs.c.connector_id == connector_id,
            sync_jobs.c.status.in_(["pending", "running"]),
            sync_jobs.c.created_at <= func.now() - literal_column("interval '10 minutes'"),
        )
        .values(
            status="failed",
            error_message="Job timed out \u2014 no worker picked it up",
            finished_at=func.now(),
        )
    )


def insert_scheduled_job(connector_id, org_id):
    return (
        insert(sync_jobs)
        .values(
            connector_id=connector_id,
            org_id=org_id,
            triggered_by="scheduled",
            status="pending",
        )
        .returning(sync_jobs.c.id)
    )


def select_sync_job_org(sync_job_id):
    return select(sync_jobs.c.org_id).where(sync_jobs.c.id == sync_job_id)
