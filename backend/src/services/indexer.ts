import type { PoolClient } from "pg";
import { chunkText, approximateTokenCount } from "../utils/chunker";
import { sha256 } from "../utils/security";
import {
  SQL_DELETE_DOCUMENT_CHUNKS,
  SQL_INSERT_DOCUMENT_CHUNK,
  SQL_SELECT_DOCUMENT_HASH,
  SQL_UPDATE_DOCUMENT_SEARCH_VECTOR,
  SQL_UPSERT_DOCUMENT,
} from "../sql/indexer";
import type { DocData } from "../types/indexer";

export async function ingestDocument(
  client: PoolClient,
  docData: DocData,
  orgId: string,
  connectorId: string
): Promise<"indexed" | "skipped"> {
  const content = docData.content?.trim() ?? "";
  const contentHash = content ? sha256(content) : null;

  const existingResult = await client.query<{ content_hash: string | null }>(
    SQL_SELECT_DOCUMENT_HASH, [connectorId, docData.external_id]
  );
  const existing = existingResult.rows[0];
  if (existing?.content_hash && existing.content_hash === contentHash) return "skipped";

  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const upsertResult = await client.query<{ id: string }>(SQL_UPSERT_DOCUMENT, [
    orgId, connectorId, docData.external_id,
    docData.url ?? null, docData.title ?? null, docData.kind ?? null,
    docData.ext ?? null, docData.author_name ?? null, docData.author_email ?? null,
    contentHash, wordCount, docData.mtime ?? null, docData.metadata ?? null,
  ]);
  const documentId = upsertResult.rows[0].id;

  await client.query(SQL_DELETE_DOCUMENT_CHUNKS, [documentId]);

  const chunks = content ? chunkText(content, 800, 100) : [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await client.query(SQL_INSERT_DOCUMENT_CHUNK, [
      documentId, orgId, index, chunk, approximateTokenCount(chunk),
    ]);
  }

  await client.query(SQL_UPDATE_DOCUMENT_SEARCH_VECTOR, [documentId]);

  return "indexed";
}
