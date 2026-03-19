import type { PoolClient } from "pg";
import { normalizeDocument } from "../normalization/normalizer";
import { processChunks } from "../chunking/chunk-processor";
import { updateSearchIndex } from "../indexing/indexer";
import type { DocData } from "../types/indexer";
import type { CanonicalDocumentEnvelope } from "../types/document-envelope";
import { sha256 } from "../utils/security";

/**
 * Ingest a canonical document through the full pipeline:
 * Normalization → Chunking → Indexing → Permissions
 */
export async function ingestCanonicalDocument(
  client: PoolClient,
  document: CanonicalDocumentEnvelope
): Promise<"indexed" | "skipped"> {
  // Stage 1: Normalize document
  const normalized = await normalizeDocument(client, document);
  if (normalized.wasSkipped) {
    return "skipped";
  }

  // Stage 2: Chunk content
  const content = (document.content?.trim() ?? "").replace(/\0/g, "").slice(0, 500_000);
  await processChunks(client, content, normalized.documentId, document.orgId);

  // Stage 3: Index for search
  await updateSearchIndex(client, normalized.documentId);

  // Stage 4: Validate and attach permissions
  // TODO: Uncomment when permission resolution is ready
  // await validateAndAttachPermissions(document.orgId, normalized.documentId, document.sourcePermissions);

  return "indexed";
}

export async function ingestDocument(
  client: PoolClient,
  docData: DocData,
  orgId: string,
  connectorId: string
): Promise<"indexed" | "skipped"> {
  return ingestCanonicalDocument(client, {
    orgId,
    connectorId,
    connectorKey: "legacy",
    sourceId: connectorId,
    externalId: docData.external_id,
    url: docData.url ?? null,
    title: docData.title ?? null,
    kind: docData.kind ?? null,
    ext: docData.ext ?? null,
    content: docData.content ?? null,
    contentType: typeof docData.metadata?.mime_type === "string" ? String(docData.metadata.mime_type) : null,
    sourcePath: null,
    sourceLastModifiedAt:
      typeof docData.mtime === "string"
        ? docData.mtime
        : docData.mtime instanceof Date
          ? docData.mtime.toISOString()
          : null,
    authorName: docData.author_name ?? null,
    authorEmail: docData.author_email ?? null,
    checksum: sha256(`${docData.title ?? ""}::${docData.content ?? ""}`),
    sourcePermissions: null,
    extractionStatus: "succeeded",
    extractionErrorCode: null,
    extractionVersion: 1,
    chunkingVersion: 1,
    indexingVersion: 1,
    metadata: docData.metadata ?? {},
  });
}
