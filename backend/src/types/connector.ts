export interface ConnectorDocument {
  external_id: string;
  url?: string | null;
  title?: string | null;
  kind?: string | null;
  ext?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  mtime?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ConnectorModel {
  id: string;
  org_id: string;
  kind: string;
  credentials: string | null;
  config: Record<string, unknown> | null;
  last_synced_at: string | null;
}

export interface RunResult {
  docsIndexed: number;
  docsSkipped: number;
  docsErrored: number;
}
