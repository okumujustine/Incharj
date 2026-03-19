import type { PoolClient } from "pg";
import { SQL_UPDATE_DOCUMENT_SEARCH_VECTOR } from "../sql/indexer";

/**
 * Indexer handles final indexing for search backends.
 * Responsibilities:
 * - Update full-text search vectors (GIN indexes)
 * - Manage search metadata
 * - Ensure searchability across organization boundaries
 */

export async function updateSearchIndex(
  client: PoolClient,
  documentId: string
): Promise<void> {
  // Update GIN search vector for full-text search
  await client.query(SQL_UPDATE_DOCUMENT_SEARCH_VECTOR, [documentId]);
}

/**
 * Orchestrate the full ingestion pipeline:
 * normalize → chunk → index → resolve permissions
 */
export async function finalizeSearchability(
  client: PoolClient,
  documentId: string
): Promise<void> {
  // Ensure document is fully indexed for search queries
  await updateSearchIndex(client, documentId);
}
