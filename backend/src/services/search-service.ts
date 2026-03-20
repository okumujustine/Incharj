import type { PoolClient } from "pg";
import type { SearchOptions, SearchResult, SearchResponse } from "../types/search";
import { cosineSimilarity, getEmbeddingProvider } from "../ai";
import { embedOneCached } from "../ai/embedder";
import {
  buildFtsCountQuery,
  buildFtsQuery,
  buildFuzzyCountQuery,
  buildFuzzyQuery,
  SQL_SELECT_CHUNK_EMBEDDINGS_BY_DOC_IDS,
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

function parseEmbedding(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is number => typeof item === "number");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is number => typeof item === "number")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function applySemanticRerank(
  client: PoolClient,
  options: SearchOptions,
  results: SearchResult[]
): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const provider = getEmbeddingProvider();
  if (!provider) return results;

  const queryEmbedding = await embedOneCached(options.query, client);
  if (!queryEmbedding.length) return results;

  const docIds = results.map((row) => row.id);
  const embeddingRows = await client.query<{
    document_id: string;
    content: string;
    embedding: unknown;
  }>(SQL_SELECT_CHUNK_EMBEDDINGS_BY_DOC_IDS, [docIds]);

  const bestChunkByDoc = new Map<string, { similarity: number; content: string }>();
  for (const row of embeddingRows.rows) {
    const embedding = parseEmbedding(row.embedding);
    if (!embedding.length || embedding.length !== queryEmbedding.length) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    const best = bestChunkByDoc.get(row.document_id);
    if (!best || similarity > best.similarity) {
      bestChunkByDoc.set(row.document_id, { similarity, content: row.content });
    }
  }

  const lexicalMax = Math.max(...results.map((row) => row.score), 0);
  if (lexicalMax <= 0) return results;

  const reranked = results.map((row) => {
    const semantic = bestChunkByDoc.get(row.id);
    const lexicalNorm = row.score / lexicalMax;
    const semanticNorm = semantic ? Math.max(0, Math.min(1, (semantic.similarity + 1) / 2)) : 0;
    const hybridScore = lexicalNorm * 0.6 + semanticNorm * 0.4;

    return {
      ...row,
      score: hybridScore,
      snippet: semantic ? semantic.content.slice(0, 320) : row.snippet,
    };
  });

  return reranked.sort((a, b) => b.score - a.score);
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

  const mappedResults = results.rows.map(mapRow);
  const rerankedResults = await applySemanticRerank(client, options, mappedResults);

  return { total, results: rerankedResults, query: options.query, offset, limit };
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

  const mappedResults = results.rows.map(mapRow);
  const rerankedResults = await applySemanticRerank(client, options, mappedResults);

  return {
    total: countResult.rows[0]?.total ?? 0,
    results: rerankedResults,
    query: options.query,
    offset,
    limit,
  };
}

export async function fullTextSearch(client: PoolClient, options: SearchOptions): Promise<SearchResponse> {
  // Stop words produce an empty tsquery — detect early to skip the expensive fuzzy fallback
  const tsqCheck = await client.query<{ is_empty: boolean }>(
    `SELECT (websearch_to_tsquery('english', $1)::text = '') AS is_empty`,
    [options.query]
  );
  if (tsqCheck.rows[0]?.is_empty) {
    return { query: options.query, total: 0, results: [], limit: options.limit ?? 20, offset: options.offset ?? 0 };
  }

  const ftsResult = await ftSearch(client, options);
  if (ftsResult !== null) return ftsResult;
  return fuzzySearch(client, options);
}
