export const SQL_SELECT_EMBEDDINGS_BY_KEYS = `
  SELECT cache_key, embedding
  FROM embedding_cache
  WHERE cache_key = ANY($1::text[])
`;

export const SQL_UPSERT_EMBEDDING_CACHE = `
  INSERT INTO embedding_cache (cache_key, provider, model, dimensions, embedding, updated_at)
  VALUES ($1, $2, $3, $4, $5::jsonb, now())
  ON CONFLICT (cache_key) DO UPDATE SET
    embedding = EXCLUDED.embedding,
    updated_at = now()
`;
