from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.tables import connector_sync_state


def select_connector_checkpoint(connector_id):
    return select(connector_sync_state.c.checkpoint).where(
        connector_sync_state.c.connector_id == connector_id
    )


def upsert_connector_checkpoint(
    connector_id,
    org_id,
    checkpoint: dict | None,
    last_sync_job_id,
):
    stmt = pg_insert(connector_sync_state).values(
        connector_id=connector_id,
        org_id=org_id,
        checkpoint=checkpoint,
        last_sync_job_id=last_sync_job_id,
        updated_at=func.now(),
    )
    return stmt.on_conflict_do_update(
        index_elements=[connector_sync_state.c.connector_id],
        set_={
            "checkpoint": stmt.excluded.checkpoint,
            "last_sync_job_id": stmt.excluded.last_sync_job_id,
            "updated_at": func.now(),
        },
    )


def delete_connector_checkpoint(connector_id):
    return delete(connector_sync_state).where(
        connector_sync_state.c.connector_id == connector_id
    )
