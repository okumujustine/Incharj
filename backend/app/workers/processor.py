from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

import app.sql.checkpoints as sql_checkpoints
import app.sql.connectors as sql_c
import app.sql.sync_jobs as sql_jobs
from app.connectors.plugin_types import (
    ConnectorCheckpoint,
    ConnectorDocumentRef,
    ConnectorEnumerateInput,
    ConnectorFetchInput,
    ConnectorPluginContext,
)
from app.connectors.registry import get_connector_provider
from app.types.document_envelope import (
    CHUNKING_VERSION,
    EXTRACTION_VERSION,
    INDEXING_VERSION,
    CanonicalDocumentEnvelope,
)
from app.types.sync_errors import SyncErrorCode, SyncPipelineError, to_sync_pipeline_error
from app.utils.security import decrypt_credentials, encrypt_credentials, sha256

log = logging.getLogger("sync-processor")


async def _load_connector_model(pool, connector_id: str) -> dict[str, Any] | None:
    row = await pool.fetchrow(sql_jobs.select_connector_for_sync(connector_id))
    if row is None:
        return None
    model = dict(row)
    # Stringify UUID fields so they are safe to use in Celery task args and JSON
    for key in ("id", "org_id"):
        if model.get(key) is not None:
            model[key] = str(model[key])
    # SQLAlchemy returns JSONB as dict — no manual json.loads needed
    return model


def _envelope_from_ref(
    *,
    org_id: str,
    connector_id: str,
    connector_key: str,
    ref: ConnectorDocumentRef,
    content: str | None,
    extraction_status: str,
    extraction_error_code: str | None,
    metadata: dict[str, Any] | None = None,
) -> CanonicalDocumentEnvelope:
    checksum = sha256(f"{ref.title or ''}::{content or ''}")
    return CanonicalDocumentEnvelope(
        org_id=org_id,
        connector_id=connector_id,
        connector_key=connector_key,
        source_id=connector_id,
        external_id=ref.external_id,
        url=ref.url,
        title=ref.title,
        kind=ref.kind,
        ext=ref.ext,
        content=content,
        content_type=ref.content_type,
        source_path=ref.source_path,
        source_last_modified_at=ref.source_last_modified_at,
        author_name=ref.author_name,
        author_email=ref.author_email,
        checksum=checksum,
        source_permissions=ref.source_permissions,
        extraction_status=extraction_status,  # type: ignore[arg-type]
        extraction_error_code=extraction_error_code,
        extraction_version=EXTRACTION_VERSION,
        chunking_version=CHUNKING_VERSION,
        indexing_version=INDEXING_VERSION,
        metadata={**ref.metadata, **(metadata or {})},
    )


_ENUMERATE_PAGE_LIMIT = 100  # docs per enumerate call; checkpoint saved after each page


async def process_enumerate_job(sync_job_id: str, connector_id: str) -> None:
    from app.db.pool import get_pool

    pool = await get_pool()

    # Resets all doc counters so page-by-page increments from early pages are safe.
    await pool.execute(sql_jobs.start_sync_job(sync_job_id))

    connector_model = await _load_connector_model(pool, connector_id)
    if not connector_model:
        await pool.execute(sql_jobs.fail_sync_job_connector_not_found(sync_job_id))
        return

    try:
        provider = get_connector_provider(connector_model["kind"])
        plugin = provider.plugin

        credentials: dict[str, Any] = (
            decrypt_credentials(connector_model["credentials"])
            if connector_model.get("credentials")
            else {}
        )
        if provider.auth.refresh_credentials:
            refreshed = await provider.auth.refresh_credentials(credentials)
            if refreshed:
                credentials = refreshed

        validated_config = plugin.validate_config(connector_model.get("config") or {})

        checkpoint_row = await pool.fetchrow(
            sql_checkpoints.select_connector_checkpoint(connector_id)
        )
        checkpoint_data = checkpoint_row["checkpoint"] if checkpoint_row else None
        current_checkpoint: ConnectorCheckpoint | None = None
        if isinstance(checkpoint_data, dict):
            current_checkpoint = ConnectorCheckpoint(
                cursor=checkpoint_data.get("cursor"),
                modified_after=checkpoint_data.get("modifiedAfter"),
            )

        retry_policy = provider.manifest.retry_policy
        total_dispatched = 0
        final_ckpt_data: dict | None = None

        # Enumerate one page at a time, persisting the cursor after each page.
        # If the worker crashes mid-enumeration the next job resumes from the last
        # saved cursor instead of starting over.
        while True:
            enumeration = await plugin.enumerate(
                ConnectorEnumerateInput(
                    org_id=connector_model["org_id"],
                    connector_id=connector_model["id"],
                    credentials=credentials,
                    config=validated_config,
                    checkpoint=current_checkpoint,
                    page_limit=_ENUMERATE_PAGE_LIMIT,
                )
            )

            # Persist the cursor immediately so a crash here loses at most one page.
            next_ckpt_data: dict | None = None
            if enumeration.next_checkpoint:
                next_ckpt_data = {
                    "cursor": enumeration.next_checkpoint.cursor,
                    "modifiedAfter": enumeration.next_checkpoint.modified_after,
                }
                await pool.execute(
                    sql_checkpoints.upsert_connector_checkpoint(
                        connector_id,
                        connector_model["org_id"],
                        next_ckpt_data,
                        sync_job_id,
                    )
                )
            final_ckpt_data = next_ckpt_data

            # Dispatch document tasks for this page immediately.
            from app.workers.tasks.sync import sync_document
            for ref in enumeration.refs:
                sync_document.apply_async(
                    args=[sync_job_id, connector_id, _ref_to_dict(ref)],
                    task_id=f"sync-document-{sync_job_id}-{total_dispatched}",
                    max_retries=retry_policy.max_attempts,
                    countdown=0,
                )
                total_dispatched += 1

            # No more pages — enumeration complete.
            if not enumeration.next_checkpoint or not enumeration.next_checkpoint.cursor:
                break

            current_checkpoint = enumeration.next_checkpoint

        # Set the authoritative total now that all pages are done.
        # Document tasks may already be running and incrementing counters; this call
        # does NOT reset those counters (uses set_docs_enqueued, not set_sync_job_enqueued).
        meta_dict = {
            "checkpoint": final_ckpt_data,
            "documents_enumerated": total_dispatched,
            "document_limit_applied": validated_config.get("max_documents") or None,
        }
        await pool.execute(sql_jobs.set_docs_enqueued(sync_job_id, total_dispatched, meta_dict))

        encrypted_credentials = (
            encrypt_credentials(credentials) if connector_model.get("credentials") else None
        )

        from app.workers.tasks.sync import sync_finalize

        sync_finalize.apply_async(
            args=[sync_job_id, connector_id, final_ckpt_data, encrypted_credentials],
            task_id=f"sync-finalize-{sync_job_id}",
            countdown=1,
        )

    except Exception as error:
        sync_error = to_sync_pipeline_error(error, "enumeration")
        await pool.execute(
            sql_c.set_connector_error(
                connector_model["id"],
                f"{sync_error.code}: {sync_error}",
            )
        )
        await pool.execute(
            sql_jobs.fail_sync_job(sync_job_id, f"{sync_error.code}: {sync_error}")
        )
        raise


def _ref_to_dict(ref: ConnectorDocumentRef) -> dict[str, Any]:
    return {
        "externalId": ref.external_id,
        "title": ref.title,
        "url": ref.url,
        "kind": ref.kind,
        "ext": ref.ext,
        "authorName": ref.author_name,
        "authorEmail": ref.author_email,
        "contentType": ref.content_type,
        "sourcePath": ref.source_path,
        "sourceLastModifiedAt": ref.source_last_modified_at,
        "sourcePermissions": ref.source_permissions,
        "metadata": ref.metadata,
    }


def _dict_to_ref(d: dict[str, Any]) -> ConnectorDocumentRef:
    return ConnectorDocumentRef(
        external_id=d.get("externalId", ""),
        title=d.get("title"),
        url=d.get("url"),
        kind=d.get("kind"),
        ext=d.get("ext"),
        author_name=d.get("authorName"),
        author_email=d.get("authorEmail"),
        content_type=d.get("contentType"),
        source_path=d.get("sourcePath"),
        source_last_modified_at=d.get("sourceLastModifiedAt"),
        source_permissions=d.get("sourcePermissions"),
        metadata=d.get("metadata") or {},
    )


async def _is_doc_unchanged(pool, connector_id: str, ref) -> bool:
    """Return True if the document is already indexed with the same source_last_modified_at.

    When True the caller can skip the remote fetch entirely — the content hasn't changed.
    """
    if not ref.source_last_modified_at:
        return False

    from sqlalchemy import select as sa_select
    from app.db.tables import documents as docs_t

    row = await pool.fetchrow(
        sa_select(docs_t.c.source_last_modified_at, docs_t.c.extraction_status)
        .where(
            docs_t.c.connector_id == connector_id,
            docs_t.c.external_id == ref.external_id,
        )
        .limit(1)
    )
    if row is None or row["extraction_status"] != "succeeded":
        return False

    existing_mtime = row["source_last_modified_at"]
    if existing_mtime is None:
        return False

    # Normalise both sides to UTC ISO strings for comparison.
    existing_iso = existing_mtime.isoformat()
    # Google returns e.g. "2024-01-15T10:30:00.000Z" — strip trailing Z for comparison.
    ref_iso = ref.source_last_modified_at.replace("Z", "+00:00")
    try:
        from datetime import datetime, timezone
        existing_dt = existing_mtime.astimezone(timezone.utc).replace(tzinfo=None)
        ref_dt = datetime.fromisoformat(ref_iso).astimezone(timezone.utc).replace(tzinfo=None)
        return existing_dt >= ref_dt
    except Exception:
        return existing_iso == ref.source_last_modified_at


async def process_document_job(
    sync_job_id: str,
    connector_id: str,
    ref_dict: dict[str, Any],
    attempt: int = 1,
    max_attempts: int = 3,
) -> None:
    from app.db.pool import get_pool
    from app.services.indexer import ingest_canonical_document

    pool = await get_pool()
    ref = _dict_to_ref(ref_dict)

    connector_model = await _load_connector_model(pool, connector_id)
    if not connector_model:
        await pool.execute(
            sql_jobs.increment_sync_job_doc_result(sync_job_id, 0, 0, 1)
        )
        return

    # Skip the remote fetch if the document hasn't changed since last index.
    if await _is_doc_unchanged(pool, connector_id, ref):
        log.debug(
            "skipping unchanged document connector_id=%s external_id=%s",
            connector_id,
            ref.external_id,
        )
        await pool.execute(sql_jobs.increment_sync_job_doc_result(sync_job_id, 0, 1, 0))
        return

    provider = get_connector_provider(connector_model["kind"])
    plugin = provider.plugin
    validated_config = plugin.validate_config(connector_model.get("config") or {})
    credentials: dict[str, Any] = (
        decrypt_credentials(connector_model["credentials"])
        if connector_model.get("credentials")
        else {}
    )
    if provider.auth.refresh_credentials:
        refreshed = await provider.auth.refresh_credentials(credentials)
        if refreshed:
            credentials = refreshed

    try:
        fetched = await plugin.fetch_document(
            ConnectorFetchInput(
                org_id=connector_model["org_id"],
                connector_id=connector_model["id"],
                credentials=credentials,
                config=validated_config,
                ref=ref,
            )
        )

        extraction_status = "succeeded" if (fetched.content or "").strip() else "empty"
        envelope = _envelope_from_ref(
            org_id=connector_model["org_id"],
            connector_id=connector_model["id"],
            connector_key=provider.manifest.key,
            ref=ref,
            content=fetched.content,
            extraction_status=extraction_status,
            extraction_error_code=SyncErrorCode.EMPTY_CONTENT if extraction_status == "empty" else None,
            metadata=fetched.metadata,
        )

        async with pool.acquire() as conn:
            async with conn.transaction():
                outcome = await ingest_canonical_document(conn, envelope)

        if outcome == "indexed":
            await pool.execute(sql_jobs.increment_sync_job_doc_result(sync_job_id, 1, 0, 0))
        else:
            await pool.execute(sql_jobs.increment_sync_job_doc_result(sync_job_id, 0, 1, 0))

    except SyncPipelineError as sync_error:
        if sync_error.retriable and attempt < max_attempts:
            raise

        error_envelope = _envelope_from_ref(
            org_id=connector_model["org_id"],
            connector_id=connector_model["id"],
            connector_key=provider.manifest.key,
            ref=ref,
            content=None,
            extraction_status="failed",
            extraction_error_code=sync_error.code,
            metadata={"error": str(sync_error)},
        )
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    from app.services.indexer import ingest_canonical_document

                    await ingest_canonical_document(conn, error_envelope)
        except Exception:
            pass

        await pool.execute(sql_jobs.increment_sync_job_doc_result(sync_job_id, 0, 0, 1))
        log.error(
            "document fetch/normalize failed sync_job_id=%s connector_id=%s external_id=%s code=%s",
            sync_job_id,
            connector_id,
            ref.external_id,
            sync_error.code,
        )

    except Exception as error:
        sync_error = to_sync_pipeline_error(error, "fetch")
        await pool.execute(sql_jobs.increment_sync_job_doc_result(sync_job_id, 0, 0, 1))
        log.error(
            "document job failed sync_job_id=%s connector_id=%s external_id=%s err=%s",
            sync_job_id,
            connector_id,
            ref.external_id,
            error,
        )


async def process_finalize_job(
    sync_job_id: str,
    connector_id: str,
    checkpoint: dict[str, Any] | None,
    encrypted_credentials: str | None,
) -> None:
    from app.db.pool import get_pool

    pool = await get_pool()

    progress = await pool.fetchrow(sql_jobs.select_sync_job_progress(sync_job_id))
    if not progress:
        return
    if progress["status"] == "failed":
        return

    if progress["docs_processed"] < progress["docs_enqueued"]:
        from app.workers.tasks.sync import sync_finalize

        sync_finalize.apply_async(
            args=[sync_job_id, connector_id, checkpoint, encrypted_credentials],
            task_id=f"sync-finalize-{sync_job_id}-{__import__('time').time_ns()}",
            countdown=2,
        )
        return

    if progress["docs_enqueued"] == 0:
        await pool.execute(sql_jobs.complete_sync_job(sync_job_id, 0, 0, 0))
    else:
        await pool.execute(sql_jobs.complete_sync_job_if_finished(sync_job_id))

    connector_model = await _load_connector_model(pool, connector_id)
    if not connector_model:
        return

    # Only advance the checkpoint if no errors — otherwise keep the old position
    # so failed docs are retried on the next sync
    if checkpoint and progress["docs_errored"] == 0:
        await pool.execute(
            sql_checkpoints.upsert_connector_checkpoint(
                connector_id,
                connector_model["org_id"],
                checkpoint,
                sync_job_id,
            )
        )

    count_row = await pool.fetchrow(sql_jobs.count_connector_docs(connector_id))
    total_docs = int(count_row["count"]) if count_row else 0

    await pool.execute(
        sql_c.update_connector_after_sync(
            connector_id,
            encrypted_credentials,
            # sync_cursor: pass checkpoint as a dict — SQLAlchemy handles JSONB serialization
            # but sync_cursor is TEXT column so we store it as a JSON string if present
            __import__("json").dumps(checkpoint) if checkpoint else None,
            total_docs,
        )
    )
