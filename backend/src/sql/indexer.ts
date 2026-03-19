export const SQL_SELECT_DOCUMENT_HASH = `
  SELECT content_hash FROM documents
  WHERE connector_id = $1 AND external_id = $2
`;

export const SQL_UPSERT_DOCUMENT = `
  INSERT INTO documents (
    org_id, connector_id, external_id, url, title, kind, ext, author_name,
    author_email, content_hash, checksum, word_count, mtime, source_last_modified_at,
    content_type, source_path, source_permissions, extraction_status,
    extraction_error_code, extraction_version, chunking_version, indexing_version,
    metadata, indexed_at
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21, $22, $23,
    $24, $25, now()
  )
  ON CONFLICT (connector_id, external_id) DO UPDATE SET
    url = EXCLUDED.url,
    title = EXCLUDED.title,
    kind = EXCLUDED.kind,
    ext = EXCLUDED.ext,
    author_name = EXCLUDED.author_name,
    author_email = EXCLUDED.author_email,
    content_hash = EXCLUDED.content_hash,
    checksum = EXCLUDED.checksum,
    word_count = EXCLUDED.word_count,
    mtime = EXCLUDED.mtime,
    source_last_modified_at = EXCLUDED.source_last_modified_at,
    content_type = EXCLUDED.content_type,
    source_path = EXCLUDED.source_path,
    source_permissions = EXCLUDED.source_permissions,
    extraction_status = EXCLUDED.extraction_status,
    extraction_error_code = EXCLUDED.extraction_error_code,
    extraction_version = EXCLUDED.extraction_version,
    chunking_version = EXCLUDED.chunking_version,
    indexing_version = EXCLUDED.indexing_version,
    metadata = EXCLUDED.metadata,
    indexed_at = now()
  RETURNING id
`;

export const SQL_DELETE_DOCUMENT_CHUNKS = `DELETE FROM document_chunks WHERE document_id = $1`;

export const SQL_INSERT_DOCUMENT_CHUNK = `
  INSERT INTO document_chunks (document_id, org_id, chunk_index, content, token_count, search_vector)
  VALUES ($1, $2, $3, $4, $5, to_tsvector('english', left($4, 50000)))
`;

export const SQL_UPDATE_DOCUMENT_SEARCH_VECTOR = `
  UPDATE documents
  SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A')
  WHERE id = $1
`;
