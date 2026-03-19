# Architecture

Incharj has one job: connect to external knowledge sources, index their content, and make it searchable. Everything in the codebase exists to serve that loop.

---

## System processes

Three processes share one PostgreSQL database. They never communicate directly with each other — PostgreSQL and Redis are the only shared state.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                    │
│  • TanStack Query for server state                      │
│  • Zustand for auth token (memory only)                 │
│  • Axios interceptor auto-refreshes expired tokens      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP  (nginx → api:8000)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  API  ·  Fastify 5  ·  TypeScript                        │
│                                                          │
│  /auth          JWT issue, refresh, logout               │
│  /orgs          Multi-tenant org management              │
│  /connectors    OAuth setup, pause/resume/sync trigger   │
│  /search        FTS + fuzzy query endpoint               │
│  /documents     List indexed docs with filters           │
│  /oauth         OAuth callback handler                   │
└─────────┬──────────────────────┬────────────────────────┘
          │ pg (pool 20)         │ enqueue sync job
          ▼                      ▼
┌──────────────────┐    ┌────────────────┐
│   PostgreSQL 16  │    │   Redis 7      │
│                  │    │   (BullMQ)     │
│  users           │    │                │
│  organizations   │    │  incharj-sync  │
│  memberships     │    │  queue         │
│  sessions        │    └───────┬────────┘
│  connectors      │            │ consume jobs
│  sync_jobs       │    ┌───────▼────────────────────────┐
│  documents       │◄───│  Worker  ·  BullMQ consumer    │
│  document_chunks │    │                                 │
└──────────────────┘    │  dispatch job  (every 30s)      │
                        │    finds due connectors          │
                        │    enqueues "sync" jobs          │
                        │                                 │
                        │  sync job  (concurrency=1)       │
                        │    runSync()                     │
                        │      ↳ listDocuments()           │
                        │      ↳ fetchContent()            │
                        │      ↳ ingestDocument()          │
                        └─────────────────────────────────┘
                                    │ OAuth / REST
                                    ▼
                         ┌──────────────────────┐
                         │  External APIs        │
                         │  Google Drive         │
                         │  Notion               │
                         │  Slack                │
                         └──────────────────────┘
```

---

## How a connector sync works end to end

### 1. Connector creation and OAuth

When a user clicks "Connect Google Drive":

1. Frontend calls `POST /orgs/:slug/connectors` → creates a row in `connectors` with `has_credentials = false`
2. Frontend calls `GET /connectors/:id/oauth/authorize` → backend calls `connector.authorizeUrl(state)` and returns the Google consent URL
3. A random `state` param is stored in `localStorage` as `oauth_state:<state>` → maps to `{ connector_id, org_slug, kind }`
4. User approves at Google → redirected to `GET /oauth/google_drive/callback?code=…&state=…`
5. Backend reads state from the request, calls `connector.exchangeCode(code, redirectUri)` → receives `{ access_token, refresh_token, expiry_date, ... }`
6. Credentials encrypted with AES-GCM and stored in `connectors.credentials`. `has_credentials` set to `true`

### 2. Dispatch scheduling

A BullMQ repeating job named `"dispatch"` runs every 30 seconds inside the worker. It queries:

```sql
SELECT id, org_id, kind, config, sync_frequency, last_synced_at
FROM connectors
WHERE status NOT IN ('paused', 'error')
  AND credentials IS NOT NULL
  AND has_credentials = true
  AND (
    last_synced_at IS NULL
    OR last_synced_at + sync_frequency::interval < now()
  )
```

For each result it checks whether a BullMQ job already exists for that connector ID (preventing double-dispatch). If not, it:
- Inserts a `sync_jobs` row with `status = 'pending'`, `triggered_by = 'scheduled'`
- Enqueues a `"sync"` BullMQ job with `{ syncJobId, connectorId }` payload

Manual sync (clicking "Sync now" in the UI) bypasses the schedule check and goes straight to enqueueing.

### 3. Sync execution — three-stage pipeline

The sync worker picks up jobs using a staged pipeline. A sync job spawns three job types:

```
Stage 1: Enumerate                Stage 2: Document (per doc)        Stage 3: Finalize
─────────────────────            ──────────────────────────          ─────────────
BullMQ: "sync-enumerate"         BullMQ: "sync-document" (N jobs)   BullMQ: "sync-finalize"
  │                                │                                   │
  ├─ Load connector               ├─ Load connector                  ├─ Wait for Stage 2
  ├─ Decrypt credentials          ├─ Decrypt credentials            │  (all docs processed)
  ├─ Get checkpoint               ├─ Fetch document via plugin      │
  ├─ Call plugin.enumerate()      ├─ Build CanonicalDocumentEnvelope ├─ Save checkpoint
  │  └─ yields N items            ├─ Call ingestCanonicalDocument() │  └─ stores in DB
  │                               │  └─ Normalize → Chunk → Index    │
  └─ Enqueue N "sync-document"    └─ Increment docs_processed       └─ UPDATE connectors
     jobs + 1 "sync-finalize"
```

Each stage is **strongly typed** with job data:
- `EnumerateJobData`: { syncJobId, connectorId }
- `DocumentJobData`: { syncJobId, connectorId, ref: ConnectorDocumentRef }
- `FinalizeJobData`: { syncJobId, connectorId, checkpoint, encryptedCredentials }

### 4. Connector-specific fetch behaviour

**Google Drive**
- Calls Drive API with `q: modifiedTime > 'ISO_STRING'` when `last_synced_at` is set
- Supported mime types: Google Docs (export as text), Sheets (export as CSV), Slides (export as text), PDF, plain text, Markdown, HTML, CSV
- Files streamed via `alt=media`, capped at **2 MB** to prevent OOM on large binaries
- PDFs: raw bytes collected into a `Buffer`, parsed with `pdf-parse` (loaded via `require()` because it's a CJS module)
- HTML: tags stripped before indexing

**Notion**
- Uses Notion search API, 100 pages per request
- Blocks collected recursively up to depth 5
- Title extracted from the first property named `"title"`, `"Name"`, or `"Title"`
- Filter: `filter.last_edited_time.after = last_synced_at`

**Slack**
- Lists all accessible channels, fetches messages 200 at a time
- Threads fetched separately via `conversations.replies`
- Each message indexed as `kind: "message"`, `ext: "slack"`
- Filter: messages with `ts > last_synced_at` unix timestamp

---

## How a search request works

```
GET /orgs/acme/search?q=product+roadmap&connector_id=uuid&limit=20&offset=0
  │
  ▼
search-service.ts: fullTextSearch(orgId, options)
  │
  ├─ 1. Stop word check
  │       SELECT (websearch_to_tsquery('english', 'product roadmap')::text = '') AS is_empty
  │       → false, continue
  │
  ├─ 2. Build WHERE clause
  │       d.org_id = $1
  │       AND d.connector_id = $3   ← if connector_id filter present
  │
  ├─ 3. Run FTS + count in parallel
  │       Promise.all([
  │         buildFtsQuery(whereClause, ...)   → ranked results + snippets
  │         buildFtsCountQuery(whereClause)   → total count (no ranking)
  │       ])
  │
  ├─ 4. total > 0 ? return FTS results
  │
  └─ 5. total = 0 ? run fuzzy fallback
          similarity(d.title, $2) > 0.1
          ORDER BY raw_score DESC
```

The response shape:

```json
{
  "query": "product roadmap",
  "total": 12,
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "id": "uuid",
      "title": "Q3 Product Roadmap",
      "url": "https://docs.google.com/document/d/...",
      "kind": "document",
      "ext": null,
      "snippet": "…the <<product roadmap>> for Q3 focuses on…",
      "score": 0.42,
      "mtime": "2024-03-10T09:00:00Z",
      "connector_kind": "google_drive",
      "connector_name": "Company Drive"
    }
  ]
}
```

`<<` / `>>` delimiters in the snippet are rendered as yellow highlights in the frontend.

---

## Multi-tenancy

Every table that stores user data has an `org_id` UUID column. The enforcement happens at the API layer:

```ts
// Every org-scoped route resolves the org first
const org = await getOrgBySlug(slug)            // 404 if not found
const membership = await getCurrentMembership(org.id, user.id)  // 403 if not member
```

There is no row-level security in PostgreSQL — the `org_id` filter is always injected by the application. All SQL query builders in `sql/` accept `orgId` as their first parameter and always include `WHERE org_id = $1`.

**Roles** enforced per request (no caching):
- `owner` — full access, including deleting the org
- `admin` — manage connectors and members
- `member` — read-only: search, browse files, view connector status

---

## Connector pause / resume

Pausing sets `connectors.status = 'paused'`. The dispatch job's eligibility query filters out paused connectors (`status NOT IN ('paused', 'error')`), so no new sync jobs are enqueued. Any sync already running finishes normally — pause takes effect on the next cycle.

Resuming sets `status = 'idle'`, making the connector eligible for the next dispatch cycle.

---

## Key design decisions and why

| Decision | Why |
|---|---|
| BullMQ + Redis (not DB polling) | Reliable delivery, deduplication, and retry semantics without holding DB connections open in a loop |
| Concurrency = 1 on the sync worker | Document chunks are deleted then re-inserted. Concurrent syncs on the same connector could race on this delete. |
| GIN indexes on `search_vector` | Lets `search_vector @@ tsq` skip tokenisation at query time — the difference between milliseconds and seconds at scale |
| `Promise.all` for FTS + count | The count query (no ranking, no headline) is cheap and can run in parallel with the main query — no extra latency |
| Raw SQL, no ORM | All queries are in `backend/src/sql/`. Every query is readable, tunable, and version-controlled. No magic. |
| Stop word short-circuit | Searching "the" would produce an empty tsquery → fall through to fuzzy → full table scan on title similarity. The early exit prevents this completely. |
| Content hash includes title | `SHA-256(title::content)` so a rename-only change still triggers re-index |

---

## Backend domain structure

The backend is organized as a **modular monolith** with clear domain boundaries aligned to the sync pipeline:

```
backend/src/
│
├── connectors/              Stage 0: Fetch raw items from external sources
│   ├── plugin-types.ts      strict ConnectorPlugin interface contract
│   ├── registry.ts          provider registration & resolution
│   ├── google-drive.ts      Google Drive provider
│   ├── notion.ts            Notion provider
│   └── slack.ts             Slack provider
│
├── normalization/           Stage 1: Sanitize, deduplicate, upsert documents
│   ├── normalizer.ts        sanitize content, compute checksums, run dedup check
│   └── index.ts             re-export NormalizedDocument interface
│
├── chunking/                Stage 2: Split content into searchable units
│   ├── chunk-processor.ts   chunkText, calculate token counts, persist chunks
│   └── index.ts             re-export ProcessedChunk interface
│
├── indexing/                Stage 3: Write to search backends (GIN vectors)
│   ├── indexer.ts           updateSearchIndex(), finalizeSearchability()
│   └── index.ts             re-export index functions
│
├── permissions/             Stage 4: Resolve and attach ACL metadata
│   ├── permission-resolver.ts  resolveDocumentPermissions(), validateAndAttachPermissions()
│   └── index.ts             re-export PermissionEntry, ResolvedPermissions types
│
├── workers/                 Job orchestration & scheduling
│   ├── processor.ts         process{Enumerate,Document,Finalize}Job() with typed errors
│   ├── scheduler.ts         dispatchDueSyncs() every 30s
│   ├── index.ts             BullMQ Worker setup, job routing
│   └── queue.ts             BullMQ queue instance
│
├── routes/                  HTTP endpoints (one file per resource)
│   ├── auth.ts              login, register, refresh, logout
│   ├── connectors.ts        OAuth setup, list, pause/resume, manual sync
│   ├── oauth.ts             OAuth callback handler
│   ├── documents.ts         list documents with filters
│   ├── search.ts            full-text + fuzzy search
│   └── orgs.ts              multi-tenant org management
│
├── services/
│   ├── indexer.ts           facade: ingestCanonicalDocument() → calls pipeline stages
│   ├── search-service.ts    fullTextSearch() with fallback
│   ├── auth-service.ts      JWT, session, refresh logic
│   └── …
│
├── middleware/
│   └── auth.ts              requireCurrentUser, getCurrentMembership, requireRole
│
├── sql/                     All SQL as typed constants & builders
│   ├── schema.ts            CREATE TABLE, CREATE INDEX (idempotent)
│   ├── search.ts            FTS, fuzzy, count queries
│   ├── documents.ts         list/count queries w/ filters
│   ├── indexer.ts           upsert document, chunk CRUD, search_vector updates
│   ├── connectors.ts        connector CRUD
│   ├── checkpoints.ts       connector_sync_state select/upsert
│   ├── sync-jobs.ts         sync_jobs lifecycle, counters
│   └── …
│
├── types/
│   ├── document-envelope.ts  CanonicalDocumentEnvelope — 23-field standard doc model
│   ├── sync-errors.ts       SyncPipelineError, SyncErrorCode enum
│   ├── connector.ts         ConnectorConfig, ConnectorDocument
│   ├── db.ts               DocRow, ChunkRow, ConnectorRow
│   └── …
│
└── utils/
    ├── chunker.ts           chunkText(), approximateTokenCount()
    ├── security.ts          sha256(), encrypt/decryptCredentials()
    ├── logger.ts            structured logging
    └── …
```

### Pipeline stages (intake to search)

Each stage owns its inputs, outputs, and error handling:

| Stage | Input | Output | Module | Responsibility |
|-------|-------|--------|--------|---|
| 0 — Fetch | ConnectorPlugin | CanonicalDocumentEnvelope | `connectors/` | Raw item enumeration, OAuth, rate limits |
| 1 — Normalize | CanonicalDocumentEnvelope | NormalizedDocument | `normalization/` | Content sanitization, checksum, dedup check |
| 2 — Chunk | NormalizedDocument | ProcessedChunk[] | `chunking/` | Text splitting, token counting, persistence |
| 3 — Index | ProcessedChunk[] | void | `indexing/` | GIN vector update, full-text indexing |
| 4 — Permissions | CanonicalDocumentEnvelope | ResolvedPermissions | `permissions/` | ACL metadata, org-level visibility checks |

---

## Codebase map
