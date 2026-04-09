from __future__ import annotations

from sqlalchemy import delete, func, insert, select, update

from app.db.tables import connectors as t

_COLS = [
    t.c.id,
    t.c.org_id,
    t.c.created_by,
    t.c.kind,
    t.c.name,
    t.c.status,
    t.c.credentials,
    t.c.config,
    t.c.sync_cursor,
    t.c.last_synced_at,
    t.c.last_error,
    t.c.sync_frequency,
    t.c.doc_count,
    t.c.created_at,
]


def select_connector_by_id(connector_id, org_id):
    return select(*_COLS).where(t.c.id == connector_id, t.c.org_id == org_id)


def select_connectors_by_org(org_id):
    return select(*_COLS).where(t.c.org_id == org_id).order_by(t.c.created_at.desc())


def insert_connector(org_id, created_by, kind: str, name: str, config: dict, sync_frequency: str):
    return (
        insert(t)
        .values(
            org_id=org_id,
            created_by=created_by,
            kind=kind,
            name=name,
            status="idle",
            config=config,
            sync_frequency=sync_frequency,
        )
        .returning(*_COLS)
    )


def delete_connector(connector_id, org_id):
    return (
        delete(t)
        .where(t.c.id == connector_id, t.c.org_id == org_id)
        .returning(t.c.id)
    )


def pause_connector(connector_id, org_id):
    return (
        update(t)
        .where(t.c.id == connector_id, t.c.org_id == org_id)
        .values(status="paused", updated_at=func.now())
        .returning(*_COLS)
    )


def resume_connector(connector_id, org_id):
    return (
        update(t)
        .where(t.c.id == connector_id, t.c.org_id == org_id)
        .values(status="idle", updated_at=func.now())
        .returning(*_COLS)
    )


def update_connector_credentials(connector_id, org_id, credentials: str):
    return (
        update(t)
        .where(t.c.id == connector_id, t.c.org_id == org_id)
        .values(credentials=credentials, status="idle", updated_at=func.now())
        .returning(*_COLS)
    )


def update_connector_after_sync(
    connector_id,
    credentials: str | None,
    sync_cursor: str | None,
    doc_count: int,
):
    return (
        update(t)
        .where(t.c.id == connector_id)
        .values(
            credentials=credentials,
            sync_cursor=sync_cursor,
            last_synced_at=func.now(),
            status="idle",
            last_error=None,
            doc_count=doc_count,
        )
    )


def set_connector_error(connector_id, error: str):
    return update(t).where(t.c.id == connector_id).values(status="idle", last_error=error)


def select_connector_for_sync(connector_id):
    return select(
        t.c.id,
        t.c.org_id,
        t.c.kind,
        t.c.credentials,
        t.c.config,
        t.c.last_synced_at,
        t.c.sync_cursor,
    ).where(t.c.id == connector_id)
