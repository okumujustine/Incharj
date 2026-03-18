# Architecture

Incharj has one job: connect to external knowledge sources, index their content, and make it searchable. Everything in the codebase exists to serve that loop.

---

## The core loop

```
External source          Worker process              PostgreSQL
(Google Drive,    ──►   Connector                  ┌─────────────────┐
 Notion, Slack)         listDocuments()  ──────────►│ connectors      │
                        fetchContent()              │ sync_jobs       │
                              │                     │ documents       │
                              ▼                     │ document_chunks │
                         Indexer                    └────────┬────────┘
                         ingestDocument()                    │
                              │                             GIN
                              └──── search_vector ──────────►│
                                    (pre-computed)           │
                                                   ┌─────────▼────────┐
                                    API ◄──────────│  Search engine   │
                                    query          └──────────────────┘
```

Three processes share the same PostgreSQL database:

| Process | Role |
|---|---|
| **API** (Fastify) | Handles HTTP requests — auth, connectors, search, documents |
| **Worker** (BullMQ) | Runs sync jobs — fetches, indexes, updates search vectors |
| **Redis** | Job queue only — BullMQ stores pending and running sync jobs |

---

## How a sync happens

A **dispatch job** runs every 30 seconds and finds connectors where `last_synced_at + sync_frequency < now()`. For each due connector it creates a `sync_jobs` row (status = `pending`) and enqueues a `"sync"` job to Redis.

The **sync worker** (concurrency = 1) picks up the job and calls `runSync()`:

```
1. Decrypt OAuth credentials (AES-GCM)
2. Refresh access token if expired
3. connector.listDocuments()  ← async generator, incremental via last_synced_at
4. for each doc:
     connector.fetchContent()
     ingestDocument()          ← own transaction, failure is isolated
5. Update connectors.doc_count + last_synced_at
```

See [Indexer](./indexer) for what happens inside `ingestDocument()`.

---

## How a search happens

```
Browser → GET /orgs/:slug/search?q=product+roadmap
              │
              ▼
         Stop word check  ← websearch_to_tsquery empty? → return [] immediately
              │
              ▼
         FTS query        ← search_vector @@ tsq  (GIN index, no table scan)
              │
         total > 0? ──yes──► rank + snippet → return
              │
             no
              ▼
         Fuzzy query      ← similarity(title, q) > 0.1  (GIN trgm index)
              │
              ▼
         return results
```

See [Search](./search) for the full ranking formula and scoring details.

---

## Multi-tenancy

Every table that holds user data carries an `org_id` column. All queries — search, documents, connectors — are filtered by `org_id` before anything else. The API middleware resolves the org from the URL slug and verifies the caller is a member before allowing any data access.

---

## Key constraints that shaped the design

**Pre-computed search vectors** — `to_tsvector()` is called at index time, not query time. Two GIN indexes (`ix_documents_search_vector`, `ix_chunks_search_vector`) let the search query skip the tokenisation step entirely.

**Per-document transactions** — each call to `ingestDocument()` runs in its own `BEGIN / COMMIT`. A malformed PDF or a network hiccup on one document is counted as `docs_errored` and the sync continues.

**Incremental sync at the source** — connectors filter changed documents using the source API's own query parameters (e.g. Google Drive `modifiedTime >`). Only genuinely new or changed documents reach the indexer.

**Content hash includes title** — `SHA-256(title::content)` means a rename with no body change still triggers re-index. Without the title in the hash, renames would be silently ignored.
