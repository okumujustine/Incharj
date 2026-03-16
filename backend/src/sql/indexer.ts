export const SQL_SELECT_DOCUMENT_HASH = `
  SELECT content_hash FROM documents
  WHERE connector_id = $1 AND external_id = $2
`;

export const SQL_UPSERT_DOCUMENT = `
  INSERT INTO documents (
    org_id, connector_id, external_id, url, title, kind, ext, author_name,
    author_email, content_hash, word_count, mtime, metadata, indexed_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
  ON CONFLICT (connector_id, external_id) DO UPDATE SET
    url = EXCLUDED.url,
    title = EXCLUDED.title,
    kind = EXCLUDED.kind,
    ext = EXCLUDED.ext,
    author_name = EXCLUDED.author_name,
    author_email = EXCLUDED.author_email,
    content_hash = EXCLUDED.content_hash,
    word_count = EXCLUDED.word_count,
    mtime = EXCLUDED.mtime,
    metadata = EXCLUDED.metadata,
    indexed_at = now()
  RETURNING id
`;

export const SQL_DELETE_DOCUMENT_CHUNKS = `DELETE FROM document_chunks WHERE document_id = $1`;

export const SQL_INSERT_DOCUMENT_CHUNK = `
  INSERT INTO document_chunks (document_id, org_id, chunk_index, content, token_count, search_vector)
  VALUES ($1, $2, $3, $4, $5, to_tsvector('english', $4))
`;

export const SQL_UPDATE_DOCUMENT_SEARCH_VECTOR = `
  UPDATE documents
  SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A')
  WHERE id = $1
`;
