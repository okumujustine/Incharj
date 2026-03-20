import type { PoolClient } from "pg";
import { chunkText, approximateTokenCount } from "../utils/chunker";
import { SQL_DELETE_DOCUMENT_CHUNKS, SQL_INSERT_DOCUMENT_CHUNK } from "../sql/indexer";
import { embedBatchCached } from "../ai/embedder";

/**
 * ChunkProcessor handles text chunking and persistence.
 * Responsibilities:
 * - Split normalized content into semantically coherent chunks
 * - Calculate token counts per chunk
 * - Persist chunks to database
 * - Manage chunk metadata and ordering
 */

export interface ProcessedChunk {
  index: number;
  text: string;
  tokenCount: number;
}

export async function processChunks(
  client: PoolClient,
  content: string | null | undefined,
  documentId: string,
  orgId: string
): Promise<ProcessedChunk[]> {
  // Delete existing chunks for this document
  await client.query(SQL_DELETE_DOCUMENT_CHUNKS, [documentId]);

  // Generate chunks from content
  const chunks = content ? chunkText(content, 800, 100) : [];
  const processedChunks: ProcessedChunk[] = [];

  const embeddings = chunks.length > 0
    ? await embedBatchCached(chunks, client)
    : [];

  // Insert each chunk and track metadata
  for (let index = 0; index < chunks.length; index += 1) {
    const text = chunks[index];
    const tokenCount = approximateTokenCount(text);
    
    await client.query(SQL_INSERT_DOCUMENT_CHUNK, [
      documentId,
      orgId,
      index,
      text,
      tokenCount,
      embeddings[index] ? JSON.stringify(embeddings[index]) : null,
    ]);

    processedChunks.push({
      index,
      text,
      tokenCount,
    });
  }

  return processedChunks;
}
