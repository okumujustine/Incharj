export interface DocData {
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
