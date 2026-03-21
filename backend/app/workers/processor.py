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


async def process_enumerate_job(sync_job_id: str, connector_id: str) -> None:
    from app.db.pool import get_pool

    pool = await get_pool()

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
        # SQLAlchemy returns JSONB checkpoint as dict directly
        checkpoint_data = checkpoint_row["checkpoint"] if checkpoint_row else None
        checkpoint: ConnectorCheckpoint | None = None
        if isinstance(checkpoint_data, dict):
            checkpoint = ConnectorCheckpoint(
                cursor=checkpoint_data.get("cursor"),
                modified_after=checkpoint_data.get("modifiedAfter"),
            )

        enumeration = await plugin.enumerate(
            ConnectorEnumerateInput(
                org_id=connector_model["org_id"],
                connector_id=connector_model["id"],
                credentials=credentials,
                config=validated_config,
                checkpoint=checkpoint,
            )
        )

        refs = enumeration.refs

        next_ckpt_data = (
            {
                "cursor": enumeration.next_checkpoint.cursor,
                "modifiedAfter": enumeration.next_checkpoint.modified_after,
            }
            if enumeration.next_checkpoint
            else None
        )
        meta_dict = {
            "checkpoint": next_ckpt_data,
            "documents_enumerated": len(refs),
            "documents_capped": len(refs),
            "documents_truncated": 0,
            "document_limit_applied": validated_config.get("max_documents") or None,
        }
        await pool.execute(
            sql_jobs.set_sync_job_enqueued(sync_job_id, len(refs), meta_dict)
        )

        retry_policy = provider.manifest.retry_policy
        for index, ref in enumerate(refs):
            from app.workers.tasks.sync import sync_document

            sync_document.apply_async(
                args=[sync_job_id, connector_id, _ref_to_dict(ref)],
                task_id=f"sync-document-{sync_job_id}-{index}",
                max_retries=retry_policy.max_attempts,
                countdown=0,
            )

        encrypted_credentials = (
            encrypt_credentials(credentials) if connector_model.get("credentials") else None
        )

        from app.workers.tasks.sync import sync_finalize

        sync_finalize.apply_async(
            args=[sync_job_id, connector_id, next_ckpt_data, encrypted_credentials],
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
