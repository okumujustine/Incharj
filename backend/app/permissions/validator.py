from __future__ import annotations

from typing import Any


async def resolve_document_permissions(
    conn,
    org_id: str,
    document_id: str,
    source_permissions: dict[str, Any] | None,
) -> dict[str, Any]:
    # Org-wide view permission — future ACL placeholder
    return {"org_id": org_id, "access": "org_wide"}


async def validate_and_attach_permissions(
    conn,
    org_id: str,
    document_id: str,
    source_permissions: dict[str, Any] | None,
) -> None:
    await resolve_document_permissions(conn, org_id, document_id, source_permissions)
