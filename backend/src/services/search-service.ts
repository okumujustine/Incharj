import type { PoolClient } from "pg";

interface SearchOptions {
  orgId: string;
  query: string;
  connectorId?: string;
  kind?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export async function fullTextSearch(
  client: PoolClient,
  options: SearchOptions
) {
  const values: unknown[] = [options.orgId, options.query];
  const filters = ["d.org_id = $1"];

  if (options.connectorId) {
    values.push(options.connectorId);
    filters.push(`d.connector_id = $${values.length}`);
  }
  if (options.kind) {
    values.push(options.kind);
    filters.push(`d.kind = $${values.length}`);
  }
  if (options.fromDate) {
    values.push(options.fromDate);
    filters.push(`d.mtime >= $${values.length}`);
  }
  if (options.toDate) {
    values.push(options.toDate);
    filters.push(`d.mtime <= $${values.length}`);
  }

  const whereClause = filters.join(" AND ");
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  values.push(limit, offset);

  const sql = `
    WITH tsq AS (
      SELECT websearch_to_tsquery('english', $2) AS q
    ),
    candidates AS (
      SELECT
        d.id,
        d.title,
        d.url,
        d.kind,
        d.ext,
        d.mtime,
        d.indexed_at,
        c.kind AS connector_kind,
        c.name AS connector_name,
        dc_best.content AS best_chunk_content,
        (
          setweight(coalesce(d.search_vector, to_tsvector('english', coalesce(d.title, ''))), 'A') ||
          setweight(coalesce(dc_best.search_vector, to_tsvector('english', coalesce(dc_best.content, ''))), 'B')
        ) AS sv
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      LEFT JOIN LATERAL (
        SELECT dc.content, dc.search_vector
        FROM document_chunks dc
        WHERE dc.document_id = d.id
        ORDER BY ts_rank_cd(
          coalesce(dc.search_vector, to_tsvector('english', dc.content)),
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
      id,
      title,
      url,
      kind,
      ext,
      mtime,
      connector_kind,
      connector_name,
      raw_score AS score,
      ts_headline(
        'english',
        coalesce(best_chunk_content, title, ''),
        (SELECT q FROM tsq),
        'MaxFragments=2, MaxWords=40, MinWords=10, StartSel=<mark>, StopSel=</mark>'
      ) AS snippet
    FROM ranked
    ORDER BY raw_score DESC
    LIMIT $${values.length - 1} OFFSET $${values.length};
  `;

  const results = await client.query(sql, values);

  const countValues = values.slice(0, -2);
  const countSql = `
    WITH tsq AS (
      SELECT websearch_to_tsquery('english', $2) AS q
    ),
    candidates AS (
      SELECT
        (
          setweight(coalesce(d.search_vector, to_tsvector('english', coalesce(d.title, ''))), 'A') ||
          setweight(to_tsvector('english', coalesce(
            (SELECT string_agg(dc.content, ' ') FROM document_chunks dc WHERE dc.document_id = d.id),
            ''
          )), 'B')
        ) AS sv
      FROM documents d
      JOIN connectors c ON c.id = d.connector_id
      WHERE ${whereClause}
    )
    SELECT count(*)::int AS total
    FROM candidates, tsq
    WHERE tsq.q @@ candidates.sv;
  `;
  const countResult = await client.query<{ total: number }>(countSql, countValues);

  return {
    total: countResult.rows[0]?.total ?? 0,
    results: results.rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      kind: row.kind,
      ext: row.ext,
      snippet: row.snippet,
      score: Number(row.score),
      mtime: row.mtime,
      connector_kind: row.connector_kind,
      connector_name: row.connector_name
    })),
    query: options.query,
    offset,
    limit
  };
}
