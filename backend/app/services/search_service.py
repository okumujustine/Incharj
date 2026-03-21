from __future__ import annotations

import uuid as _uuid_mod
from typing import Any

from sqlalchemy import select, text

from app.ai.embedder import embed_one_cached
from app.ai.index import cosine_similarity, get_embedding_provider
from app.db.pool import DB
from app.db.tables import document_chunks


def _build_filters(options: dict[str, Any]) -> tuple[dict[str, Any], str]:
    params: dict[str, Any] = {
        "org_id": _uuid_mod.UUID(options["org_id"]),
        "query": options["query"],
    }
    filters = ["d.org_id = :org_id"]

    if options.get("connector_id"):
        params["connector_id"] = _uuid_mod.UUID(options["connector_id"])
        filters.append("d.connector_id = :connector_id")
    if options.get("kind"):
        params["kind"] = options["kind"]
        filters.append("d.kind = :kind")
    if options.get("from_date"):
        params["from_date"] = options["from_date"]
        filters.append("d.mtime >= :from_date")
    if options.get("to_date"):
        params["to_date"] = options["to_date"]
        filters.append("d.mtime <= :to_date")

    return params, " AND ".join(filters)


def _build_fts_query(where_clause: str) -> str:
    return f"""
    WITH tsq AS (
      SELECT websearch_to_tsquery('english', :query) AS q
    ),
    candidates AS (
      SELECT
        d.id, d.title, d.url, d.kind, d.ext, d.mtime, d.indexed_at,
        c.kind AS connector_kind, c.name AS connector_name,
        dc_best.content AS best_chunk_content,
        (
          setweight(coalesce(d.search_vector, ''::tsvector), 'A') ||
          setweight(coalesce(dc_best.search_vector, ''::tsvector), 'B')
        ) AS sv
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      LEFT JOIN LATERAL (
        SELECT dc.content, dc.search_vector
        FROM document_chunks dc
        WHERE dc.document_id = d.id
          AND dc.search_vector @@ (SELECT q FROM tsq)
        ORDER BY ts_rank_cd(dc.search_vector, (SELECT q FROM tsq)) DESC
        LIMIT 1
      ) dc_best ON true
      WHERE {where_clause}
        AND (
          d.search_vector @@ (SELECT q FROM tsq)
          OR dc_best.content IS NOT NULL
        )
    ),
    ranked AS (
      SELECT
        cand.*,
        ts_rank_cd(cand.sv, tsq.q, 32) *
          exp(-extract(epoch FROM (now() - coalesce(cand.mtime, cand.indexed_at))) / (90.0 * 86400))
          AS raw_score
      FROM candidates cand, tsq
    )
    SELECT
      id, title, url, kind, ext, mtime, connector_kind, connector_name,
      raw_score AS score,
      ts_headline(
        'english',
        left(coalesce(best_chunk_content, title, ''), 5000),
        (SELECT q FROM tsq),
        'MaxFragments=2, MaxWords=40, MinWords=10, StartSel=<<, StopSel=>>'
      ) AS snippet
    FROM ranked
    ORDER BY raw_score DESC
    LIMIT :limit OFFSET :offset;
    """


def _build_fts_count_query(where_clause: str) -> str:
    return f"""
    WITH tsq AS (SELECT websearch_to_tsquery('english', :query) AS q)
    SELECT count(*)::int AS total
    FROM documents d
    JOIN connectors c ON c.id = d.connector_id
    CROSS JOIN tsq
    WHERE {where_clause}
      AND (
        d.search_vector @@ tsq.q
        OR EXISTS (
          SELECT 1 FROM document_chunks dc
          WHERE dc.document_id = d.id
            AND dc.search_vector @@ tsq.q
        )
      );
    """


def _build_fuzzy_query(where_clause: str) -> str:
    return f"""
    WITH ranked AS (
      SELECT
        d.id, d.title, d.url, d.kind, d.ext, d.mtime, d.indexed_at,
        c.kind AS connector_kind, c.name AS connector_name,
        similarity(coalesce(d.title, ''), :query) AS raw_score,
        d.title AS best_chunk_content
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      WHERE {where_clause}
        AND similarity(coalesce(d.title, ''), :query) > 0.1
    )
    SELECT
      id, title, url, kind, ext, mtime, connector_kind, connector_name,
      raw_score AS score,
      coalesce(best_chunk_content, '') AS snippet
    FROM ranked
    ORDER BY raw_score DESC
    LIMIT :limit OFFSET :offset;
    """


def _build_fuzzy_count_query(where_clause: str) -> str:
    return f"""
    SELECT count(*)::int AS total
    FROM documents d
    JOIN connectors c ON c.id = d.connector_id
    WHERE {where_clause}
      AND similarity(coalesce(d.title, ''), :query) > 0.1;
    """


def _map_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "url": row["url"],
        "kind": row["kind"],
        "ext": row["ext"],
        "snippet": row["snippet"] or "",
        "score": float(row["score"]),
        "mtime": row["mtime"].isoformat() if row["mtime"] and hasattr(row["mtime"], "isoformat") else row["mtime"],
        "connector_kind": row["connector_kind"],
        "connector_name": row["connector_name"],
    }


async def _apply_semantic_rerank(
    conn: DB,
    options: dict[str, Any],
    results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not results:
        return results

    provider = get_embedding_provider()
    if provider is None:
        return results

    query_embedding = await embed_one_cached(options["query"], conn)
    if not query_embedding:
        return results

    doc_ids = [r["id"] for r in results]
    embedding_rows = await conn.fetch(
        select(
            document_chunks.c.document_id,
            document_chunks.c.content,
            document_chunks.c.embedding,
        ).where(
            document_chunks.c.document_id.in_(doc_ids),
            document_chunks.c.embedding.isnot(None),
        )
    )

    best_chunk_by_doc: dict[str, dict[str, Any]] = {}
    for row in embedding_rows:
        embedding = list(row["embedding"]) if row["embedding"] is not None else []
        if not embedding or len(embedding) != len(query_embedding):
            continue
        sim = cosine_similarity(query_embedding, embedding)
        doc_id = str(row["document_id"])
        best = best_chunk_by_doc.get(doc_id)
        if best is None or sim > best["similarity"]:
            best_chunk_by_doc[doc_id] = {"similarity": sim, "content": row["content"]}

    lexical_max = max((r["score"] for r in results), default=0.0)
    if lexical_max <= 0:
        return results

    reranked = []
    for r in results:
        semantic = best_chunk_by_doc.get(r["id"])
        lexical_norm = r["score"] / lexical_max
        semantic_norm = max(0.0, min(1.0, (semantic["similarity"] + 1) / 2)) if semantic else 0.0
        reranked.append({
            **r,
            "score": lexical_norm * 0.6 + semantic_norm * 0.4,
            "snippet": semantic["content"][:320] if semantic else r["snippet"],
        })

    return sorted(reranked, key=lambda x: x["score"], reverse=True)


async def _ft_search(conn: DB, options: dict[str, Any]) -> dict[str, Any] | None:
    params, where_clause = _build_filters(options)
    params["limit"] = options.get("limit", 20)
    params["offset"] = options.get("offset", 0)

    rows = await conn.fetch(text(_build_fts_query(where_clause)).bindparams(**params))
    count_row = await conn.fetchrow(
        text(_build_fts_count_query(where_clause)).bindparams(
            **{k: v for k, v in params.items() if k not in ("limit", "offset")}
        )
    )

    total = count_row["total"] if count_row else 0
    if total == 0:
        return None

    mapped = [_map_row(r) for r in rows]
    reranked = await _apply_semantic_rerank(conn, options, mapped)
    return {
        "total": total,
        "results": reranked,
        "query": options["query"],
        "offset": params["offset"],
        "limit": params["limit"],
    }


async def _fuzzy_search(conn: DB, options: dict[str, Any]) -> dict[str, Any]:
    params, where_clause = _build_filters(options)
    params["limit"] = options.get("limit", 20)
    params["offset"] = options.get("offset", 0)

    rows = await conn.fetch(text(_build_fuzzy_query(where_clause)).bindparams(**params))
    count_row = await conn.fetchrow(
        text(_build_fuzzy_count_query(where_clause)).bindparams(
            **{k: v for k, v in params.items() if k not in ("limit", "offset")}
        )
    )

    mapped = [_map_row(r) for r in rows]
    reranked = await _apply_semantic_rerank(conn, options, mapped)
    return {
        "total": count_row["total"] if count_row else 0,
        "results": reranked,
        "query": options["query"],
        "offset": params["offset"],
        "limit": params["limit"],
    }


async def full_text_search(conn: DB, options: dict[str, Any]) -> dict[str, Any]:
    tsq_row = await conn.fetchrow(
        text("SELECT (websearch_to_tsquery('english', :query)::text = '') AS is_empty").bindparams(
            query=options["query"]
        )
    )
    if tsq_row and tsq_row["is_empty"]:
        return {
            "query": options["query"],
            "total": 0,
            "results": [],
            "limit": options.get("limit", 20),
            "offset": options.get("offset", 0),
        }

    fts_result = await _ft_search(conn, options)
    if fts_result is not None:
        return fts_result
    return await _fuzzy_search(conn, options)
