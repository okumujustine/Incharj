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
