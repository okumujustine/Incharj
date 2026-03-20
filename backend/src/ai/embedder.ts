import type { PoolClient } from "pg";
import { query } from "../db";
import { sha256 } from "../utils/security";
import { SQL_SELECT_EMBEDDINGS_BY_KEYS, SQL_UPSERT_EMBEDDING_CACHE } from "../sql/ai";
import { getEmbeddingProvider } from "./index";

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

function buildCacheKey(namespace: string, text: string): string {
  return `${namespace}:${sha256(text)}`;
}

export async function embedBatchCached(texts: string[], db: PoolClient): Promise<number[][]> {
  if (texts.length === 0) return [];

  const provider = getEmbeddingProvider();
  if (!provider) return [];

  const keys = texts.map((text) => buildCacheKey(provider.cacheNamespace, text));
  const cachedResult = await query<{ cache_key: string; embedding: unknown }>(
    SQL_SELECT_EMBEDDINGS_BY_KEYS,
    [keys],
    db
  );

  const cachedMap = new Map<string, number[]>();
  for (const row of cachedResult.rows) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding.length === provider.dimensions) {
      cachedMap.set(row.cache_key, embedding);
    }
  }

  const missingIndices: number[] = [];
  const missingTexts: string[] = [];
  for (let index = 0; index < texts.length; index += 1) {
    if (!cachedMap.has(keys[index])) {
      missingIndices.push(index);
      missingTexts.push(texts[index]);
    }
  }

  const result: number[][] = new Array(texts.length);

  if (missingTexts.length > 0) {
    const freshEmbeddings = await provider.embedBatch(missingTexts);

    for (let missIndex = 0; missIndex < missingIndices.length; missIndex += 1) {
      const originalIndex = missingIndices[missIndex];
      const embedding = freshEmbeddings[missIndex] ?? [];
      if (embedding.length !== provider.dimensions) {
        throw new Error(`Embedding dimension mismatch. Expected ${provider.dimensions}, got ${embedding.length}`);
      }

      result[originalIndex] = embedding;

      await query(
        SQL_UPSERT_EMBEDDING_CACHE,
        [
          keys[originalIndex],
          provider.name,
          provider.model,
          provider.dimensions,
          JSON.stringify(embedding),
        ],
        db
      );
    }
  }

  for (let index = 0; index < texts.length; index += 1) {
    if (result[index]) continue;
    const cached = cachedMap.get(keys[index]) ?? [];
    result[index] = cached;
  }

  return result;
}

export async function embedOneCached(text: string, db: PoolClient): Promise<number[]> {
  const [embedding] = await embedBatchCached([text], db);
  return embedding ?? [];
}
