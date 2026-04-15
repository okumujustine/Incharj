from __future__ import annotations

import uuid
from sqlalchemy import func, insert, select

from app.db.tables import conversation_messages, conversations


def insert_conversation(org_id: uuid.UUID, user_id: uuid.UUID | None = None):
    return (
        insert(conversations)
        .values(
            org_id=org_id,
            user_id=user_id,
            created_at=func.now(),
            updated_at=func.now(),
        )
        .returning(conversations.c.id)
    )


def select_conversation(conversation_id: uuid.UUID, org_id: uuid.UUID):
    return select(conversations).where(
        conversations.c.id == conversation_id,
        conversations.c.org_id == org_id,
    )


def insert_message(
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    retrieval_metadata: dict | None = None,
):
    return (
        insert(conversation_messages)
        .values(
            conversation_id=conversation_id,
            role=role,
            content=content,
            created_at=func.now(),
            retrieval_metadata=retrieval_metadata,
        )
        .returning(conversation_messages.c.id)
    )


def select_recent_messages(conversation_id: uuid.UUID, limit: int = 10):
    # Subquery: take the last N by created_at desc, then re-order asc for prompt
    inner = (
        select(conversation_messages)
        .where(conversation_messages.c.conversation_id == conversation_id)
        .order_by(conversation_messages.c.created_at.desc())
        .limit(limit)
        .subquery("recent")
    )
    return select(inner).order_by(inner.c.created_at.asc())
