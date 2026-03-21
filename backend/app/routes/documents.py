from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

import app.sql.documents as sql_docs
from app.db.pool import get_pool
from app.db.tables import documents as documents_t, organizations
from app.errors import NotFoundError
from app.middleware.auth import get_current_membership, get_current_user

router = APIRouter()


def _map_document(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "connector_id": str(row["connector_id"]) if row.get("connector_id") else None,
        "external_id": row.get("external_id"),
        "url": row.get("url"),
        "title": row.get("title"),
        "kind": row.get("kind"),
        "ext": row.get("ext"),
        "author_name": row.get("author_name"),
        "author_email": row.get("author_email"),
        "word_count": row.get("word_count"),
        "extraction_status": row.get("extraction_status"),
        "extraction_error_code": row.get("extraction_error_code"),
        "mtime": row["mtime"].isoformat() if row.get("mtime") else None,
        "indexed_at": row["indexed_at"].isoformat() if row.get("indexed_at") else None,
        "metadata": row.get("metadata"),
    }


def _map_chunk(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "document_id": str(row["document_id"]),
        "chunk_index": row["chunk_index"],
        "content": row.get("content"),
        "token_count": row.get("token_count"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


@router.get("/documents")
async def documents_list(
    org: Optional[str] = Query(default=None),
    connector_id: Optional[str] = Query(default=None),
    kind: Optional[str] = Query(default=None),
    ext: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> dict:
    if not org:
        return {"results": [], "total": 0, "limit": limit, "offset": offset}

    membership = await get_current_membership(org, str(current_user["id"]))
    org_id = membership["org_id"]

    # Build the list query dynamically with SQLAlchemy
    stmt = select(documents_t).where(documents_t.c.org_id == org_id)
    if connector_id:
        stmt = stmt.where(documents_t.c.connector_id == connector_id)
    if kind:
        stmt = stmt.where(documents_t.c.kind == kind)
    if ext:
        stmt = stmt.where(documents_t.c.ext == ext)
    stmt = stmt.order_by(documents_t.c.indexed_at.desc()).limit(limit).offset(offset)

    # Build count query with same filters
    count_stmt = select(func.count().label("total")).select_from(documents_t).where(
        documents_t.c.org_id == org_id
    )
    if connector_id:
        count_stmt = count_stmt.where(documents_t.c.connector_id == connector_id)
    if kind:
        count_stmt = count_stmt.where(documents_t.c.kind == kind)
    if ext:
        count_stmt = count_stmt.where(documents_t.c.ext == ext)

    pool = await get_pool()
    rows = await pool.fetch(stmt)
    count_row = await pool.fetchrow(count_stmt)

    return {
        "results": [_map_document(r) for r in rows],
        "total": count_row["total"] if count_row else 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/documents/{document_id}")
async def document_get(
    document_id: str,
    org_slug: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()

    if org_slug:
        membership = await get_current_membership(org_slug, str(current_user["id"]))
        org_id = membership["org_id"]
    else:
        raw = await pool.fetchrow(
            select(documents_t.c.org_id).where(documents_t.c.id == document_id)
        )
        if raw is None:
            raise NotFoundError("Document not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = membership["org_id"]

    row = await pool.fetchrow(sql_docs.select_document_by_id(document_id, org_id))
    if row is None:
        raise NotFoundError("Document not found")

    chunks = await pool.fetch(sql_docs.select_document_chunks(document_id))

    doc = _map_document(row)
    doc["chunks"] = [_map_chunk(c) for c in chunks]
    return doc


@router.delete("/documents/{document_id}", status_code=204)
async def document_delete(
    document_id: str,
    org_slug: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> None:
    pool = await get_pool()

    if org_slug:
        membership = await get_current_membership(org_slug, str(current_user["id"]))
        org_id = membership["org_id"]
    else:
        raw = await pool.fetchrow(
            select(documents_t.c.org_id).where(documents_t.c.id == document_id)
        )
        if raw is None:
            raise NotFoundError("Document not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = membership["org_id"]

    deleted = await pool.fetchrow(sql_docs.delete_document(document_id, org_id))
    if deleted is None:
        raise NotFoundError("Document not found")


@router.post("/documents/{document_id}/embed")
async def document_embed(
    document_id: str,
    org_slug: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()

    if org_slug:
        membership = await get_current_membership(org_slug, str(current_user["id"]))
        org_id = str(membership["org_id"])
    else:
        raw = await pool.fetchrow(
            select(documents_t.c.org_id).where(documents_t.c.id == document_id)
        )
        if raw is None:
            raise NotFoundError("Document not found")
        org_row = await pool.fetchrow(
            select(organizations.c.slug).where(organizations.c.id == raw["org_id"])
        )
        membership = await get_current_membership(org_row["slug"], str(current_user["id"]))
        org_id = str(membership["org_id"])

    from app.services.embedding_service import embed_document

    async with pool.acquire() as conn:
        result = await embed_document(conn, document_id, org_id)

    return {
        "document_id": result.document_id,
        "total_chunks": result.total_chunks,
        "embedded_chunks": result.embedded_chunks,
        "skipped_chunks": result.skipped_chunks,
        "status": result.status,
    }


@router.post("/orgs/{org_slug}/embed")
async def org_embed(
    org_slug: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    membership = await get_current_membership(org_slug, str(current_user["id"]))
    org_id = str(membership["org_id"])

    from app.services.embedding_service import embed_organization

    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await embed_organization(conn, org_id)

    return result
