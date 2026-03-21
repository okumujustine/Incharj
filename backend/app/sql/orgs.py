from __future__ import annotations

from sqlalchemy import delete, insert, select, update

from app.db.tables import invitations, memberships, organizations, users


def select_org_by_slug(slug: str):
    return select(
        organizations.c.id,
        organizations.c.slug,
        organizations.c.name,
        organizations.c.plan,
        organizations.c.settings,
        organizations.c.created_at,
    ).where(organizations.c.slug == slug)


def select_orgs_for_user(user_id):
    return (
        select(
            organizations.c.id,
            organizations.c.slug,
            organizations.c.name,
            organizations.c.plan,
            organizations.c.settings,
            organizations.c.created_at,
        )
        .join(memberships, memberships.c.org_id == organizations.c.id)
        .where(memberships.c.user_id == user_id)
        .order_by(organizations.c.created_at.desc())
    )


def insert_org(slug: str, name: str):
    return (
        insert(organizations)
        .values(slug=slug, name=name, plan="free")
        .returning(
            organizations.c.id,
            organizations.c.slug,
            organizations.c.name,
            organizations.c.plan,
            organizations.c.settings,
            organizations.c.created_at,
        )
    )


def insert_membership(org_id, user_id, role: str):
    return insert(memberships).values(org_id=org_id, user_id=user_id, role=role)


def select_members(org_id):
    return (
        select(
            memberships.c.id,
            memberships.c.org_id,
            memberships.c.user_id,
            memberships.c.role,
            memberships.c.joined_at,
            users.c.email,
            users.c.full_name,
            users.c.avatar_url,
        )
        .outerjoin(users, users.c.id == memberships.c.user_id)
        .where(memberships.c.org_id == org_id)
    )


def delete_membership(org_id, user_id):
    return (
        delete(memberships)
        .where(memberships.c.org_id == org_id, memberships.c.user_id == user_id)
        .returning(memberships.c.id)
    )


def update_membership_role(org_id, user_id, role: str):
    return (
        update(memberships)
        .where(memberships.c.org_id == org_id, memberships.c.user_id == user_id)
        .values(role=role)
        .returning(
            memberships.c.id,
            memberships.c.org_id,
            memberships.c.user_id,
            memberships.c.role,
            memberships.c.joined_at,
        )
    )


def select_pending_invitations(org_id):
    return select(
        invitations.c.id,
        invitations.c.org_id,
        invitations.c.invited_by,
        invitations.c.email,
        invitations.c.role,
        invitations.c.token,
        invitations.c.accepted_at,
        invitations.c.expires_at,
        invitations.c.created_at,
    ).where(invitations.c.org_id == org_id, invitations.c.accepted_at.is_(None))


def check_org_slug_exists(slug: str):
    return select(organizations.c.id).where(organizations.c.slug == slug)
