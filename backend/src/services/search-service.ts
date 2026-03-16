import type { PoolClient } from "pg";
import type { SearchOptions, SearchResult, SearchResponse } from "../types/search";
import {
  buildFtsCountQuery,
  buildFtsQuery,
  buildFuzzyCountQuery,
  buildFuzzyQuery,
} from "../sql/search";


function buildFilters(options: SearchOptions): { values: unknown[]; whereClause: string } {
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

  return { values, whereClause: filters.join(" AND ") };
}

function mapRow(row: Record<string, unknown>): SearchResult {
  return {
    id: row.id as string,
    title: row.title as string,
    url: row.url as string | null,
    kind: row.kind as string | null,
    ext: row.ext as string | null,
    snippet: (row.snippet as string) ?? "",
    score: Number(row.score),
    mtime: row.mtime as string | null,
    connector_kind: row.connector_kind as string,
    connector_name: row.connector_name as string,
  };
}

async function ftSearch(client: PoolClient, options: SearchOptions): Promise<SearchResponse | null> {
  const { values, whereClause } = buildFilters(options);
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  values.push(limit, offset);

  const sql = buildFtsQuery(whereClause, values.length - 1, values.length);
  const countSql = buildFtsCountQuery(whereClause);
  const countValues = values.slice(0, -2);

  const [results, countResult] = await Promise.all([
    client.query(sql, values),
    client.query<{ total: number }>(countSql, countValues),
  ]);

  const total = countResult.rows[0]?.total ?? 0;
  if (total === 0) return null;

  return { total, results: results.rows.map(mapRow), query: options.query, offset, limit };
}

async function fuzzySearch(client: PoolClient, options: SearchOptions): Promise<SearchResponse> {
  const { values, whereClause } = buildFilters(options);
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  values.push(limit, offset);

  const sql = buildFuzzyQuery(whereClause, values.length - 1, values.length);
  const countSql = buildFuzzyCountQuery(whereClause);
  const countValues = values.slice(0, -2);

  const [results, countResult] = await Promise.all([
    client.query(sql, values),
    client.query<{ total: number }>(countSql, countValues),
  ]);

  return {
    total: countResult.rows[0]?.total ?? 0,
    results: results.rows.map(mapRow),
    query: options.query,
    offset,
    limit,
  };
}

export async function fullTextSearch(client: PoolClient, options: SearchOptions): Promise<SearchResponse> {
  const ftsResult = await ftSearch(client, options);
  if (ftsResult !== null) return ftsResult;
  return fuzzySearch(client, options);
}
