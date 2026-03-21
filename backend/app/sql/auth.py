from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, insert, select, update

from app.db.tables import memberships, organizations, sessions, users


def check_email_exists(email: str):
    return select(users.c.id).where(users.c.email == email)


def insert_user(email: str, hashed_password: str, full_name: str | None):
    return (
        insert(users)
        .values(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            is_verified=False,
            is_active=True,
        )
        .returning(users.c.id)
    )


def insert_session(
    user_id,
    refresh_token: str,
    user_agent: str | None,
    ip_address: str | None,
    expires_days: int,
):
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
    return insert(sessions).values(
        user_id=user_id,
        refresh_token=refresh_token,
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=expires_at,
    )


def select_user_for_login(email: str):
    return select(users.c.id, users.c.hashed_password, users.c.is_active).where(
        users.c.email == email
    )


def select_session_by_token(refresh_token: str):
    return select(sessions.c.id, sessions.c.user_id, sessions.c.expires_at).where(
        sessions.c.refresh_token == refresh_token
    )


def select_user_is_active(user_id):
    return select(users.c.id, users.c.is_active).where(users.c.id == user_id)


def delete_session_by_id(session_id):
    return delete(sessions).where(sessions.c.id == session_id)


def delete_session_by_token(refresh_token: str):
    return delete(sessions).where(sessions.c.refresh_token == refresh_token)


def select_user_by_id(user_id):
    return select(
        users.c.id,
        users.c.email,
        users.c.hashed_password,
        users.c.full_name,
        users.c.avatar_url,
        users.c.is_verified,
        users.c.is_active,
        users.c.created_at,
    ).where(users.c.id == user_id)


def select_org_id_by_slug(slug: str):
    return select(organizations.c.id).where(organizations.c.slug == slug)


def select_membership_by_org_user(org_id, user_id):
    return select(
        memberships.c.id,
        memberships.c.org_id,
        memberships.c.user_id,
        memberships.c.role,
        memberships.c.joined_at,
    ).where(memberships.c.org_id == org_id, memberships.c.user_id == user_id)
