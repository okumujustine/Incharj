from __future__ import annotations

import app.sql.indexer as sql_indexer


async def update_search_index(conn, document_id: str) -> None:
    await conn.execute(sql_indexer.update_document_search_vector(document_id))


async def finalize_searchability(conn, document_id: str) -> None:
    await update_search_index(conn, document_id)
