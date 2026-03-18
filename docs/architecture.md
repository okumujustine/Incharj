# Architecture

## System overview

Incharj runs as four independent Docker services:

```
┌─────────────┐     HTTP/REST     ┌──────────────────┐
│   Browser   │ ◄───────────────► │   nginx          │
│  (React SPA)│                   └──┬───────────────┘
└─────────────┘                      │ /api/*             /* (SPA)
                                     ▼
                              ┌──────────────────┐
                              │  API (Fastify)   │
                              │  Port 8000       │
                              └────────┬─────────┘
                                       │ pg
                                       ▼
                              ┌────────────────┐      ┌───────────┐
                              │  PostgreSQL    │      │   Redis   │
                              │  (pg_trgm,     │      │  (BullMQ) │
                              │   pgcrypto)    │      └─────┬─────┘
                              └───────┬────────┘            │
                                      ▲ pg                  │ queue
                              ┌───────┴────────┐            │
                              │    Worker      │ ◄──────────┘
                              │  (BullMQ)      │
                              └───────┬────────┘
                                      │ OAuth / REST
                                      ▼
                         ┌─────────────────────────┐
                         │  External APIs           │
                         │  (Google Drive / Notion  │
                         │   / Slack)               │
                         └─────────────────────────┘
```

The API and the Worker share the same PostgreSQL database but run as separate processes (`npm run dev` / `npm run worker`, or separate Docker services). Redis is used exclusively by BullMQ for the sync job queue.

---

## Data flow

### 1. Connect

1. User clicks "Connect" on the Connectors page — frontend creates a connector via `POST /orgs/:slug/connectors`.
2. Frontend calls `GET /connectors/:id/oauth/authorize` → API returns the provider's OAuth consent URL.
3. OAuth state is stored in `localStorage` keyed by state param so the callback page can resume.
4. User approves → provider redirects to `GET /oauth/:kind/callback?code=…&state=…`.
5. Callback exchanges the code for tokens, encrypts them with AES-GCM, stores in `connectors.credentials`, marks `has_credentials = true`.

### 2. Sync

1. **Dispatch worker** repeating job (every 30s) runs `dispatchDueSyncs()`:
   - Finds connectors where `last_synced_at + sync_frequency < now()` and status is not `paused`.
   - Skips connectors that already have a pending or running BullMQ job.
   - Inserts a `pending` row in `sync_jobs`, enqueues a `"sync"` job into BullMQ.
2. **Sync worker** (concurrency=1) picks up the job:
   - Decrypts credentials, refreshes OAuth token if needed.
   - Passes `last_synced_at` (ISO string) into connector config for incremental filtering.
   - Calls `connector.listDocuments()` (async generator) → for each doc calls `connector.fetchContent()`.
   - Calls `ingestDocument()` per document — each in its own PostgreSQL transaction:
     - Computes SHA-256 of `title::content` → skips if hash unchanged.
     - Chunks text (800 chars / 100-char overlap), upserts `documents` + `document_chunks`.
     - SQL trigger updates `search_vector` (pre-computed tsvector) on both tables.
   - Updates `sync_jobs` row with `docs_indexed / docs_skipped / docs_errored`.
   - Updates `connectors.doc_count` and `last_synced_at`.

### 3. Search

1. Frontend debounces input (300ms), sends `GET /orgs/:slug/search?q=…&limit=20&offset=…`.
2. API checks if `websearch_to_tsquery('english', q)` produces an empty string → returns 0 results immediately (stop words like "the").
3. Runs `ftSearch()` using pre-computed `search_vector` GIN indexes — no runtime `to_tsvector()`.
4. LATERAL join finds the best matching chunk per document; `ts_rank_cd` with time-decay scores results.
5. `ts_headline` generates snippet with `<<match>>` delimiters (up to 5KB input cap).
6. If FTS total = 0 → falls back to `fuzzySearch()` using `similarity()` on document titles only (GIN trgm index).
7. Results returned with `total` for frontend pagination (20 per page).

### 4. Browse files

Frontend `FilesPage` calls `GET /documents?org=<slug>` with optional `connector_id` / `kind` filters and `limit` / `offset` for pagination (50 per page). The backend runs the list and count queries in parallel.

---

## Multi-tenancy

Every table (except `sessions`) carries an `org_id` column. All queries are scoped by org. The API middleware resolves the org from the URL slug and validates that the authenticated user is a member before any data access.

---

## Key design decisions

| Decision | Rationale |
|---|---|
| BullMQ + Redis job queue | Reliable job delivery, deduplication, retry, and cleanup without polling PostgreSQL |
| Raw SQL in `sql/` | Easy to read and tune; no ORM magic hiding expensive queries |
| Per-document transaction | One failed document doesn't abort the whole sync run |
| Incremental sync | Connectors receive `last_synced_at` (ISO string) in config and filter at source API level |
| Content hash includes title | SHA-256 of `title::content` so title-only renames trigger re-index |
| GIN indexes on `search_vector` | Pre-computed tsvector + GIN indexes keep FTS queries fast at scale |
| Stop word short-circuit | `websearch_to_tsquery` on stop words → empty string → skip DB query entirely |
| Fuzzy on title only | Chunk-content trigram scanning can't use an index in a subquery; title-only uses `ix_documents_title_trgm` |
| Encrypted credentials | OAuth tokens stored AES-GCM encrypted; key lives in `ENCRYPTION_KEY` env var |
