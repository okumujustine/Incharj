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
          setweight(coalesce(d.search_vector, to_tsvector('english', coalesce(left(d.title, 10000), ''))), 'A') ||
          setweight(coalesce(dc_best.search_vector, to_tsvector('english', coalesce(left(dc_best.content, 50000), ''))), 'B')
        ) AS sv
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      LEFT JOIN LATERAL (
        SELECT dc.content, dc.search_vector
        FROM document_chunks dc
        WHERE dc.document_id = d.id
        ORDER BY ts_rank_cd(
          coalesce(dc.search_vector, to_tsvector('english', left(dc.content, 50000))),
          (SELECT q FROM tsq)
        ) DESC
        LIMIT 1
      ) dc_best ON true
      WHERE ${whereClause}
    ),
    ranked AS (
      SELECT
        cand.*,
        ts_rank_cd(cand.sv, tsq.q, 32) *
          exp(-extract(epoch FROM (now() - coalesce(cand.mtime, cand.indexed_at))) / (90.0 * 86400))
          AS raw_score
      FROM candidates cand, tsq
      WHERE tsq.q @@ cand.sv
    )
    SELECT
      id, title, url, kind, ext, mtime, connector_kind, connector_name,
      raw_score AS score,
      ts_headline(
        'english',
        left(coalesce(best_chunk_content, title, ''), 50000),
        (SELECT q FROM tsq),
        'MaxFragments=2, MaxWords=40, MinWords=10, StartSel=<mark>, StopSel=</mark>'
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
        tsq.q @@ coalesce(d.search_vector, to_tsvector('english', coalesce(d.title, '')))
        OR EXISTS (
          SELECT 1 FROM document_chunks dc
          WHERE dc.document_id = d.id
            AND tsq.q @@ coalesce(dc.search_vector, to_tsvector('english', left(dc.content, 10000)))
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
        GREATEST(
          similarity(coalesce(d.title, ''), $2),
          coalesce((
            SELECT max(similarity(dc.content, $2))
            FROM document_chunks dc
            WHERE dc.document_id = d.id
          ), 0)
        ) AS raw_score,
        (
          SELECT dc.content FROM document_chunks dc
          WHERE dc.document_id = d.id
          ORDER BY similarity(dc.content, $2) DESC
          LIMIT 1
        ) AS best_chunk_content
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      WHERE ${whereClause}
        AND (
          similarity(coalesce(d.title, ''), $2) > 0.1
          OR EXISTS (
            SELECT 1 FROM document_chunks dc
            WHERE dc.document_id = d.id AND similarity(dc.content, $2) > 0.1
          )
        )
    )
    SELECT
      id, title, url, kind, ext, mtime, connector_kind, connector_name,
      raw_score AS score,
      coalesce(best_chunk_content, title, '') AS snippet
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
      AND (
        similarity(coalesce(d.title, ''), $2) > 0.1
        OR EXISTS (
          SELECT 1 FROM document_chunks dc
          WHERE dc.document_id = d.id AND similarity(dc.content, $2) > 0.1
        )
      );
  `;
}
