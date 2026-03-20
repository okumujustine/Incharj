export function buildFtsQuery(whereClause: string, limitParam: number, offsetParam: number): string {
  return `
    WITH tsq AS (
      SELECT websearch_to_tsquery('english', $2) AS q
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
      WHERE ${whereClause}
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
    LIMIT $${limitParam} OFFSET $${offsetParam};
  `;
}

export function buildFtsCountQuery(whereClause: string): string {
  return `
    WITH tsq AS (SELECT websearch_to_tsquery('english', $2) AS q)
    SELECT count(*)::int AS total
    FROM documents d
    JOIN connectors c ON c.id = d.connector_id
    CROSS JOIN tsq
    WHERE ${whereClause}
      AND (
        d.search_vector @@ tsq.q
        OR EXISTS (
          SELECT 1 FROM document_chunks dc
          WHERE dc.document_id = d.id
            AND dc.search_vector @@ tsq.q
        )
      );
  `;
}

export function buildFuzzyQuery(whereClause: string, limitParam: number, offsetParam: number): string {
  return `
    WITH ranked AS (
      SELECT
        d.id, d.title, d.url, d.kind, d.ext, d.mtime, d.indexed_at,
        c.kind AS connector_kind, c.name AS connector_name,
        similarity(coalesce(d.title, ''), $2) AS raw_score,
        d.title AS best_chunk_content
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      WHERE ${whereClause}
        AND similarity(coalesce(d.title, ''), $2) > 0.1
    )
    SELECT
      id, title, url, kind, ext, mtime, connector_kind, connector_name,
      raw_score AS score,
      coalesce(best_chunk_content, '') AS snippet
    FROM ranked
    ORDER BY raw_score DESC
    LIMIT $${limitParam} OFFSET $${offsetParam};
  `;
}

export function buildFuzzyCountQuery(whereClause: string): string {
  return `
    SELECT count(*)::int AS total
    FROM documents d
    JOIN connectors c ON c.id = d.connector_id
    WHERE ${whereClause}
      AND similarity(coalesce(d.title, ''), $2) > 0.1;
  `;
}

export const SQL_SELECT_CHUNK_EMBEDDINGS_BY_DOC_IDS = `
  SELECT document_id, content, embedding
  FROM document_chunks
  WHERE document_id = ANY($1::uuid[])
    AND embedding IS NOT NULL
`;
