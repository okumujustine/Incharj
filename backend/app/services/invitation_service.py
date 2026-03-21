from __future__ import annotations

import os
from typing import Any

from app.errors import BadRequestError, ConflictError, NotFoundError
from app.sql import invitations as sql_inv


async def create_invitation(
    conn,
    org_id: str,
    invited_by: str,
    email: str,
    role: str = "member",
) -> dict[str, Any]:
    user = await conn.fetchrow(sql_inv.select_user_by_email(email))
    if user:
        membership = await conn.fetchrow(
            sql_inv.select_membership_by_org_user(org_id, str(user["id"]))
        )
        if membership:
            raise ConflictError("User is already a member of this organization")

    existing = await conn.fetchrow(sql_inv.select_pending_invitation(org_id, email))
    if existing:
        from datetime import datetime, timezone

        expires_at = existing["expires_at"]
        if hasattr(expires_at, "tzinfo") and expires_at.tzinfo:
            if expires_at > datetime.now(timezone.utc):
                raise ConflictError("Pending invitation already exists for this email")

    token = os.urandom(48).hex()
    row = await conn.fetchrow(
        sql_inv.insert_invitation(
            org_id=org_id,
            invited_by=invited_by,
            email=email,
            role=role,
            token=token,
        )
    )
    return dict(row)


async def accept_invitation(
    conn,
    token: str,
    user: dict[str, Any],
) -> dict[str, Any]:
    from datetime import datetime, timezone

    invitation = await conn.fetchrow(sql_inv.select_invitation_by_token(token))
    if not invitation:
        raise NotFoundError("Invitation not found")
    if invitation["accepted_at"] is not None:
        raise BadRequestError("Invitation already accepted")

    expires_at = invitation["expires_at"]
    if hasattr(expires_at, "tzinfo") and expires_at.tzinfo and expires_at < datetime.now(timezone.utc):
        raise BadRequestError("Invitation has expired")

    if invitation["email"].lower() != user["email"].lower():
        raise BadRequestError("Invitation email does not match your account email")

    membership_row = await conn.fetchrow(
        sql_inv.upsert_membership_on_accept(invitation["org_id"], user["id"], invitation["role"])
    )
    await conn.execute(sql_inv.accept_invitation(invitation["id"]))
    return dict(membership_row)
