from __future__ import annotations

from typing import Any
from uuid import UUID


def uuid_to_str(value: UUID) -> str:
    """Convert a PostgreSQL UUID object to a plain string for JSON serialization.

    asyncpg returns UUID columns as Python UUID objects (not strings).
    JSON serializers cannot handle UUID objects natively, so this conversion
    must happen at the API boundary before data leaves the backend.
    """
    if not isinstance(value, UUID):
        raise TypeError(f"Expected a UUID object, got {type(value).__name__}: {value!r}")
    return str(value)


def map_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row.get("full_name"),
        "avatar_url": row.get("avatar_url"),
        "is_verified": row.get("is_verified"),
        "is_active": row.get("is_active"),
        "created_at": row.get("created_at"),
    }


def map_org(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "plan": row.get("plan"),
        "settings": row.get("settings"),
        "created_at": row.get("created_at"),
    }


def serialize_org_for_user(row: dict[str, Any]) -> dict[str, Any]:
    """Build the org summary returned to the logged-in user.

    Used by GET /users/me/orgs, which joins organizations with memberships
    so each row includes the user's role in that org.

    The 'role' field is what differentiates this from map_org — it tells
    the client whether the user is an owner, admin, or member of each org,
    which drives what they can see and do after switching into that org.
    """
    return {
        "id": uuid_to_str(row["id"]),
        "slug": row["slug"],
        "name": row["name"],
        "plan": row.get("plan"),
        "role": row["role"],
    }


def map_membership(
    row: dict[str, Any],
    user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": row["id"],
        "org_id": row["org_id"],
        "user_id": row["user_id"],
        "role": row["role"],
        "joined_at": row.get("joined_at"),
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user.get("full_name"),
            "avatar_url": user.get("avatar_url"),
        } if user else None,
    }


def map_invitation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "org_id": row["org_id"],
        "invited_by": row.get("invited_by"),
        "email": row["email"],
        "role": row["role"],
        "token": row.get("token"),
        "accepted_at": row.get("accepted_at"),
        "expires_at": row.get("expires_at"),
        "created_at": row.get("created_at"),
    }


def map_connector(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "org_id": row["org_id"],
        "created_by": row.get("created_by"),
        "kind": row["kind"],
        "name": row["name"],
        "status": row.get("status"),
        "config": row.get("config"),
        "sync_cursor": row.get("sync_cursor"),
        "last_synced_at": row.get("last_synced_at"),
        "last_error": row.get("last_error"),
        "sync_frequency": row.get("sync_frequency"),
        "doc_count": row.get("doc_count"),
        "has_credentials": bool(row.get("credentials")),
        "created_at": row.get("created_at"),
    }


def map_sync_job(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "connector_id": row.get("connector_id"),
        "org_id": row.get("org_id"),
        "triggered_by": row.get("triggered_by"),
        "status": row.get("status"),
        "started_at": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "docs_enqueued": row.get("docs_enqueued") or 0,
        "docs_processed": row.get("docs_processed") or 0,
        "docs_indexed": row.get("docs_indexed"),
        "docs_skipped": row.get("docs_skipped"),
        "docs_errored": row.get("docs_errored"),
        "error_message": row.get("error_message"),
        "meta": row.get("meta"),
        "created_at": row.get("created_at"),
    }


def map_document_chunk(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "document_id": row["document_id"],
        "chunk_index": row["chunk_index"],
        "content": row["content"],
        "token_count": row.get("token_count"),
        "created_at": row.get("created_at"),
    }


def map_document(
    row: dict[str, Any],
    chunks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": row["id"],
        "org_id": row.get("org_id"),
        "connector_id": row.get("connector_id"),
        "external_id": row.get("external_id"),
        "url": row.get("url"),
        "title": row.get("title"),
        "kind": row.get("kind"),
        "ext": row.get("ext"),
        "author_name": row.get("author_name"),
        "author_email": row.get("author_email"),
        "content_hash": row.get("content_hash"),
        "checksum": row.get("checksum"),
        "content_type": row.get("content_type"),
        "source_path": row.get("source_path"),
        "source_last_modified_at": row.get("source_last_modified_at"),
        "source_permissions": row.get("source_permissions"),
        "extraction_status": row.get("extraction_status"),
        "extraction_error_code": row.get("extraction_error_code"),
        "extraction_version": row.get("extraction_version"),
        "chunking_version": row.get("chunking_version"),
        "indexing_version": row.get("indexing_version"),
        "word_count": row.get("word_count"),
        "mtime": row.get("mtime"),
        "indexed_at": row.get("indexed_at"),
        "metadata": row.get("metadata"),
        "chunks": [map_document_chunk(c) for c in (chunks or [])],
    }
