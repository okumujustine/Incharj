export interface CanonicalDocumentEnvelope {
  orgId: string;
  connectorId: string;
  connectorKey: string;
  sourceId: string;
  externalId: string;
  url: string | null;
  title: string | null;
  kind: string | null;
  ext: string | null;
  content: string | null;
  contentType: string | null;
  sourcePath: string | null;
  sourceLastModifiedAt: string | null;
  authorName: string | null;
  authorEmail: string | null;
  checksum: string;
  sourcePermissions: Record<string, unknown> | null;
  extractionStatus: "succeeded" | "failed" | "empty";
  extractionErrorCode: string | null;
  extractionVersion: number;
  chunkingVersion: number;
  indexingVersion: number;
  metadata: Record<string, unknown>;
}

export const EXTRACTION_VERSION = 1;
export const CHUNKING_VERSION = 1;
export const INDEXING_VERSION = 1;
