# Architecture

## System overview

Incharj is split into three independent processes:

```
┌─────────────┐     HTTP/REST     ┌──────────────────┐
│   Browser   │ ◄───────────────► │   API (Fastify)  │
│  (React SPA)│                   └────────┬─────────┘
└─────────────┘                            │ pg
                                           ▼
                                   ┌───────────────┐
                                   │  PostgreSQL   │
                                   └───────┬───────┘
                                           ▲ pg
                                   ┌───────┴───────┐
                                   │    Worker     │
                                   │  (Node poll)  │
                                   └───────────────┘
                                           │ OAuth / REST
                                           ▼
                              ┌─────────────────────────┐
                              │  External APIs           │
                              │  (Google Drive / Notion  │
                              │   / Slack / …)           │
                              └─────────────────────────┘
```

The API and the Worker share the same PostgreSQL database but run as separate processes (separate `npm run dev` / `npm run worker` commands, or separate Docker services).

---

## Data flow

### 1. Connect

1. User visits the frontend and creates a connector (name, kind, sync frequency).
2. Frontend redirects to `GET /api/v1/connectors/:id/oauth/authorize`, which returns an OAuth URL.
3. User authorises in the external provider, which redirects to `GET /api/v1/connectors/:id/oauth/callback`.
4. Callback handler exchanges the code for tokens, encrypts them, and stores them in `connectors.credentials`.

### 2. Sync

1. Worker `tick()` runs every 30 seconds.
2. `dispatchDueSyncs()` queries for connectors whose `last_synced_at + sync_frequency < now()` and inserts a `pending` row into `sync_jobs` (one per connector, skipped if a job is already running).
3. `processOnePendingJob()` picks up one pending job using `SELECT … FOR UPDATE SKIP LOCKED`, marks it `running`, then calls `runSync()`.
4. `runSync()` streams documents from the external API via the connector's `listDocuments()` generator, fetches full content with `fetchContent()`, and calls `ingestDocument()` per document — each in its own PostgreSQL transaction.
5. After the loop, the job is marked `done` (or `failed`) and `connectors.doc_count` is updated to the real total.

### 3. Search

1. Frontend sends `GET /api/v1/orgs/:slug/search?q=…`.
2. API runs `ftSearch()` — full-text search using `websearch_to_tsquery` with time-decay scoring.
3. If FTS returns zero results, `fuzzySearch()` runs — trigram similarity across titles and chunk content (`similarity() > 0.1`).
4. Results are returned as a paginated JSON object with snippet highlights (FTS) or raw best-chunk content (fuzzy).

---

## Multi-tenancy

Every table (except `sessions`) carries an `org_id` column. All queries are scoped by org. The API middleware resolves the org from the URL slug and validates that the authenticated user is a member before any data access.

---

## Key design decisions

| Decision | Rationale |
|---|---|
| No Redis / no message broker | Worker polls PostgreSQL with `FOR UPDATE SKIP LOCKED` — simple, no extra infra |
| Raw SQL in `sql/` | Easy to read and tune; no ORM magic hiding expensive queries |
| Per-document transaction | One failed document doesn't abort the whole sync run |
| Incremental sync | Connectors receive `last_synced_at` in config and filter at the source API level |
| Encrypted credentials | OAuth tokens stored AES-GCM encrypted; key lives in `ENCRYPTION_KEY` env var |
| Hybrid search | FTS first for precision; trigram fallback for fuzzy/typo queries |
| tsvector stored on document + chunks | Search vector is pre-computed on ingest so queries stay fast |
