from __future__ import annotations

import uuid
from typing import Optional

from app.db.pool import DB
from app.sql import conversations as conv_sql


async def get_or_create(
    conn: DB,
    org_id: str,
    user_id: Optional[str],
    conversation_id: Optional[str],
) -> str:
    """Return an existing conversation ID if valid, otherwise create a new one."""
    if conversation_id:
        row = await conn.fetchrow(
            conv_sql.select_conversation(
                uuid.UUID(conversation_id),
                uuid.UUID(org_id),
            )
        )
        if row:
            return conversation_id

    row = await conn.fetchrow(
        conv_sql.insert_conversation(
            org_id=uuid.UUID(org_id),
            user_id=uuid.UUID(user_id) if user_id else None,
        )
    )
    if row is None:
        raise RuntimeError("Failed to create conversation")
    return str(row["id"])


async def load_history(conn: DB, conversation_id: str, limit: int = 10) -> list[dict]:
    """Load the last `limit` messages in chronological order."""
    rows = await conn.fetch(
        conv_sql.select_recent_messages(uuid.UUID(conversation_id), limit=limit)
    )
    return [{"role": r["role"], "content": r["content"]} for r in rows]


async def add_message(
    conn: DB,
    conversation_id: str,
    role: str,
    content: str,
    retrieval_metadata: Optional[dict] = None,
) -> None:
    await conn.fetchrow(
        conv_sql.insert_message(
            conversation_id=uuid.UUID(conversation_id),
            role=role,
            content=content,
            retrieval_metadata=retrieval_metadata,
        )
    )


def make_title(text: str, max_len: int = 72) -> str:
    """Truncate text to a word boundary and append ellipsis if needed."""
    text = text.strip()
    if len(text) <= max_len:
        return text
    truncated = text[:max_len].rsplit(' ', 1)[0].rstrip('.,;:')
    return truncated + '…'


async def set_title(conn: DB, conversation_id: str, title: str) -> None:
    """Persist a title for a conversation within an already-open connection."""
    await conn.execute(
        conv_sql.update_conversation_title(uuid.UUID(conversation_id), title)
    )


async def list_conversations(conn: DB, org_id: str, limit: int = 50) -> list[dict]:
    rows = await conn.fetch(
        conv_sql.select_conversations_for_org(uuid.UUID(org_id), limit=limit)
    )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in rows
    ]


async def get_messages(conn: DB, conversation_id: str, org_id: str) -> list[dict]:
    """Load all messages for a conversation, verifying org ownership."""
    row = await conn.fetchrow(
        conv_sql.select_conversation(uuid.UUID(conversation_id), uuid.UUID(org_id))
    )
    if not row:
        return []
    rows = await conn.fetch(conv_sql.select_all_messages(uuid.UUID(conversation_id)))
    return [
        {
            "role": r["role"],
            "content": r["content"],
            "retrieval_metadata": r["retrieval_metadata"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]
