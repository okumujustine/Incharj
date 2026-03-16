export interface SearchOptions {
  orgId: string;
  query: string;
  connectorId?: string;
  kind?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string | null;
  kind: string | null;
  ext: string | null;
  snippet: string;
  score: number;
  mtime: string | null;
  connector_kind: string;
  connector_name: string;
}

export interface SearchResponse {
  total: number;
  results: SearchResult[];
  query: string;
  offset: number;
  limit: number;
}
