import type { PoolClient } from "pg";
import { chunkText, approximateTokenCount } from "../utils/chunker";
import { sha256 } from "../utils/security";

interface DocData {
  external_id: string;
  url?: string | null;
  title?: string | null;
  kind?: string | null;
  ext?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  content?: string | null;
  mtime?: string | Date | null;
  metadata?: Record<string, unknown> | null;
}

export async function ingestDocument(
  client: PoolClient,
  docData: DocData,
  orgId: string,
  connectorId: string
): Promise<"indexed" | "skipped"> {
  const content = docData.content?.trim() ?? "";
  const contentHash = content ? sha256(content) : null;

  const existingResult = await client.query<{ content_hash: string | null }>(
    `SELECT content_hash FROM documents
     WHERE connector_id = $1 AND external_id = $2`,
    [connectorId, docData.external_id]
  );
  const existing = existingResult.rows[0];
  if (existing?.content_hash && existing.content_hash === contentHash) {
    return "skipped";
  }

  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const upsertResult = await client.query<{ id: string }>(
    `INSERT INTO documents (
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
     RETURNING id`,
    [
      orgId,
      connectorId,
      docData.external_id,
      docData.url ?? null,
      docData.title ?? null,
      docData.kind ?? null,
      docData.ext ?? null,
      docData.author_name ?? null,
      docData.author_email ?? null,
      contentHash,
      wordCount,
      docData.mtime ?? null,
      docData.metadata ?? null
    ]
  );
  const documentId = upsertResult.rows[0].id;

  await client.query("DELETE FROM document_chunks WHERE document_id = $1", [
    documentId
  ]);

  const chunks = content ? chunkText(content, 800, 100) : [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await client.query(
      `INSERT INTO document_chunks (document_id, org_id, chunk_index, content, token_count, search_vector)
       VALUES ($1, $2, $3, $4, $5, to_tsvector('english', $4))`,
      [documentId, orgId, index, chunk, approximateTokenCount(chunk)]
    );
  }

  await client.query(
    `UPDATE documents
     SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A')
     WHERE id = $1`,
    [documentId]
  );

  return "indexed";
}
