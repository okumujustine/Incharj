import type { PoolClient } from "pg";
import { sha256 } from "../utils/security";
import {
  SQL_SELECT_DOCUMENT_HASH,
  SQL_UPSERT_DOCUMENT,
} from "../sql/indexer";
import type { CanonicalDocumentEnvelope } from "../types/document-envelope";

/**
 * Normalizer transforms raw connector data into standardized internal documents.
 * Responsibilities:
 * - Sanitize and normalize content
 * - Compute checksums for deduplication
 * - Validate against existing records
 * - Upsert to documents table
 */

export interface NormalizedDocument {
  documentId: string;
  checksum: string;
  wordCount: number;
  wasSkipped: boolean;
}

export async function normalizeDocument(
  client: PoolClient,
  envelope: CanonicalDocumentEnvelope
): Promise<NormalizedDocument> {
  // Sanitize content: trim, remove nulls, truncate
  const content = (envelope.content?.trim() ?? "").replace(/\0/g, "").slice(0, 500_000);
  
  // Compute checksum (use provided or compute from title + content)
  const checksum = envelope.checksum || sha256(`${envelope.title ?? ""}::${content}`);

  // Check if document already indexed with same content
  const existingResult = await client.query<{ content_hash: string | null }>(
    SQL_SELECT_DOCUMENT_HASH,
    [envelope.connectorId, envelope.externalId]
  );
  const existing = existingResult.rows[0];
  
  if (existing?.content_hash === checksum) {
    return {
      documentId: "", // Not needed when skipped
      checksum,
      wordCount: 0,
      wasSkipped: true,
    };
  }

  // Count words in cleaned content
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;

  // Upsert document with all canonical fields
  const upsertResult = await client.query<{ id: string }>(SQL_UPSERT_DOCUMENT, [
    envelope.orgId,
    envelope.connectorId,
    envelope.externalId,
    envelope.url,
    envelope.title,
    envelope.kind,
    envelope.ext,
    envelope.authorName,
    envelope.authorEmail,
    checksum,
    checksum,
    wordCount,
    envelope.sourceLastModifiedAt,
    envelope.sourceLastModifiedAt,
    envelope.contentType,
    envelope.sourcePath,
    envelope.sourcePermissions,
    envelope.extractionStatus,
    envelope.extractionErrorCode,
    envelope.extractionVersion,
    envelope.chunkingVersion,
    envelope.indexingVersion,
    {
      ...envelope.metadata,
      connector_key: envelope.connectorKey,
      source_id: envelope.sourceId,
    },
  ]);

  return {
    documentId: upsertResult.rows[0].id,
    checksum,
    wordCount,
    wasSkipped: false,
  };
}
