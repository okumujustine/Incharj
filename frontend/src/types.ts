export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  is_verified: boolean
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  logo_url: string | null
  created_at: string
}

export interface Membership {
  id: string
  user_id: string
  org_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  user?: User
}

export interface Connector {
  id: string
  org_id: string
  kind: 'google_drive' | 'notion' | 'slack'
  name: string
  status: 'idle' | 'syncing' | 'error' | 'paused'
  last_synced_at: string | null
  doc_count: number
  has_credentials: boolean
  created_at: string
}

export interface SyncJob {
  id: string
  connector_id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  triggered_by: string
  started_at: string | null
  finished_at: string | null
  docs_indexed: number
  docs_skipped: number
  docs_errored: number
  error_message: string | null
}

export interface SearchResult {
  id: string
  title: string
  url: string | null
  kind: string
  ext: string | null
  author_name: string | null
  mtime: string | null
  snippet: string
  score: number
  connector_kind: string
  connector_name: string
}

export interface SearchResponse {
  query: string
  total: number
  limit: number
  offset: number
  results: SearchResult[]
}

export interface Document {
  id: string
  org_id: string
  connector_id: string
  external_id: string
  title: string
  url: string | null
  kind: string
  ext: string | null
  author_name: string | null
  mtime: string | null
  indexed_at: string
  content_preview: string | null
}

export interface Invitation {
  id: string
  org_id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  token: string
  accepted: boolean
  expires_at: string
  created_at: string
}

export interface ApiError {
  detail: string
  status?: number
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface SearchFilters {
  connector_id?: string
  kind?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}
