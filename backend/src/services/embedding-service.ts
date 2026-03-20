import type { PoolClient } from "pg";
import { embedBatchCached } from "../ai/embedder";
import { getEmbeddingProvider } from "../ai";
import { createLogger } from "../utils/logger";

const log = createLogger("embedding-service");

/**
 * EmbeddingService manages on-demand embedding of indexed documents.
 * Handles:
 * - Fetching unembed chunks from already-indexed documents
 * - Generating embeddings via OpenAI
 * - Persisting embeddings to database
 */

interface DocumentChunk {
  id: string;
  content: string;
  embedding: unknown;
  chunk_index: number;
}

interface EmbedDocumentResult {
  documentId: string;
  totalChunks: number;
  embeddedChunks: number;
  skippedChunks: number;
  status: "success" | "no-chunks" | "embeddings-disabled" | "failed";
}

/**
 * Embed all chunks for a single document.
 * Skips chunks that already have embeddings.
 * Returns status with counts.
 */
export async function embedDocument(
  client: PoolClient,
  documentId: string,
  orgId: string
): Promise<EmbedDocumentResult> {
  const provider = getEmbeddingProvider();
  if (!provider) {
    log.warn({ documentId }, "Embeddings disabled, skipping");
    return {
      documentId,
      totalChunks: 0,
      embeddedChunks: 0,
      skippedChunks: 0,
      status: "embeddings-disabled",
    };
  }

  // Fetch all chunks for this document
  const chunksResult = await client.query<DocumentChunk>(
    `SELECT id, content, embedding, chunk_index
     FROM document_chunks
     WHERE document_id = $1 AND org_id = $2
     ORDER BY chunk_index ASC`,
    [documentId, orgId]
  );

  const chunks = chunksResult.rows;
  if (chunks.length === 0) {
    log.info({ documentId }, "No chunks found for document");
    return {
      documentId,
      totalChunks: 0,
      embeddedChunks: 0,
      skippedChunks: 0,
      status: "no-chunks",
    };
  }

  // Separate chunks that need embedding
  const unembed: { id: string; content: string; index: number }[] = [];
  for (const chunk of chunks) {
    if (!chunk.embedding) {
      unembed.push({
        id: chunk.id,
        content: chunk.content,
        index: chunk.chunk_index,
      });
    }
  }

  if (unembed.length === 0) {
    log.info({ documentId, totalChunks: chunks.length }, "All chunks already embedded");
    return {
      documentId,
      totalChunks: chunks.length,
      embeddedChunks: 0,
      skippedChunks: chunks.length,
      status: "success",
    };
  }

  log.info(
    { documentId, totalChunks: chunks.length, unembedded: unembed.length },
    "Starting embedding batch"
  );

  // Generate embeddings for unembed chunks
  const texts = unembed.map((c) => c.content);
  const embeddings = await embedBatchCached(texts, client);

  // Update database with embeddings
  for (let i = 0; i < unembed.length; i += 1) {
    const chunk = unembed[i];
    const embedding = embeddings[i];

    await client.query(
      `UPDATE document_chunks
       SET embedding = $1
       WHERE id = $2`,
      [embedding ? JSON.stringify(embedding) : null, chunk.id]
    );
  }

  log.info(
    { documentId, totalChunks: chunks.length, embedded: unembed.length },
    "Document embedding complete"
  );

  return {
    documentId,
    totalChunks: chunks.length,
    embeddedChunks: unembed.length,
    skippedChunks: chunks.length - unembed.length,
    status: "success",
  };
}

/**
 * Embed all documents in an organization (batch operation).
 * Useful for backfilling embeddings when feature is enabled.
 */
export async function embedOrganization(
  client: PoolClient,
  orgId: string
): Promise<{
  totalDocuments: number;
  embeddedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddings: EmbedDocumentResult[];
}> {
  log.info({ orgId }, "Starting organization-wide embedding");

  // Fetch all documents in org
  const docsResult = await client.query<{ id: string }>(
    `SELECT id FROM documents WHERE org_id = $1 ORDER BY indexed_at DESC`,
    [orgId]
  );

  const docIds = docsResult.rows.map((r) => r.id);
  const results: EmbedDocumentResult[] = [];
  let totalChunks = 0;
  let failedCount = 0;

  for (const docId of docIds) {
    try {
      const result = await embedDocument(client, docId, orgId);
      results.push(result);
      totalChunks += result.totalChunks;
    } catch (error) {
      log.error({ docId, error }, "Failed to embed document");
      failedCount += 1;
      results.push({
        documentId: docId,
        totalChunks: 0,
        embeddedChunks: 0,
        skippedChunks: 0,
        status: "failed",
      });
    }
  }

  const embeddedCount = results.filter((r) => r.embeddedChunks > 0).length;

  log.info(
    {
      orgId,
      totalDocuments: docIds.length,
      embedded: embeddedCount,
      failed: failedCount,
      totalChunks,
    },
    "Organization embedding complete"
  );

  return {
    totalDocuments: docIds.length,
    embeddedDocuments: embeddedCount,
    failedDocuments: failedCount,
    totalChunks,
    embeddings: results,
  };
}

export async function embedConnector(
  client: PoolClient,
  orgId: string,
  connectorId: string
): Promise<{
  totalDocuments: number;
  embeddedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddings: EmbedDocumentResult[];
}> {
  log.info({ orgId, connectorId }, "Starting connector embedding");

  const docsResult = await client.query<{ id: string }>(
    `SELECT id
     FROM documents
     WHERE org_id = $1 AND connector_id = $2
     ORDER BY indexed_at DESC`,
    [orgId, connectorId]
  );

  const docIds = docsResult.rows.map((r) => r.id);
  const results: EmbedDocumentResult[] = [];
  let totalChunks = 0;
  let failedCount = 0;

  for (const docId of docIds) {
    try {
      const result = await embedDocument(client, docId, orgId);
      results.push(result);
      totalChunks += result.totalChunks;
    } catch (error) {
      log.error({ docId, connectorId, error }, "Failed to embed document");
      failedCount += 1;
      results.push({
        documentId: docId,
        totalChunks: 0,
        embeddedChunks: 0,
        skippedChunks: 0,
        status: "failed",
      });
    }
  }

  const embeddedCount = results.filter((r) => r.embeddedChunks > 0).length;

  return {
    totalDocuments: docIds.length,
    embeddedDocuments: embeddedCount,
    failedDocuments: failedCount,
    totalChunks,
    embeddings: results,
  };
}
