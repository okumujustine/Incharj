export const DOCUMENT_FIELDS = `
  id, org_id, connector_id, external_id, url, title, kind, ext,
  author_name, author_email, content_hash, checksum, content_type, source_path,
  source_last_modified_at, source_permissions, extraction_status,
  extraction_error_code, extraction_version, chunking_version, indexing_version,
  word_count, mtime, indexed_at, metadata
`;

export function buildListDocumentsSql(filters: string[], limitParam: number, offsetParam: number): string {
  return `
    SELECT ${DOCUMENT_FIELDS}
    FROM documents
    WHERE ${filters.join(" AND ")}
    ORDER BY indexed_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
}

export function buildCountDocumentsSql(filters: string[]): string {
  return `
    SELECT count(*)::int AS total
    FROM documents
    WHERE ${filters.join(" AND ")}
  `;
}

export const SQL_SELECT_DOCUMENT_BY_ID = `
  SELECT ${DOCUMENT_FIELDS}
  FROM documents
  WHERE id = $1 AND org_id = $2
`;

export const SQL_SELECT_DOCUMENT_CHUNKS = `
  SELECT id, document_id, chunk_index, content, token_count, created_at
  FROM document_chunks
  WHERE document_id = $1
  ORDER BY chunk_index ASC
`;

export const SQL_DELETE_DOCUMENT = `
  DELETE FROM documents WHERE id = $1 AND org_id = $2 RETURNING id
`;
