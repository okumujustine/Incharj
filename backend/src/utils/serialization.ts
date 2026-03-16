export function mapUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    is_verified: row.is_verified,
    is_active: row.is_active,
    created_at: row.created_at
  };
}

export function mapOrg(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    plan: row.plan,
    settings: row.settings,
    created_at: row.created_at
  };
}

export function mapMembership(
  row: Record<string, unknown>,
  user?: Record<string, unknown> | null
) {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at,
    user: user
      ? {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        }
      : null
  };
}

export function mapInvitation(row: Record<string, unknown>) {
  return {
    id: row.id,
    org_id: row.org_id,
    invited_by: row.invited_by,
    email: row.email,
    role: row.role,
    token: row.token,
    accepted_at: row.accepted_at,
    expires_at: row.expires_at,
    created_at: row.created_at
  };
}

export function mapConnector(row: Record<string, unknown>) {
  return {
    id: row.id,
    org_id: row.org_id,
    created_by: row.created_by,
    kind: row.kind,
    name: row.name,
    status: row.status,
    config: row.config,
    sync_cursor: row.sync_cursor,
    last_synced_at: row.last_synced_at,
    last_error: row.last_error,
    sync_frequency: row.sync_frequency,
    doc_count: row.doc_count,
    has_credentials: Boolean(row.credentials),
    created_at: row.created_at
  };
}

export function mapSyncJob(row: Record<string, unknown>) {
  return {
    id: row.id,
    connector_id: row.connector_id,
    org_id: row.org_id,
    triggered_by: row.triggered_by,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    docs_indexed: row.docs_indexed,
    docs_skipped: row.docs_skipped,
    docs_errored: row.docs_errored,
    error_message: row.error_message,
    meta: row.meta,
    created_at: row.created_at
  };
}

export function mapDocumentChunk(row: Record<string, unknown>) {
  return {
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    token_count: row.token_count,
    created_at: row.created_at
  };
}

export function mapDocument(
  row: Record<string, unknown>,
  chunks: Array<Record<string, unknown>> = []
) {
  return {
    id: row.id,
    org_id: row.org_id,
    connector_id: row.connector_id,
    external_id: row.external_id,
    url: row.url,
    title: row.title,
    kind: row.kind,
    ext: row.ext,
    author_name: row.author_name,
    author_email: row.author_email,
    content_hash: row.content_hash,
    word_count: row.word_count,
    mtime: row.mtime,
    indexed_at: row.indexed_at,
    metadata_: row.metadata,
    chunks: chunks.map(mapDocumentChunk)
  };
}
