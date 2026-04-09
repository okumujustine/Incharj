from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.tables import invitations, memberships, users


def select_user_by_email(email: str):
    return select(users.c.id).where(users.c.email == email)


def select_membership_by_org_user(org_id, user_id):
    return select(memberships.c.id).where(
        memberships.c.org_id == org_id, memberships.c.user_id == user_id
    )


def select_pending_invitation(org_id, email: str):
    return select(invitations.c.expires_at).where(
        invitations.c.org_id == org_id,
        invitations.c.email == email,
        invitations.c.accepted_at.is_(None),
    )


def insert_invitation(
    org_id,
    invited_by,
    email: str,
    role: str,
    token: str,
):
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    return (
        insert(invitations)
        .values(
            org_id=org_id,
            invited_by=invited_by,
            email=email,
            role=role,
            token=token,
            expires_at=expires_at,
        )
        .returning(
            invitations.c.id,
            invitations.c.org_id,
            invitations.c.invited_by,
            invitations.c.email,
            invitations.c.role,
            invitations.c.token,
            invitations.c.accepted_at,
            invitations.c.expires_at,
            invitations.c.created_at,
        )
    )


def select_invitation_by_token(token: str):
    return select(
        invitations.c.id,
        invitations.c.org_id,
        invitations.c.email,
        invitations.c.role,
        invitations.c.accepted_at,
        invitations.c.expires_at,
    ).where(invitations.c.token == token)


def upsert_membership_on_accept(org_id, user_id, role: str):
    stmt = pg_insert(memberships).values(org_id=org_id, user_id=user_id, role=role)
    return stmt.on_conflict_do_update(
        constraint="uq_membership_org_user",
        set_={"role": stmt.excluded.role},
    ).returning(
        memberships.c.id,
        memberships.c.org_id,
        memberships.c.user_id,
        memberships.c.role,
        memberships.c.joined_at,
    )


def accept_invitation(invitation_id):
    from sqlalchemy import func

    return (
        update(invitations)
        .where(invitations.c.id == invitation_id)
        .values(accepted_at=func.now())
    )
